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
  onGetCurrentUrl?: () => string | null;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const XOR_KEYS = [0x5A, 0x3F, 0x71, 0xA2, 0x1D, 0xE8, 0x4C, 0x93];

function obfuscateUrl(url: string): string {
  const reversed = url.split("").reverse().join("");
  const xored = Array.from(reversed)
    .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEYS[i % XOR_KEYS.length]))
    .join("");
  return btoa(xored);
}

function deobfuscateUrl(encoded: string): string {
  try {
    const decoded = atob(encoded);
    const unxored = Array.from(decoded)
      .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEYS[i % XOR_KEYS.length]))
      .join("");
    return unxored.split("").reverse().join("");
  } catch { return ""; }
}

function makeUrlAccessor(encoded: string): () => string {
  const created = Date.now();
  const TTL = 3_600_000;
  return () => {
    if (Date.now() - created > TTL) throw new Error("Stream token expired");
    return deobfuscateUrl(encoded);
  };
}

function sealAsHidden(obj: object, key: string, displayValue: string) {
  try {
    Object.defineProperty(obj, key, {
      get: () => displayValue,
      set: () => {},
      enumerable: false,
      configurable: false,
    });
  } catch { /* read-only env — skip */ }
}

export default function VideoPlayer({
  src, tracks, intro, outro, onTimeUpdate, onEnded,
  startTime, ambientMode = false, autoPlayNext = true, onAutoPlayToggle,
}: Props) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const hlsRef       = useRef<Hls | null>(null);

  const previewVideoRef  = useRef<HTMLVideoElement>(null);
  const previewHlsRef    = useRef<Hls | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewSeekTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastPreviewSeek  = useRef<number>(-999);
  const previewSeeking   = useRef(false);
  const [previewReady, setPreviewReady] = useState(false);

  const encodedSrc = useRef(obfuscateUrl(src));
  const getUrl     = useRef(makeUrlAccessor(encodedSrc.current));

  const [playing, setPlaying]         = useState(false);
  const [muted, setMuted]             = useState(false);
  const [volume, setVolume]           = useState(1);
  const [currentTime, setCurrent]     = useState(0);
  const [duration, setDuration]       = useState(0);
  const [buffered, setBuffered]       = useState(0);
  const [fullscreen, setFullscreen]   = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<"main"|"speed"|"caption"|"quality">("main");
  const [speed, setSpeed]             = useState(1);
  const [captionsOn, setCaptionsOn]   = useState(true);
  const [activeTrackIdx, setActiveTrackIdx] = useState(0);
  const [ambientEnabled, setAmbientEnabled] = useState(ambientMode);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showCenterIcon, setShowCenterIcon] = useState<"play"|"pause"|"ff"|"rw"|"2x"|null>(null);
  const [longPressActive, setLongPressActive] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [hoverTime, setHoverTime]     = useState<number | null>(null);
  const [hoverPct, setHoverPct]       = useState(0);
  const [previewHasFrame, setPreviewHasFrame] = useState(false);
  const [isSeeking, setIsSeeking]     = useState(false);

  const volumeFill = muted ? 0 : volume * 100;

  const hideTimer       = useRef<ReturnType<typeof setTimeout>>();
  const ambientFrameRef = useRef<number>();
  const centerIconTimer = useRef<ReturnType<typeof setTimeout>>();
  const doubleTapTimer  = useRef<ReturnType<typeof setTimeout>>();
  const tapCount        = useRef(0);
  const longPressTimer  = useRef<ReturnType<typeof setTimeout>>();
  const spaceHeld       = useRef(false);
  const spaceWas2x      = useRef(false);
  const touchStartTime  = useRef(0);
  const touchMoved      = useRef(false);

  useEffect(() => {
    encodedSrc.current = obfuscateUrl(src);
    getUrl.current     = makeUrlAccessor(encodedSrc.current);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const prevent = (e: Event) => e.preventDefault();
    video.addEventListener("contextmenu", prevent);
    return () => video.removeEventListener("contextmenu", prevent);
  }, []);

  // ── Main HLS ─────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    let realSrc: string;
    try { realSrc = getUrl.current(); } catch { return; }
    if (!video || !realSrc) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 15, maxMaxBufferLength: 60,
        startPosition: startTime || -1, enableWorker: true,
        lowLatencyMode: false, abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7,
        xhrSetup: (xhr) => { xhr.withCredentials = false; },
      });
      hls.loadSource(realSrc);
      hls.attachMedia(video);
      sealAsHidden(video, "_streamUrl", "[protected]");
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

  // ── Preview HLS ───────────────────────────────────────────────────────
  useEffect(() => {
    const preview = previewVideoRef.current;
    let realSrc: string;
    try { realSrc = getUrl.current(); } catch { return; }
    if (!preview || !realSrc) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 4,
        maxMaxBufferLength: 10,
        startPosition: -1,
        enableWorker: false,
        startLevel: 0,
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
  }, [src]);

  // Draw preview frame to canvas on seeked
  useEffect(() => {
    const preview = previewVideoRef.current;
    if (!preview) return;
    const onSeeked = () => {
      previewSeeking.current = false;
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
        setPreviewHasFrame(true);
      }
    };
    preview.addEventListener("seeked", onSeeked);
    return () => preview.removeEventListener("seeked", onSeeked);
  }, []);

  // Buffering
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const on  = () => setIsBuffering(true);
    const off = () => setIsBuffering(false);
    video.addEventListener("waiting", on);
    video.addEventListener("playing", off);
    video.addEventListener("canplay", off);
    return () => { video.removeEventListener("waiting", on); video.removeEventListener("playing", off); video.removeEventListener("canplay", off); };
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

  // ── Keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (spaceHeld.current) return;
        spaceHeld.current = true;
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
      if (e.code === "ArrowLeft")  { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); flashCenter("rw"); }
      if (e.code === "ArrowUp")    { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); setVolume(v.volume); setMuted(false); v.muted = false; }
      if (e.code === "ArrowDown")  { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); setVolume(v.volume); }
      if (e.code === "KeyF") toggleFullscreen();
      if (e.code === "KeyM") toggleMute();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      const wasHoldFor2x = spaceWas2x.current;
      spaceHeld.current  = false;
      spaceWas2x.current = false;

      const v = videoRef.current;
      if (wasHoldFor2x) {
        if (v) v.playbackRate = speed;
        setLongPressActive(false);
      } else {
        if (v) {
          if (v.paused) { v.play(); setPlaying(true); flashCenter("play"); }
          else          { v.pause(); setPlaying(false); flashCenter("pause"); }
        }
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
    v.muted  = val === 0; setMuted(val === 0);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  };

  // ── Mobile seek bar touch ──────────────────────────────────────────
  const handleSeekTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0] || e.changedTouches[0];
    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setIsSeeking(false);
  };

  const handleSeekTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    setIsSeeking(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
  };

  // ── FAST preview seek ─────────────────────────────────────────────────
  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
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
    if (!document.fullscreenElement) { containerRef.current.requestFullscreen(); setFullscreen(true); }
    else                             { document.exitFullscreen();                setFullscreen(false); }
  };

  const changeSpeed = (s: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = s;
    setSpeed(s); setSettingsPanel("main");
  };

  const changeQuality = (levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = levelIndex;
    setCurrentQuality(levelIndex); setSettingsPanel("main");
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
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000);
  };

  // ── Touch: double-tap to seek, long press for 2x ────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartTime.current = Date.now();
    touchMoved.current = false;
    // Show controls on touch
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000);

    // Long press for 2x — only start timer, don't activate yet
    longPressTimer.current = setTimeout(() => {
      if (touchMoved.current) return;
      const v = videoRef.current;
      if (v) { v.playbackRate = 2; setLongPressActive(true); flashCenter("2x"); }
    }, 500);
  };

  const handleTouchMove = () => {
    touchMoved.current = true;
    // Cancel long press if finger moves
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    // Release 2x speed
    if (longPressActive) {
      const v = videoRef.current;
      if (v) v.playbackRate = speed;
      setLongPressActive(false);
      return;
    }

    // If moved, ignore (was scrolling/seeking)
    if (touchMoved.current) return;

    const elapsed = Date.now() - touchStartTime.current;
    if (elapsed > 400) return; // Was a long press attempt

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !videoRef.current) return;
    const x = e.changedTouches[0].clientX - rect.left;

    tapCount.current++;
    if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
    doubleTapTimer.current = setTimeout(() => {
      if (tapCount.current === 1) {
        // Single tap: toggle play/pause
        togglePlay();
      }
      tapCount.current = 0;
    }, 250);

    if (tapCount.current >= 2) {
      tapCount.current = 0;
      if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
      const v = videoRef.current;
      if      (x < rect.width / 3)       { v.currentTime = Math.max(0, v.currentTime - 10);          flashCenter("rw"); }
      else if (x > rect.width * 2 / 3)   { v.currentTime = Math.min(v.duration, v.currentTime + 10); flashCenter("ff"); }
    }
  };

  const subtitleTracks = tracks?.filter(t => t.kind === "captions" || t.kind === "subtitles") || [];
  const progress    = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered   / duration) * 100 : 0;

  const qualityLabel = (idx: number) => {
    if (idx === -1) return "Auto";
    const lvl = qualityLevels[idx];
    if (!lvl) return "Auto";
    return lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`;
  };

  const PREVIEW_W = 160;
  const previewLeft = `clamp(${PREVIEW_W / 2}px, ${hoverPct}%, calc(100% - ${PREVIEW_W / 2}px))`;

  return (
    <div className="relative">
      {ambientEnabled && (
        <canvas ref={canvasRef} className="absolute -inset-8 w-[calc(100%+4rem)] h-[calc(100%+4rem)] opacity-50 blur-3xl scale-110 pointer-events-none -z-10 rounded-3xl" />
      )}

      {/* Hidden preview video */}
      <video ref={previewVideoRef} className="hidden" muted playsInline preload="auto" />

      <div
        ref={containerRef}
        className="relative w-full aspect-video bg-black rounded-xl overflow-hidden select-none group/player"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { if (playing) { setShowControls(false); setSettingsOpen(false); } }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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

        {/* Center flash icon */}
        <AnimatePresence>
          {showCenterIcon && (
            <motion.div
              key="center-icon"
              initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.5 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                {showCenterIcon === "play"  && <Play       className="w-8 h-8 sm:w-10 sm:h-10 text-white" />}
                {showCenterIcon === "pause" && <Pause      className="w-8 h-8 sm:w-10 sm:h-10 text-white" />}
                {showCenterIcon === "ff"    && <SkipForward className="w-8 h-8 sm:w-10 sm:h-10 text-white" />}
                {showCenterIcon === "rw"    && <SkipBack   className="w-8 h-8 sm:w-10 sm:h-10 text-white" />}
                {showCenterIcon === "2x"    && <Zap        className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buffering spinner — shown when buffering OR paused */}
        {(isBuffering || (!playing && currentTime > 0)) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            {isBuffering ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <span className="text-xs text-white/70 font-medium">Buffering...</span>
              </div>
            ) : !playing && !showCenterIcon ? (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-8 h-8 sm:w-10 sm:h-10 text-white/80 ml-1" />
              </div>
            ) : null}
          </div>
        )}

        {/* 2× badge */}
        <AnimatePresence>
          {longPressActive && (
            <motion.div
              key="2x-badge"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur border border-primary/50 text-primary text-sm font-bold z-20 shadow-lg"
            >
              <Zap className="w-4 h-4" /> 2× Speed
            </motion.div>
          )}
        </AnimatePresence>

        {/* Skip Intro */}
        <AnimatePresence>
          {showSkipIntro && (
            <motion.button key="skip-intro" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              onClick={() => { if (videoRef.current && intro) videoRef.current.currentTime = intro.end; }}
              className="absolute bottom-24 sm:bottom-20 right-3 sm:right-4 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-bold hover:scale-105 transition-transform z-10 flex items-center gap-2 shadow-glow">
              <SkipForward className="w-4 h-4" /> Skip Intro
            </motion.button>
          )}
        </AnimatePresence>

        {/* Skip Outro */}
        <AnimatePresence>
          {showSkipOutro && (
            <motion.button key="skip-outro" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              onClick={() => { if (videoRef.current && outro) videoRef.current.currentTime = outro.end; }}
              className="absolute bottom-24 sm:bottom-20 right-3 sm:right-4 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-bold hover:scale-105 transition-transform z-10 flex items-center gap-2 shadow-glow">
              <SkipForward className="w-4 h-4" /> Skip Outro
            </motion.button>
          )}
        </AnimatePresence>

        {/* Settings popup */}
        <AnimatePresence>
          {settingsOpen && showControls && (
            <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-20 sm:bottom-16 right-2 sm:right-4 w-52 sm:w-56 bg-card/95 backdrop-blur-lg border border-border rounded-xl shadow-xl overflow-hidden z-30">
              {settingsPanel === "main" && (
                <div className="py-1">
                  <button onClick={() => setSettingsPanel("speed")} className="flex items-center justify-between w-full px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors active:bg-secondary">
                    <span className="flex items-center gap-2"><Gauge className="w-4 h-4" /> Speed</span>
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">{speed}x <ChevronRight className="w-3 h-3" /></span>
                  </button>
                  <button onClick={() => setSettingsPanel("caption")} className="flex items-center justify-between w-full px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors active:bg-secondary">
                    <span className="flex items-center gap-2"><Subtitles className="w-4 h-4" /> Captions</span>
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">{captionsOn ? subtitleTracks[activeTrackIdx]?.label || "On" : "Off"} <ChevronRight className="w-3 h-3" /></span>
                  </button>
                  {qualityLevels.length > 0 && (
                    <button onClick={() => setSettingsPanel("quality")} className="flex items-center justify-between w-full px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors active:bg-secondary">
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4" /> Quality</span>
                      <span className="flex items-center gap-1 text-muted-foreground text-xs">{qualityLabel(currentQuality)} <ChevronRight className="w-3 h-3" /></span>
                    </button>
                  )}
                  <button onClick={() => setAmbientEnabled(!ambientEnabled)} className="flex items-center justify-between w-full px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors active:bg-secondary">
                    <span className="flex items-center gap-2"><Sun className="w-4 h-4" /> Ambient</span>
                    <span className={`w-9 h-5 rounded-full transition-colors flex items-center ${ambientEnabled ? "bg-primary justify-end" : "bg-muted justify-start"}`}>
                      <span className="w-3.5 h-3.5 rounded-full bg-white mx-0.5 shadow" />
                    </span>
                  </button>
                  <button onClick={() => onAutoPlayToggle?.(!autoPlayNext)} className="flex items-center justify-between w-full px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors active:bg-secondary">
                    <span className="flex items-center gap-2"><SkipForward className="w-4 h-4" /> Autoplay</span>
                    <span className={`w-9 h-5 rounded-full transition-colors flex items-center ${autoPlayNext ? "bg-primary justify-end" : "bg-muted justify-start"}`}>
                      <span className="w-3.5 h-3.5 rounded-full bg-white mx-0.5 shadow" />
                    </span>
                  </button>
                </div>
              )}
              {settingsPanel === "speed" && (
                <div className="py-1">
                  <button onClick={() => setSettingsPanel("main")} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary/80">
                    <ChevronRight className="w-3 h-3 rotate-180" /> Speed
                  </button>
                  <div className="border-t border-border" />
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => changeSpeed(s)}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-secondary/80 active:bg-secondary ${speed === s ? "text-primary font-medium" : "text-foreground"}`}>
                      {s === 1 ? "Normal" : `${s}x`}
                    </button>
                  ))}
                </div>
              )}
              {settingsPanel === "caption" && (
                <div className="py-1">
                  <button onClick={() => setSettingsPanel("main")} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary/80">
                    <ChevronRight className="w-3 h-3 rotate-180" /> Captions
                  </button>
                  <div className="border-t border-border" />
                  <button onClick={() => { setCaptionsOn(false); const v = videoRef.current; if (v) for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "hidden"; setSettingsPanel("main"); }}
                    className={`w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-secondary/80 ${!captionsOn ? "text-primary font-medium" : "text-foreground"}`}>Off</button>
                  {subtitleTracks.map((t, i) => (
                    <button key={i} onClick={() => { setCaptionsOn(true); selectTrack(i); }}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-secondary/80 ${captionsOn && activeTrackIdx === i ? "text-primary font-medium" : "text-foreground"}`}>
                      {t.label || "Unknown"}
                    </button>
                  ))}
                  {subtitleTracks.length === 0 && <p className="px-4 py-2 text-xs text-muted-foreground">No captions available</p>}
                </div>
              )}
              {settingsPanel === "quality" && (
                <div className="py-1">
                  <button onClick={() => setSettingsPanel("main")} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary/80">
                    <ChevronRight className="w-3 h-3 rotate-180" /> Quality
                  </button>
                  <div className="border-t border-border" />
                  <button onClick={() => changeQuality(-1)} className={`w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-secondary/80 ${currentQuality === -1 ? "text-primary font-medium" : "text-foreground"}`}>Auto</button>
                  {qualityLevels.map((lvl, i) => (
                    <button key={i} onClick={() => changeQuality(i)}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-secondary/80 ${currentQuality === i ? "text-primary font-medium" : "text-foreground"}`}>
                      {lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`}
                      {lvl.height >= 1080 && <span className="ml-2 text-[10px] text-accent font-bold">HD</span>}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Controls overlay ─────────────────────────────────────────────── */}
        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pt-12 pb-2 sm:pb-3 px-2 sm:px-4 transition-opacity duration-300 z-20 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>

          {/* ── Seek bar ─────────────────────────────────────────────────────── */}
          <div
            className="w-full mb-2 sm:mb-3 cursor-pointer group/progress relative"
            style={{ height: "24px", display: "flex", alignItems: "center" }}
            onClick={seek}
            onMouseMove={handleProgressHover}
            onMouseLeave={handleProgressLeave}
            onTouchStart={(e) => { setIsSeeking(true); handleSeekTouch(e); }}
            onTouchMove={handleSeekTouchMove}
            onTouchEnd={(e) => { handleSeekTouch(e); e.stopPropagation(); }}
          >
            {/* Track */}
            <div className="absolute inset-x-0 h-1 sm:h-1 rounded-full bg-white/20 group-hover/progress:h-1.5 transition-all duration-150 overflow-hidden" style={{ top: "50%", transform: "translateY(-50%)" }}>
              <div className="absolute top-0 left-0 h-full bg-white/20 rounded-full transition-all duration-75" style={{ width: `${bufferedPct}%` }} />
              <div className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all duration-75" style={{ width: `${progress}%` }} />
            </div>
            {/* Thumb */}
            <div
              className="absolute w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-full bg-primary shadow-lg shadow-primary/30 opacity-100 sm:opacity-0 sm:group-hover/progress:opacity-100 transition-opacity pointer-events-none z-10 -translate-x-1/2"
              style={{ left: `${progress}%`, top: "50%", transform: `translateX(-50%) translateY(-50%)` }}
            />

            {/* ── Preview thumbnail ─────────────────────────────────────── */}
            {hoverTime !== null && (
              <div
                className="absolute bottom-7 flex flex-col items-center gap-1 pointer-events-none z-20 -translate-x-1/2 hidden sm:flex"
                style={{ left: previewLeft }}
              >
                <div className={`rounded-lg overflow-hidden border-2 border-primary/30 shadow-2xl bg-black ring-1 ring-white/10 transition-opacity duration-75 ${previewHasFrame ? "opacity-100" : "opacity-50"}`}>
                  <canvas ref={previewCanvasRef} width={160} height={90} className="block" />
                </div>
                <span className="text-[11px] text-white font-semibold px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-sm shadow tabular-nums">
                  {fmt(hoverTime)}
                </span>
              </div>
            )}
          </div>

          {/* ── Bottom row ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              {/* Skip back */}
              <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.max(0, v.currentTime - 10); flashCenter("rw"); } }}
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all rounded-full">
                <SkipBack className="w-5 h-5 sm:w-5 sm:h-5" />
              </button>
              {/* Play/Pause */}
              <button onClick={togglePlay}
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-white hover:text-white active:scale-90 transition-all rounded-full">
                {playing ? <Pause className="w-6 h-6 sm:w-5 sm:h-5" /> : <Play className="w-6 h-6 sm:w-5 sm:h-5" />}
              </button>
              {/* Skip forward */}
              <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.min(v.duration, v.currentTime + 10); flashCenter("ff"); } }}
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all rounded-full">
                <SkipForward className="w-5 h-5 sm:w-5 sm:h-5" />
              </button>

              {/* Volume — hidden on small mobile */}
              <div className="hidden sm:flex items-center gap-2 group/vol">
                <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors flex-shrink-0">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <div className="relative w-16 cursor-pointer" style={{ height: "18px", display: "flex", alignItems: "center" }}>
                  <div className="absolute inset-x-0 h-1 rounded-full bg-white/20 overflow-hidden group-hover/vol:h-1.5 transition-all" style={{ top: "50%", transform: "translateY(-50%)" }}>
                    <div className="absolute top-0 left-0 h-full bg-white rounded-full transition-all duration-75" style={{ width: `${volumeFill}%` }} />
                  </div>
                  <div className="absolute w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none z-10 -translate-x-1/2"
                    style={{ left: `${volumeFill}%`, top: "50%", transform: `translateX(-50%) translateY(-50%)` }} />
                  <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} onChange={handleVolumeChange}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer z-20" />
                </div>
              </div>

              <span className="text-[11px] sm:text-xs text-white/70 font-medium tabular-nums ml-1">
                {fmt(currentTime)} <span className="text-white/40">/</span> {fmt(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2.5">
              {speed !== 1 && <span className="text-[10px] sm:text-xs text-primary font-bold">{speed}x</span>}
              {currentQuality !== -1 && qualityLevels[currentQuality] && (
                <span className="text-[10px] sm:text-xs text-accent font-medium hidden sm:inline">{qualityLabel(currentQuality)}</span>
              )}
              {/* Mobile volume toggle */}
              <button onClick={toggleMute}
                className="sm:hidden w-9 h-9 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all rounded-full">
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <button onClick={() => { setSettingsOpen(!settingsOpen); setSettingsPanel("main"); }}
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all rounded-full">
                <Settings className="w-5 h-5" />
              </button>
              <button onClick={toggleFullscreen}
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all rounded-full">
                {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
