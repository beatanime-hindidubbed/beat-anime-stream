import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, Subtitles, Gauge, Sun, ChevronRight,
  SkipForward, SkipBack, Loader2, Layers, Zap
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface Track {
  file: string;
  label?: string;
  kind?: string;
  default?: boolean;
}

interface Props {
  src: string;
  tracks?: Track[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  onTimeUpdate?: (time: number, duration: number) => void;
  onEnded?: () => void;
  startTime?: number;
  ambientMode?: boolean;
  autoPlayNext?: boolean;
  onAutoPlayToggle?: (enabled: boolean) => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

// ─── Obfuscation helpers (keep src out of DOM) ────────────────────────────────
const XOR_KEYS = [0x5A, 0x3F, 0x71, 0xA2, 0x1D, 0xE8, 0x4C, 0x93];
function obfuscate(url: string) {
  const rev = url.split("").reverse().join("");
  return btoa(Array.from(rev).map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEYS[i % XOR_KEYS.length])).join(""));
}
function deobfuscate(enc: string) {
  try {
    const dec = atob(enc);
    const unxor = Array.from(dec).map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEYS[i % XOR_KEYS.length])).join("");
    return unxor.split("").reverse().join("");
  } catch { return ""; }
}
function makeAccessor(enc: string) {
  const created = Date.now();
  return () => {
    if (Date.now() - created > 3_600_000) throw new Error("Token expired");
    return deobfuscate(enc);
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function VideoPlayer({
  src, tracks, intro, outro, onTimeUpdate, onEnded,
  startTime, ambientMode = false, autoPlayNext = true, onAutoPlayToggle,
}: Props) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const hlsRef       = useRef<Hls | null>(null);

  // Preview thumbnail
  const previewVideoRef  = useRef<HTMLVideoElement>(null);
  const previewHlsRef    = useRef<Hls | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewSeekTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastPreviewSeek  = useRef<number>(-999);
  const previewSeeking   = useRef(false);

  // Secure URL accessors
  const encodedSrc = useRef(obfuscate(src));
  const getUrl     = useRef(makeAccessor(encodedSrc.current));

  // Playback state
  const [playing, setPlaying]       = useState(false);
  const [muted, setMuted]           = useState(false);
  const [volume, setVolume]         = useState(1);
  const [currentTime, setCurrent]   = useState(0);
  const [duration, setDuration]     = useState(0);
  const [buffered, setBuffered]     = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<"main"|"speed"|"caption"|"quality">("main");
  const [speed, setSpeed]           = useState(1);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [activeTrackIdx, setActiveTrackIdx] = useState(0);
  const [ambientEnabled, setAmbientEnabled] = useState(ambientMode);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showCenterIcon, setShowCenterIcon] = useState<"play"|"pause"|"ff"|"rw"|"2x"|null>(null);
  const [longPressActive, setLongPressActive] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [hoverTime, setHoverTime]   = useState<number | null>(null);
  const [hoverPct, setHoverPct]     = useState(0);
  const [previewHasFrame, setPreviewHasFrame] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [isMobile, setIsMobile]     = useState(false);

  // Timer refs
  const hideTimer       = useRef<ReturnType<typeof setTimeout>>();
  const ambientFrameRef = useRef<number>();
  const centerIconTimer = useRef<ReturnType<typeof setTimeout>>();
  const doubleTapTimer  = useRef<ReturnType<typeof setTimeout>>();
  const tapCount        = useRef(0);
  const longPressTimer  = useRef<ReturnType<typeof setTimeout>>();
  const spaceHeld       = useRef(false);
  const spaceWas2x      = useRef(false);
  const touchStartTime  = useRef(0);
  const touchStartPos   = useRef({ x: 0, y: 0 });
  const touchMoved      = useRef(false);
  // Track whether the current touch started on the seek bar
  const touchOnSeekBar  = useRef(false);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 768px) or (pointer: coarse)").matches);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Re-encode when src changes
  useEffect(() => {
    encodedSrc.current = obfuscate(src);
    getUrl.current     = makeAccessor(encodedSrc.current);
  }, [src]);

  // Block right-click on video
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const prevent = (e: Event) => e.preventDefault();
    v.addEventListener("contextmenu", prevent);
    return () => v.removeEventListener("contextmenu", prevent);
  }, []);

  // ── Main HLS ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    let realSrc: string;
    try { realSrc = getUrl.current(); } catch { return; }
    if (!video || !realSrc) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 20, maxMaxBufferLength: 60,
        startPosition: startTime || -1, enableWorker: true,
        lowLatencyMode: false, abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7,
        xhrSetup: (xhr) => { xhr.withCredentials = false; },
      });
      hls.loadSource(realSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        video.play().catch(() => {});
        setQualityLevels(data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })));
        setCurrentQuality(-1);
      });
      hlsRef.current = hls;
      return () => { hls.destroy(); hlsRef.current = null; };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = realSrc;
      if (startTime) video.currentTime = startTime;
      video.play().catch(() => {});
    }
  }, [src, startTime]);

  // ── Preview HLS (desktop only — skip on mobile/TV to save resources) ──────
  useEffect(() => {
    if (isMobile) return;
    const preview = previewVideoRef.current;
    let realSrc: string;
    try { realSrc = getUrl.current(); } catch { return; }
    if (!preview || !realSrc) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 4, maxMaxBufferLength: 10,
        startPosition: -1, enableWorker: false, startLevel: 0,
        capLevelToPlayerSize: false,
        xhrSetup: (xhr) => { xhr.withCredentials = false; },
      });
      hls.loadSource(realSrc);
      hls.attachMedia(preview);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hls.currentLevel = 0;
        preview.pause();
        setPreviewReady(true);
      });
      previewHlsRef.current = hls;
      return () => { hls.destroy(); previewHlsRef.current = null; setPreviewReady(false); };
    }
  }, [src, isMobile]);

  // Draw preview frame to canvas
  useEffect(() => {
    const preview = previewVideoRef.current;
    if (!preview) return;
    const onSeeked = () => {
      previewSeeking.current = false;
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.drawImage(preview, 0, 0, canvas.width, canvas.height); setPreviewHasFrame(true); }
    };
    preview.addEventListener("seeked", onSeeked);
    return () => preview.removeEventListener("seeked", onSeeked);
  }, []);

  // Buffering events
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on  = () => setIsBuffering(true);
    const off = () => setIsBuffering(false);
    v.addEventListener("waiting",  on);
    v.addEventListener("playing",  off);
    v.addEventListener("canplay",  off);
    return () => { v.removeEventListener("waiting", on); v.removeEventListener("playing", off); v.removeEventListener("canplay", off); };
  }, []);

  // Ambient canvas
  useEffect(() => {
    if (!ambientEnabled) { if (ambientFrameRef.current) cancelAnimationFrame(ambientFrameRef.current); return; }
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      if (!video.paused && !video.ended) {
        canvas.width = 16; canvas.height = 9;
        ctx.filter = "blur(2px) saturate(2)";
        ctx.drawImage(video, 0, 0, 16, 9);
      }
      ambientFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (ambientFrameRef.current) cancelAnimationFrame(ambientFrameRef.current); };
  }, [ambientEnabled]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT","TEXTAREA","SELECT"].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (spaceHeld.current) return;
        spaceHeld.current  = true;
        spaceWas2x.current = false;
        longPressTimer.current = setTimeout(() => {
          if (!spaceHeld.current) return;
          spaceWas2x.current = true;
          v.playbackRate = 2;
          setLongPressActive(true);
          flashCenter("2x");
        }, 400);
        return;
      }
      if (e.code === "ArrowRight") { e.preventDefault(); v.currentTime = Math.min(v.duration, v.currentTime + 10); flashCenter("ff"); }
      if (e.code === "ArrowLeft")  { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10);           flashCenter("rw"); }
      if (e.code === "ArrowUp")    { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); setVolume(v.volume); setMuted(false); v.muted = false; }
      if (e.code === "ArrowDown")  { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); setVolume(v.volume); }
      if (e.code === "KeyF") toggleFullscreen();
      if (e.code === "KeyM") toggleMute();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT","TEXTAREA","SELECT"].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      const was2x    = spaceWas2x.current;
      spaceHeld.current  = false;
      spaceWas2x.current = false;
      const v = videoRef.current;
      if (was2x) {
        if (v) v.playbackRate = speed;
        setLongPressActive(false);
      } else if (v) {
        if (v.paused) { v.play(); setPlaying(true); flashCenter("play"); }
        else          { v.pause(); setPlaying(false); flashCenter("pause"); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [speed]);

  const flashCenter = (icon: "play"|"pause"|"ff"|"rw"|"2x") => {
    setShowCenterIcon(icon);
    if (centerIconTimer.current) clearTimeout(centerIconTimer.current);
    centerIconTimer.current = setTimeout(() => setShowCenterIcon(null), 600);
  };

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    setDuration(v.duration || 0);
    onTimeUpdate?.(v.currentTime, v.duration);
    if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
    setShowSkipIntro(!!intro && v.currentTime >= intro.start && v.currentTime < intro.end);
    setShowSkipOutro(!!outro && v.currentTime >= outro.start && v.currentTime < outro.end);
  }, [intro, outro, onTimeUpdate]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); flashCenter("play"); }
    else          { v.pause(); setPlaying(false); flashCenter("pause"); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = Number(e.target.value);
    v.volume = val; setVolume(val);
    v.muted = val === 0; setMuted(val === 0);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  };

  // ── Seek bar touch — CRITICAL: must clear longPressTimer to prevent 2x bug ──
  const handleSeekBarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Mark that this touch started on the seek bar
    touchOnSeekBar.current = true;
    // IMPORTANT: cancel any pending long-press 2x timer from the container
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    touchMoved.current = true; // Prevent container from treating this as a tap

    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
  };

  const handleSeekBarTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    e.stopPropagation();
  };

  const handleSeekBarTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    touchOnSeekBar.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const v = videoRef.current;
    if (!v || !duration) return;
    const touch = e.changedTouches[0];
    if (touch) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      v.currentTime = pct * duration;
    }
    e.stopPropagation();
  };

  // ── Preview thumbnail hover (desktop only) ────────────────────────────────
  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || isMobile) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t    = pct * duration;
    setHoverTime(t);
    setHoverPct(pct * 100);

    if (!previewReady || !previewVideoRef.current) return;
    if (Math.abs(lastPreviewSeek.current - t) < 0.3) return;
    if (previewSeeking.current) {
      if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
      previewSeekTimer.current = setTimeout(() => {
        const pv = previewVideoRef.current;
        if (!pv) return;
        lastPreviewSeek.current = t;
        previewSeeking.current  = true;
        pv.currentTime = t;
      }, 20);
      return;
    }
    if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
    lastPreviewSeek.current = t;
    previewSeeking.current  = true;
    previewVideoRef.current.currentTime = t;
  };

  const handleProgressLeave = () => {
    setHoverTime(null);
    if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) containerRef.current.requestFullscreen();
    else document.exitFullscreen();
  };

  const changeSpeed = (s: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = s;
    setSpeed(s); setSettingsPanel("main");
  };

  const changeQuality = (idx: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = idx;
    setCurrentQuality(idx); setSettingsPanel("main");
  };

  const selectTrack = (idx: number) => {
    const v = videoRef.current;
    if (!v) return;
    setActiveTrackIdx(idx);
    for (let i = 0; i < v.textTracks.length; i++)
      v.textTracks[i].mode = captionsOn && i === idx ? "showing" : "hidden";
    setSettingsPanel("main");
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${m}:${String(sec).padStart(2,"0")}`;
  };

  const resetHideTimer = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3500);
  };

  // ── Touch: double-tap to seek, long-press for 2x ─────────────────────────
  const handleContainerTouchStart = (e: React.TouchEvent) => {
    // If touch is on the seek bar area, don't start longPress timer
    if (touchOnSeekBar.current) return;

    touchStartTime.current = Date.now();
    touchStartPos.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchMoved.current     = false;
    resetHideTimer();

    // Long press for 2× speed — only starts timer here
    longPressTimer.current = setTimeout(() => {
      if (touchMoved.current || touchOnSeekBar.current) return;
      const v = videoRef.current;
      if (v) { v.playbackRate = 2; setLongPressActive(true); flashCenter("2x"); }
    }, 600); // Slightly longer than before to reduce accidental triggers
  };

  const handleContainerTouchMove = (e: React.TouchEvent) => {
    const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
    if (dx > 8 || dy > 8) {
      touchMoved.current = true;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    }
  };

  const handleContainerTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    if (longPressActive) {
      const v = videoRef.current;
      if (v) v.playbackRate = speed;
      setLongPressActive(false);
      return;
    }

    if (touchMoved.current) return;
    if (touchOnSeekBar.current) return;

    const elapsed = Date.now() - touchStartTime.current;
    if (elapsed > 500) return; // was a long press attempt, not a tap

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !videoRef.current) return;
    const x = e.changedTouches[0].clientX - rect.left;

    tapCount.current++;
    if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
    doubleTapTimer.current = setTimeout(() => {
      if (tapCount.current === 1) togglePlay();
      tapCount.current = 0;
    }, 280);

    if (tapCount.current >= 2) {
      tapCount.current = 0;
      if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
      const v = videoRef.current;
      if      (x < rect.width / 3)     { v.currentTime = Math.max(0, v.currentTime - 10);          flashCenter("rw"); }
      else if (x > rect.width * 2 / 3) { v.currentTime = Math.min(v.duration, v.currentTime + 10); flashCenter("ff"); }
    }
  };

  const subtitleTracks = tracks?.filter(t => t.kind === "captions" || t.kind === "subtitles") || [];
  const progress    = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered   / duration) * 100 : 0;
  const volumeFill  = muted ? 0 : volume * 100;

  const qualityLabel = (idx: number) => {
    if (idx === -1) return "Auto";
    const lvl = qualityLevels[idx];
    if (!lvl) return "Auto";
    return lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`;
  };

  const PREVIEW_W = 160;
  const previewLeft = `clamp(${PREVIEW_W / 2}px, ${hoverPct}%, calc(100% - ${PREVIEW_W / 2}px))`;

  // Settings panel position: fixed on mobile (escapes overflow-hidden), absolute on desktop
  const settingsPositionClass = isMobile
    ? "fixed bottom-24 right-3 z-[200]"
    : "absolute bottom-20 right-3 z-30";

  return (
    <div className="relative">
      {/* Ambient glow */}
      {ambientEnabled && (
        <canvas ref={canvasRef}
          className="absolute -inset-8 w-[calc(100%+4rem)] h-[calc(100%+4rem)] opacity-40 blur-3xl scale-110 pointer-events-none -z-10 rounded-3xl" />
      )}

      {/* Hidden preview video (desktop only) */}
      {!isMobile && <video ref={previewVideoRef} className="hidden" muted playsInline preload="auto" />}

      <div
        ref={containerRef}
        className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden select-none"
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)" }}
        onMouseMove={resetHideTimer}
        onMouseLeave={() => { if (playing) { setShowControls(false); setSettingsOpen(false); } }}
        onTouchStart={handleContainerTouchStart}
        onTouchMove={handleContainerTouchMove}
        onTouchEnd={handleContainerTouchEnd}
      >
        <video
          ref={videoRef}
          className="w-full h-full"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => onEnded?.()}
          onClick={togglePlay}
          crossOrigin="anonymous"
          playsInline
          controlsList="nodownload noremoteplayback"
        >
          {subtitleTracks.map((t, i) => (
            <track key={i} src={t.file} label={t.label || "Unknown"} kind="subtitles" default={t.default} />
          ))}
        </video>

        {/* ── Center flash icon ─────────────────────────────────────────── */}
        <AnimatePresence>
          {showCenterIcon && (
            <motion.div key="ci"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.4 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-2xl">
                {showCenterIcon === "play"  && <Play        className="w-8 h-8 sm:w-10 sm:h-10 text-white ml-0.5" />}
                {showCenterIcon === "pause" && <Pause       className="w-8 h-8 sm:w-10 sm:h-10 text-white" />}
                {showCenterIcon === "ff"    && <SkipForward className="w-8 h-8 sm:w-10 sm:h-10 text-white" />}
                {showCenterIcon === "rw"    && <SkipBack    className="w-8 h-8 sm:w-10 sm:h-10 text-white" />}
                {showCenterIcon === "2x"    && <Zap         className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Buffering / Paused overlay ────────────────────────────────── */}
        {(isBuffering || (!playing && currentTime > 0 && !showCenterIcon)) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            {isBuffering ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-primary animate-spin" />
                </div>
                <span className="text-xs text-white/60 font-medium">Buffering…</span>
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center">
                <Play className="w-8 h-8 text-white/80 ml-1" />
              </div>
            )}
          </div>
        )}

        {/* ── 2× badge ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {longPressActive && (
            <motion.div key="2xbadge"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/70 backdrop-blur border border-primary/40 text-primary text-sm font-bold z-20 shadow-lg"
            >
              <Zap className="w-4 h-4" /> 2× Speed
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Skip Intro / Outro ────────────────────────────────────────── */}
        <AnimatePresence>
          {showSkipIntro && (
            <motion.button key="skip-intro"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              onClick={() => { if (videoRef.current && intro) videoRef.current.currentTime = intro.end; }}
              className="absolute bottom-24 sm:bottom-20 right-3 sm:right-4 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-transform z-10 flex items-center gap-2 shadow-lg"
            >
              <SkipForward className="w-4 h-4" /> Skip Intro
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showSkipOutro && (
            <motion.button key="skip-outro"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              onClick={() => { if (videoRef.current && outro) videoRef.current.currentTime = outro.end; }}
              className="absolute bottom-24 sm:bottom-20 right-3 sm:right-4 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-transform z-10 flex items-center gap-2 shadow-lg"
            >
              <SkipForward className="w-4 h-4" /> Skip Outro
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Settings panel ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {settingsOpen && showControls && (
            <motion.div key="settings"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className={`${settingsPositionClass} w-52 sm:w-56 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden`}
            >
              {settingsPanel === "main" && (
                <div className="py-1.5">
                  {[
                    { label: "Speed", icon: Gauge, value: `${speed}x`, action: () => setSettingsPanel("speed") },
                    { label: "Captions", icon: Subtitles, value: captionsOn ? subtitleTracks[activeTrackIdx]?.label || "On" : "Off", action: () => setSettingsPanel("caption") },
                  ].map(item => (
                    <button key={item.label} onClick={item.action}
                      className="flex items-center justify-between w-full px-4 py-3 text-sm text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors">
                      <span className="flex items-center gap-2.5">
                        <item.icon className="w-4 h-4 text-white/50" /> {item.label}
                      </span>
                      <span className="flex items-center gap-1 text-white/40 text-xs">{item.value} <ChevronRight className="w-3 h-3" /></span>
                    </button>
                  ))}
                  {qualityLevels.length > 0 && (
                    <button onClick={() => setSettingsPanel("quality")}
                      className="flex items-center justify-between w-full px-4 py-3 text-sm text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors">
                      <span className="flex items-center gap-2.5"><Layers className="w-4 h-4 text-white/50" /> Quality</span>
                      <span className="flex items-center gap-1 text-white/40 text-xs">{qualityLabel(currentQuality)} <ChevronRight className="w-3 h-3" /></span>
                    </button>
                  )}
                  {/* Toggles */}
                  {[
                    { label: "Ambient", icon: Sun, value: ambientEnabled, toggle: () => setAmbientEnabled(!ambientEnabled) },
                    { label: "Autoplay", icon: SkipForward, value: autoPlayNext, toggle: () => onAutoPlayToggle?.(!autoPlayNext) },
                  ].map(item => (
                    <button key={item.label} onClick={item.toggle}
                      className="flex items-center justify-between w-full px-4 py-3 text-sm text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors">
                      <span className="flex items-center gap-2.5"><item.icon className="w-4 h-4 text-white/50" /> {item.label}</span>
                      <span className={`w-9 h-5 rounded-full transition-colors flex items-center ${item.value ? "bg-primary justify-end" : "bg-white/20 justify-start"}`}>
                        <span className="w-3.5 h-3.5 rounded-full bg-white mx-0.5 shadow" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {settingsPanel === "speed" && (
                <div className="py-1.5">
                  <button onClick={() => setSettingsPanel("main")}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-white/50 hover:bg-white/10">
                    <ChevronRight className="w-3 h-3 rotate-180" /> Speed
                  </button>
                  <div className="border-t border-white/10 mt-1" />
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => changeSpeed(s)}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-white/10 transition-colors ${speed === s ? "text-primary font-semibold" : "text-white/80"}`}>
                      {s === 1 ? "Normal" : `${s}×`}
                    </button>
                  ))}
                </div>
              )}
              {settingsPanel === "caption" && (
                <div className="py-1.5">
                  <button onClick={() => setSettingsPanel("main")}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-white/50 hover:bg-white/10">
                    <ChevronRight className="w-3 h-3 rotate-180" /> Captions
                  </button>
                  <div className="border-t border-white/10 mt-1" />
                  <button onClick={() => {
                    setCaptionsOn(false);
                    const v = videoRef.current;
                    if (v) for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "hidden";
                    setSettingsPanel("main");
                  }} className={`w-full px-4 py-2.5 text-sm text-left hover:bg-white/10 ${!captionsOn ? "text-primary font-semibold" : "text-white/80"}`}>
                    Off
                  </button>
                  {subtitleTracks.map((t, i) => (
                    <button key={i} onClick={() => { setCaptionsOn(true); selectTrack(i); }}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-white/10 ${captionsOn && activeTrackIdx === i ? "text-primary font-semibold" : "text-white/80"}`}>
                      {t.label || "Unknown"}
                    </button>
                  ))}
                  {subtitleTracks.length === 0 && <p className="px-4 py-2 text-xs text-white/30">No captions available</p>}
                </div>
              )}
              {settingsPanel === "quality" && (
                <div className="py-1.5">
                  <button onClick={() => setSettingsPanel("main")}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-white/50 hover:bg-white/10">
                    <ChevronRight className="w-3 h-3 rotate-180" /> Quality
                  </button>
                  <div className="border-t border-white/10 mt-1" />
                  <button onClick={() => changeQuality(-1)}
                    className={`w-full px-4 py-2.5 text-sm text-left hover:bg-white/10 ${currentQuality === -1 ? "text-primary font-semibold" : "text-white/80"}`}>
                    Auto
                  </button>
                  {qualityLevels.map((lvl, i) => (
                    <button key={i} onClick={() => changeQuality(i)}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-white/10 ${currentQuality === i ? "text-primary font-semibold" : "text-white/80"}`}>
                      {lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`}
                      {lvl.height >= 1080 && <span className="ml-2 text-[10px] text-accent font-bold">HD</span>}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════════
            CONTROLS OVERLAY — beautiful glassmorphism design
            ══════════════════════════════════════════════════════════════════ */}
        <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 z-20 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          {/* Gradient fade */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />

          <div className="relative px-3 sm:px-5 pb-3 sm:pb-4 pt-10">
            {/* ── Seek bar ─────────────────────────────────────────────── */}
            <div
              className="w-full mb-3 sm:mb-4 cursor-pointer group/progress relative"
              style={{ height: "28px", display: "flex", alignItems: "center" }}
              onClick={seek}
              onMouseMove={handleProgressHover}
              onMouseLeave={handleProgressLeave}
              onTouchStart={handleSeekBarTouchStart}
              onTouchMove={handleSeekBarTouchMove}
              onTouchEnd={handleSeekBarTouchEnd}
            >
              {/* Track background */}
              <div className="absolute inset-x-0 rounded-full bg-white/15 group-hover/progress:bg-white/20 transition-all duration-150 overflow-hidden"
                style={{ height: "4px", top: "50%", transform: "translateY(-50%)" }}>
                {/* Buffered */}
                <div className="absolute top-0 left-0 h-full bg-white/25 rounded-full"
                  style={{ width: `${bufferedPct}%`, transition: "width 0.5s linear" }} />
                {/* Played — gradient */}
                <div className="absolute top-0 left-0 h-full rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
                    transition: "width 0.1s linear",
                    boxShadow: "0 0 8px hsl(var(--primary) / 0.6)",
                  }} />
              </div>

              {/* Thumb */}
              <div className="absolute rounded-full pointer-events-none transition-opacity"
                style={{
                  width: "14px", height: "14px",
                  left: `${progress}%`,
                  top: "50%", transform: "translateX(-50%) translateY(-50%)",
                  background: "hsl(var(--primary))",
                  boxShadow: "0 0 0 3px rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.6)",
                  opacity: showControls ? 1 : 0,
                }}
              />

              {/* ── Preview thumbnail (desktop) ────────────────────────── */}
              {!isMobile && hoverTime !== null && (
                <div
                  className="absolute bottom-7 flex-col items-center gap-1 pointer-events-none z-20 -translate-x-1/2 hidden sm:flex"
                  style={{ left: previewLeft }}
                >
                  <div className={`rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-black transition-opacity duration-75 ${previewHasFrame ? "opacity-100" : "opacity-50"}`}
                    style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.8)" }}>
                    <canvas ref={previewCanvasRef} width={160} height={90} className="block" />
                  </div>
                  <span className="text-[11px] text-white font-semibold px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-sm shadow tabular-nums">
                    {fmt(hoverTime)}
                  </span>
                </div>
              )}
            </div>

            {/* ── Bottom controls row ───────────────────────────────────── */}
            <div className="flex items-center justify-between gap-1">
              {/* Left group */}
              <div className="flex items-center gap-1 sm:gap-2">
                {/* Skip back */}
                <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.max(0, v.currentTime - 10); flashCenter("rw"); } }}
                  className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all rounded-full hover:bg-white/10">
                  <SkipBack className="w-5 h-5" />
                </button>

                {/* Play/Pause */}
                <button onClick={togglePlay}
                  className="w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center text-white hover:text-white active:scale-90 transition-all rounded-full hover:bg-white/10">
                  {playing
                    ? <Pause className="w-6 h-6 sm:w-5 sm:h-5" />
                    : <Play  className="w-6 h-6 sm:w-5 sm:h-5 ml-0.5" />}
                </button>

                {/* Skip forward */}
                <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.min(v.duration, v.currentTime + 10); flashCenter("ff"); } }}
                  className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all rounded-full hover:bg-white/10">
                  <SkipForward className="w-5 h-5" />
                </button>

                {/* Volume (desktop) */}
                <div className="hidden sm:flex items-center gap-1.5 group/vol">
                  <button onClick={toggleMute}
                    className="w-9 h-9 flex items-center justify-center text-white/70 hover:text-white transition-colors rounded-full hover:bg-white/10">
                    {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <div className="relative w-16 cursor-pointer" style={{ height: "20px", display: "flex", alignItems: "center" }}>
                    <div className="absolute inset-x-0 rounded-full bg-white/20 overflow-hidden group-hover/vol:bg-white/25 transition-colors"
                      style={{ height: "3px", top: "50%", transform: "translateY(-50%)" }}>
                      <div className="h-full bg-white rounded-full" style={{ width: `${volumeFill}%` }} />
                    </div>
                    <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="absolute inset-0 w-full opacity-0 cursor-pointer z-10" />
                  </div>
                </div>

                {/* Time */}
                <span className="text-[11px] sm:text-xs text-white/60 font-medium tabular-nums ml-1 hidden xs:inline">
                  {fmt(currentTime)} <span className="text-white/30">/</span> {fmt(duration)}
                </span>
              </div>

              {/* Right group */}
              <div className="flex items-center gap-1">
                {speed !== 1 && (
                  <span className="text-[10px] sm:text-xs text-primary font-bold px-1.5 py-0.5 rounded-md bg-primary/15">
                    {speed}×
                  </span>
                )}
                {currentQuality !== -1 && qualityLevels[currentQuality] && (
                  <span className="hidden sm:inline text-[10px] text-accent font-medium px-1.5 py-0.5 rounded-md bg-accent/10">
                    {qualityLabel(currentQuality)}
                  </span>
                )}

                {/* Mobile volume toggle */}
                <button onClick={toggleMute}
                  className="sm:hidden w-10 h-10 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all rounded-full hover:bg-white/10">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>

                {/* Settings */}
                <button
                  onClick={() => { setSettingsOpen(!settingsOpen); setSettingsPanel("main"); }}
                  className={`w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all rounded-full hover:bg-white/10 ${settingsOpen ? "text-primary bg-primary/15" : ""}`}>
                  <Settings className={`w-5 h-5 transition-transform ${settingsOpen ? "rotate-45" : ""}`} />
                </button>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen}
                  className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all rounded-full hover:bg-white/10">
                  {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Mobile time below controls */}
            <div className="sm:hidden flex justify-center mt-1">
              <span className="text-[10px] text-white/40 tabular-nums">
                {fmt(currentTime)} / {fmt(duration)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
