import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, Subtitles, Gauge, Sun, ChevronRight,
  SkipForward, SkipBack, Loader2, Layers, Zap,
  Camera, Repeat, Volume1, SlidersHorizontal
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import PlayerWatermark from "./PlayerWatermark";
import { getNextApi } from "@/lib/streaming";

interface Track {
  file: string;
  label?: string;
  kind?: string;
  default?: boolean;
}

interface Props {
  src?: string;
  iframeSrc?: string;
  tracks?: Track[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  onTimeUpdate?: (time: number, duration: number) => void;
  onEnded?: () => void;
  startTime?: number;
  ambientMode?: boolean;
  autoPlayNext?: boolean;
  onAutoPlayToggle?: (enabled: boolean) => void;
  /** HiAnime episode ID for English preview thumbnails */
  episodeId?: string;
  disableInternalMiniPlayer?: boolean;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const HINDI_PROXY_POOL = [
  "https://beat-anime-api.onrender.com/api/v1/hindiapi/proxy",
  "https://beat-anime-api-2.onrender.com/api/v1/hindiapi/proxy",
  "https://beat-anime-api-3.onrender.com/api/v1/hindiapi/proxy",
  "https://beat-anime-api-4.onrender.com/api/v1/hindiapi/proxy",
];
let hindiProxyIdx = 0;
function getHindiProxy(): string {
  const p = HINDI_PROXY_POOL[hindiProxyIdx % HINDI_PROXY_POOL.length];
  hindiProxyIdx++;
  return p;
}
const HINDI_PROXY = HINDI_PROXY_POOL[0]; // fallback for static references

// ─── Obfuscation helpers (identical to VideoPlayer) ────────────────────────
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

export default function HindiVideoPlayer({
  src, iframeSrc,
  tracks, intro, outro, onTimeUpdate, onEnded,
  startTime, ambientMode = false, autoPlayNext = true, onAutoPlayToggle,
  episodeId, disableInternalMiniPlayer = false,
}: Props) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const hlsRef       = useRef<Hls | null>(null);
  const wrapperRef   = useRef<HTMLDivElement>(null);

  // ── Preview thumbnail (feature parity with VideoPlayer) ──────────────
  const previewVideoRef  = useRef<HTMLVideoElement>(null);
  const previewHlsRef    = useRef<Hls | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewSeekTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastPreviewSeek  = useRef<number>(-999);
  const previewSeeking   = useRef(false);
  const frameCacheRef = useRef<Map<number, ImageBitmap>>(new Map());
  const lastCaptureTime = useRef<number>(-999);

  const encodedSrc = useRef(src ? obfuscate(src) : "");
  const getUrl     = useRef(src ? makeAccessor(encodedSrc.current) : () => "");

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
  const [settingsPanel, setSettingsPanel] = useState<"main"|"speed"|"caption"|"quality"|"boost">("main");
  const [speed, setSpeed]           = useState(1);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [activeTrackIdx, setActiveTrackIdx] = useState(0);
  const [ambientEnabled, setAmbientEnabled] = useState(ambientMode);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showCenterIcon, setShowCenterIcon] = useState<"play"|"pause"|"ff"|"rw"|"2x"|null>(null);
  const [longPressActive, setLongPressActive] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  // Preview thumbnail state (feature parity)
  const [hoverTime, setHoverTime]   = useState<number | null>(null);
  const [hoverPct, setHoverPct]     = useState(0);
  const [previewHasFrame, setPreviewHasFrame] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [isMobile, setIsMobile]     = useState(false);
  const [canHover, setCanHover]     = useState(false);
  const [miniPlayer, setMiniPlayer] = useState(false);
  // Advanced features (ported from English player)
  const [audioBoost, setAudioBoost] = useState(1);
  const [abLoop, setAbLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [cinemaMode, setCinemaMode] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

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
  const touchOnSeekBar  = useRef(false);
  const wasPlayingRef   = useRef(false);

  // iframeSrc with no src = iframe mode
  const isIframe = !!iframeSrc && !src;

  // ── Audio boost via Web Audio API ─────────────────────────────────────
  useEffect(() => {
    if (isIframe) return;
    const v = videoRef.current;
    if (!v) return;
    if (audioBoost <= 1) {
      if (gainNodeRef.current) gainNodeRef.current.gain.value = 1;
      return;
    }
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(v);
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
      audioSourceRef.current = source;
    }
    if (gainNodeRef.current) gainNodeRef.current.gain.value = audioBoost;
  }, [audioBoost, isIframe]);

  // ── A-B Loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isIframe) return;
    const v = videoRef.current;
    if (!v || abLoop.a === null || abLoop.b === null) return;
    const check = () => {
      if (v.currentTime >= abLoop.b!) v.currentTime = abLoop.a!;
    };
    v.addEventListener("timeupdate", check);
    return () => v.removeEventListener("timeupdate", check);
  }, [abLoop, isIframe]);

  // Screenshot function
  const takeScreenshot = () => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const link = document.createElement("a");
    link.download = `screenshot_hindi_${Math.floor(v.currentTime)}s.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  useEffect(() => {
    const check = () => {
      setIsMobile(window.matchMedia("(max-width: 768px), (pointer: coarse)").matches);
      setCanHover(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Mini player on scroll ────────────────────────────────────────────
  useEffect(() => {
    if (disableInternalMiniPlayer) {
      setMiniPlayer(false);
      return;
    }
    if (!wrapperRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { setMiniPlayer(!entry.isIntersecting && playing); },
      { threshold: 0.2 }
    );
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [playing, disableInternalMiniPlayer]);

  useEffect(() => {
    if (disableInternalMiniPlayer) {
      setMiniPlayer(false);
      return;
    }
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const isVisible = rect.top > -rect.height * 0.8 && rect.bottom < window.innerHeight + rect.height * 0.8;
    setMiniPlayer(!isVisible && playing);
  }, [playing, disableInternalMiniPlayer]);

  useEffect(() => {
    if (!src) return;
    encodedSrc.current = obfuscate(src);
    getUrl.current     = makeAccessor(encodedSrc.current);
  }, [src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const prevent = (e: Event) => e.preventDefault();
    v.addEventListener("contextmenu", prevent);
    return () => v.removeEventListener("contextmenu", prevent);
  }, []);

  // ── Handle fullscreen state tracking ────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  // ── HLS loader ────────────────────────────────────────────────────────
  // Hindi CDN URLs need specific Referer headers — always proxy them
  useEffect(() => {
    if (isIframe || !src) return;
    const video = videoRef.current;
    let realSrc: string;
    try { realSrc = getUrl.current(); } catch { return; }
    if (!video || !realSrc) return;

    // Always proxy Hindi streams for correct headers
    const proxyBase = getHindiProxy();
    const proxiedSrc = realSrc.includes("/hindiapi/proxy") ? realSrc : proxyBase + "?url=" + encodeURIComponent(realSrc);

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr) => { xhr.withCredentials = false; },
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferLength: 180,
        startPosition: startTime || -1,
      });
      hls.loadSource(proxiedSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        video.play().catch(() => {});
        setQualityLevels(data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })));
        setCurrentQuality(-1);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        }
      });
      hlsRef.current = hls;
      return () => { hls.destroy(); hlsRef.current = null; };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = proxiedSrc;
      if (startTime) video.currentTime = startTime;
      video.play().catch(() => {});
    }
  }, [src, startTime, isIframe]);

  // ── Preview HLS — use ENGLISH HiAnime stream (same frames, much faster) ─
  useEffect(() => {
    if (isIframe || !episodeId) return;
    const preview = previewVideoRef.current;
    if (!preview) return;

    let cancelled = false;

    const loadEnglishPreview = async () => {
      try {
        const apiBase = getNextApi();
        const res = await fetch(
          `${apiBase}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=hd-2&category=sub`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const rawUrl = data?.data?.sources?.[0]?.url;
        if (!rawUrl || cancelled) return;

        const proxiedUrl = `${apiBase}/hindiapi/proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;

        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 2, maxMaxBufferLength: 4,
            maxBufferSize: 1 * 1000 * 1000,
            startPosition: -1, enableWorker: false, startLevel: 0,
            capLevelToPlayerSize: true,
            abrEwmaDefaultEstimate: 100000,
            abrMaxWithRealBitrate: true,
            xhrSetup: (xhr) => { xhr.withCredentials = false; },
          });
          hls.loadSource(proxiedUrl);
          hls.attachMedia(preview);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) { hls.destroy(); return; }
            hls.currentLevel = 0;
            hls.autoLevelCapping = 0;
            preview.pause();
            setPreviewReady(true);
          });
          previewHlsRef.current = hls;
        }
      } catch { /* silent */ }
    };

    loadEnglishPreview();
    return () => { cancelled = true; if (previewHlsRef.current) { previewHlsRef.current.destroy(); previewHlsRef.current = null; } setPreviewReady(false); };
  }, [episodeId, isIframe]);

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
    const onError  = () => { previewSeeking.current = false; };
    const onStalled = () => { previewSeeking.current = false; };
    preview.addEventListener("seeked", onSeeked);
    preview.addEventListener("error", onError);
    preview.addEventListener("stalled", onStalled);
    return () => {
      preview.removeEventListener("seeked", onSeeked);
      preview.removeEventListener("error", onError);
      preview.removeEventListener("stalled", onStalled);
    };
  }, []);

  // Periodically capture frames from main video for instant preview cache
  useEffect(() => {
    if (isIframe) return;
    const v = videoRef.current;
    if (!v) return;
    const CAPTURE_INTERVAL = 3;
    const captureFrame = () => {
      if (v.paused || v.ended || !v.videoWidth) return;
      const t = Math.round(v.currentTime);
      if (Math.abs(t - lastCaptureTime.current) < CAPTURE_INTERVAL) return;
      lastCaptureTime.current = t;
      try {
        const oc = new OffscreenCanvas(80, 45);
        const ctx = oc.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, 80, 45);
          createImageBitmap(oc).then(bmp => {
            frameCacheRef.current.set(t, bmp);
            if (frameCacheRef.current.size > 200) {
              const first = frameCacheRef.current.keys().next().value;
              if (first !== undefined) frameCacheRef.current.delete(first);
            }
          }).catch(() => {});
        }
      } catch {
        const tc = document.createElement("canvas");
        tc.width = 80; tc.height = 45;
        const ctx = tc.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, 80, 45);
          createImageBitmap(tc).then(bmp => {
            frameCacheRef.current.set(t, bmp);
            if (frameCacheRef.current.size > 200) {
              const first = frameCacheRef.current.keys().next().value;
              if (first !== undefined) frameCacheRef.current.delete(first);
            }
          }).catch(() => {});
        }
      }
    };
    const interval = setInterval(captureFrame, 500);
    return () => clearInterval(interval);
  }, [isIframe]);

  // Clear frame cache on src change
  useEffect(() => {
    frameCacheRef.current.clear();
    lastCaptureTime.current = -999;
  }, [src]);

  // Buffering events
  useEffect(() => {
    if (isIframe) return;
    const v = videoRef.current;
    if (!v) return;
    const on  = () => setIsBuffering(true);
    const off = () => setIsBuffering(false);
    v.addEventListener("waiting",  on);
    v.addEventListener("playing",  off);
    v.addEventListener("canplay",  off);
    return () => { v.removeEventListener("waiting", on); v.removeEventListener("playing", off); v.removeEventListener("canplay", off); };
  }, [isIframe]);

  // Ambient canvas
  useEffect(() => {
    if (!ambientEnabled || isIframe) { if (ambientFrameRef.current) cancelAnimationFrame(ambientFrameRef.current); return; }
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
  }, [ambientEnabled, isIframe]);

  // ── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isIframe) return;
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
      const was2x = spaceWas2x.current;
      spaceHeld.current  = false;
      spaceWas2x.current = false;
      const v = videoRef.current;
      if (was2x) { if (v) v.playbackRate = speed; setLongPressActive(false); }
      else if (v) {
        if (v.paused) { v.play(); setPlaying(true); flashCenter("play"); }
        else          { v.pause(); setPlaying(false); flashCenter("pause"); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [speed, isIframe]);

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
    if (v.paused) { wasPlayingRef.current = true; v.play(); setPlaying(true); flashCenter("play"); }
    else          { wasPlayingRef.current = false; v.pause(); setPlaying(false); flashCenter("pause"); }
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

  // ── Seek bar touch ────────────────────────────────────────────────────
  const seekPreviewToTime = (t: number) => {
    const rounded = Math.round(t);
    const cache = frameCacheRef.current;
    let best: ImageBitmap | null = null;
    let bestDist = 6;
    for (const [time, bmp] of cache) {
      const dist = Math.abs(time - rounded);
      if (dist < bestDist) { best = bmp; bestDist = dist; }
    }
    if (best) {
      const canvas = previewCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) { ctx.drawImage(best, 0, 0, canvas.width, canvas.height); setPreviewHasFrame(true); }
      }
      if (bestDist > 2 && previewReady && previewVideoRef.current) {
        if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
        previewSeekTimer.current = setTimeout(() => {
          const pv = previewVideoRef.current;
          if (!pv || previewSeeking.current) return;
          lastPreviewSeek.current = t;
          previewSeeking.current = true;
          pv.currentTime = t;
          setTimeout(() => { previewSeeking.current = false; }, 400);
        }, 50);
      }
      return;
    }
    if (!previewReady || !previewVideoRef.current) return;
    if (Math.abs(lastPreviewSeek.current - t) < 0.5) return;
    if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
    previewSeekTimer.current = setTimeout(() => {
      const pv = previewVideoRef.current;
      if (!pv) return;
      lastPreviewSeek.current = t;
      previewSeeking.current = true;
      setPreviewHasFrame(false);
      pv.currentTime = t;
      setTimeout(() => { previewSeeking.current = false; }, 500);
    }, 0);
  };

  const handleSeekBarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    touchOnSeekBar.current = true;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    touchMoved.current = true;
    wasPlayingRef.current = playing;
    const v = videoRef.current;
    if (!v || !duration) return;
    if (wasPlayingRef.current) v.pause();
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setHoverTime(pct * duration);
    setHoverPct(pct * 100);
    seekPreviewToTime(pct * duration);
  };

  const handleSeekBarTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setHoverTime(pct * duration);
    setHoverPct(pct * 100);
    seekPreviewToTime(pct * duration);
  };

  const handleSeekBarTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    touchOnSeekBar.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    setHoverTime(null);
    const v = videoRef.current;
    if (!v || !duration) return;
    const touch = e.changedTouches[0];
    if (touch) {
      const rect = e.currentTarget.getBoundingClientRect();
      v.currentTime = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)) * duration;
    }
    if (wasPlayingRef.current && v.paused) v.play();
  };

  // ── Preview thumbnail hover (desktop/laptop hover devices) ────────────
  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || !canHover) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t    = pct * duration;
    setHoverTime(t);
    setHoverPct(pct * 100);

    if (!previewReady || !previewVideoRef.current) return;
    if (Math.abs(lastPreviewSeek.current - t) < 0.5) return;
    if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
    previewSeekTimer.current = setTimeout(() => {
      const pv = previewVideoRef.current;
      if (!pv) return;
      lastPreviewSeek.current = t;
      previewSeeking.current  = true;
      pv.currentTime = t;
      setTimeout(() => { previewSeeking.current = false; }, 500);
    }, previewSeeking.current ? 30 : 0);
  };

  const handleProgressLeave = () => {
    setHoverTime(null);
    if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {
        const el = containerRef.current as any;
        if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
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

  // ── Nudge subtitle cues up on mobile so controls don't overlap ────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isMobile) return;
    const nudgeCues = (track: TextTrack) => {
      if (!track.cues) return;
      for (let i = 0; i < track.cues.length; i++) {
        const cue = track.cues[i] as VTTCue;
        if (cue.line === "auto" || cue.line === undefined) cue.line = -2;
      }
    };
    const onTrackLoad = () => {
      for (let i = 0; i < v.textTracks.length; i++) nudgeCues(v.textTracks[i]);
    };
    onTrackLoad();
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].addEventListener("cuechange", () => nudgeCues(v.textTracks[i]));
    }
    v.addEventListener("loadedmetadata", onTrackLoad);
    return () => v.removeEventListener("loadedmetadata", onTrackLoad);
  }, [isMobile, src, tracks]);

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${m}:${String(sec).padStart(2,"0")}`;
  };

  const resetHideTimer = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing && !settingsOpen) setShowControls(false); }, 3500);
  };

  const handleContainerTouchStart = (e: React.TouchEvent) => {
    if (touchOnSeekBar.current) return;
    touchStartTime.current = Date.now();
    touchStartPos.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchMoved.current     = false;
    resetHideTimer();
    longPressTimer.current = setTimeout(() => {
      if (touchMoved.current || touchOnSeekBar.current) return;
      const v = videoRef.current;
      if (v) { v.playbackRate = 2; setLongPressActive(true); flashCenter("2x"); }
    }, 600);
  };

  const handleContainerTouchMove = (e: React.TouchEvent) => {
    const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
    if (dx > 8 || dy > 8) { touchMoved.current = true; if (longPressTimer.current) clearTimeout(longPressTimer.current); }
  };

  const handleContainerTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (longPressActive) {
      const v = videoRef.current;
      if (v) v.playbackRate = speed;
      setLongPressActive(false);
      return;
    }
    if (touchMoved.current || touchOnSeekBar.current) return;
    if (Date.now() - touchStartTime.current > 500) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !videoRef.current) return;
    const x = e.changedTouches[0].clientX - rect.left;
    tapCount.current++;
    if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
    doubleTapTimer.current = setTimeout(() => { if (tapCount.current === 1) togglePlay(); tapCount.current = 0; }, 220);
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

  const PREVIEW_W = isMobile ? 100 : 160;
  const PREVIEW_H = isMobile ? 56 : 90;
  const previewLeft = `clamp(${PREVIEW_W / 2}px, ${hoverPct}%, calc(100% - ${PREVIEW_W / 2}px))`;

  const settingsPositionClass = "absolute bottom-14 sm:bottom-20 right-2 sm:right-3 z-40";

  return (
    <div ref={wrapperRef} className="relative">
      {/* Mini player (HLS only) */}
      <AnimatePresence>
        {miniPlayer && !fullscreen && !isIframe && !disableInternalMiniPlayer && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.y) > 80 || Math.abs(info.velocity.y) > 500) {
                setMiniPlayer(false);
                if (videoRef.current) { videoRef.current.pause(); setPlaying(false); }
              }
            }}
            className="fixed bottom-4 right-4 z-[999] w-72 sm:w-80 rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.8)] border border-white/10 cursor-pointer touch-none"
            onClick={() => wrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            style={{ aspectRatio: "16/9" }}
          >
            <div className="w-full h-full bg-black flex items-center justify-center relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-white/60 text-xs text-center px-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-1">
                    <Play className="w-4 h-4 text-white ml-0.5" />
                  </div>
                  Click to return
                </div>
              </div>
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-2 flex items-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="w-7 h-7 flex items-center justify-center text-white rounded-full hover:bg-white/20 transition-colors">
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <div className="flex-1 h-0.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white/80 rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-white/60 text-[10px] tabular-nums">{fmt(currentTime)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient glow */}
      {ambientEnabled && !isIframe && (
        <canvas ref={canvasRef}
          className="absolute -inset-8 w-[calc(100%+4rem)] h-[calc(100%+4rem)] opacity-40 blur-3xl scale-110 pointer-events-none -z-10 rounded-3xl" />
      )}

      {/* Hidden preview video (desktop only, not for iframe) */}
      {canHover && !isIframe && <video ref={previewVideoRef} className="hidden" muted playsInline preload="auto" />}

      <div
        ref={containerRef}
        className="relative w-full aspect-video bg-black rounded-xl sm:rounded-2xl overflow-hidden select-none"
        style={{ maxHeight: "calc(100vh - 120px)" }}
        onMouseMove={resetHideTimer}
        onMouseLeave={() => { if (playing && !settingsOpen) setShowControls(false); }}
        onTouchStart={handleContainerTouchStart}
        onTouchMove={handleContainerTouchMove}
        onTouchEnd={handleContainerTouchEnd}
      >
        {/* ═══════════════════════════════════════════════════════════════
            IFRAME MODE — NO sandbox attribute + watermark overlay.
            ═══════════════════════════════════════════════════════════════ */}
        {isIframe ? (
          <>
            <iframe
              src={iframeSrc}
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="no-referrer-when-downgrade"
            />
            {/* Watermark overlay on iframe */}
            <PlayerWatermark showIcon />
          </>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full"
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => { setPlaying(true); wasPlayingRef.current = true; }}
              onPause={() => { setPlaying(false); wasPlayingRef.current = false; }}
              onEnded={() => { setPlaying(false); wasPlayingRef.current = false; onEnded?.(); }}
              onClick={togglePlay}
              crossOrigin="anonymous"
              playsInline
              disablePictureInPicture
              controlsList="nodownload noremoteplayback"
              x-webkit-airplay="allow"
            >
              {subtitleTracks.map((t, i) => (
                <track key={i} src={t.file} label={t.label || "Unknown"} kind="subtitles" default={t.default} />
              ))}
            </video>

            {/* Watermark on HLS player */}
            <PlayerWatermark showIcon />

            {/* Center flash icon */}
            <AnimatePresence>
              {showCenterIcon && (
                <motion.div key="ci" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.4 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
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

            {/* Buffering / Paused overlay (mobile only for pause) */}
            {isBuffering && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 text-primary animate-spin" />
                  </div>
                  <span className="text-[10px] sm:text-xs text-white/60 font-medium">Buffering…</span>
                </div>
              </div>
            )}
            {!playing && currentTime > 0 && !showCenterIcon && !isBuffering && isMobile && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center">
                  <Play className="w-7 h-7 text-white/80 ml-0.5" />
                </div>
              </div>
            )}

            {/* 2× badge */}
            <AnimatePresence>
              {longPressActive && (
                <motion.div key="2xbadge" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="absolute top-3 inset-x-0 flex justify-center z-30 pointer-events-none">
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/70 backdrop-blur border border-primary/40 text-primary text-sm font-bold shadow-lg">
                    <Zap className="w-4 h-4" /> 2× Speed
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Skip Intro / Outro */}
            <AnimatePresence>
              {showSkipIntro && (
                <motion.button key="skip-intro" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  onClick={() => { if (videoRef.current && intro) videoRef.current.currentTime = intro.end; }}
                  className="absolute bottom-32 sm:bottom-24 right-3 sm:right-4 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-transform z-20 flex items-center gap-2 shadow-lg">
                  <SkipForward className="w-4 h-4" /> Skip Intro
                </motion.button>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {showSkipOutro && (
                <motion.button key="skip-outro" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  onClick={() => { if (videoRef.current && outro) videoRef.current.currentTime = outro.end; }}
                  className="absolute bottom-32 sm:bottom-24 right-3 sm:right-4 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-transform z-20 flex items-center gap-2 shadow-lg">
                  <SkipForward className="w-4 h-4" /> Skip Outro
                </motion.button>
              )}
            </AnimatePresence>

            {/* Settings panel */}
            {settingsOpen && (
                <div
                  className={`${settingsPositionClass} left-2 right-2 sm:left-auto sm:right-3 w-auto sm:w-48 max-w-[calc(100vw-1rem)] max-h-[min(35vh,200px)] sm:max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain touch-pan-y bg-black/95 border border-white/10 rounded-lg sm:rounded-xl shadow-2xl text-[10px] sm:text-sm scrollbar-thin`}
                  onClick={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}>
                  {settingsPanel === "main" && (
                    <div className="py-1">
                      {[
                        { label: "Speed",    icon: Gauge,     value: `${speed}x`, action: () => setSettingsPanel("speed") },
                        { label: "Captions", icon: Subtitles, value: captionsOn ? subtitleTracks[activeTrackIdx]?.label || "On" : "Off", action: () => setSettingsPanel("caption") },
                      ].map(item => (
                      <button key={item.label} onClick={item.action}
                          className="flex items-center justify-between w-full px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-sm text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors">
                          <span className="flex items-center gap-2"><item.icon className="w-3 h-3 sm:w-4 sm:h-4 text-white/50" /> {item.label}</span>
                          <span className="flex items-center gap-1 text-white/40 text-[10px] sm:text-xs">{item.value} <ChevronRight className="w-3 h-3" /></span>
                        </button>
                      ))}
                      {qualityLevels.length > 0 && (
                        <button onClick={() => setSettingsPanel("quality")}
                          className="flex items-center justify-between w-full px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-sm text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors">
                          <span className="flex items-center gap-2"><Layers className="w-3 h-3 sm:w-4 sm:h-4 text-white/50" /> Quality</span>
                          <span className="flex items-center gap-1 text-white/40 text-[10px] sm:text-xs">{qualityLabel(currentQuality)} <ChevronRight className="w-3 h-3" /></span>
                        </button>
                      )}
                      <button onClick={() => setSettingsPanel("boost")}
                        className="flex items-center justify-between w-full px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-sm text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors">
                        <span className="flex items-center gap-2"><Volume1 className="w-3 h-3 sm:w-4 sm:h-4 text-white/50" /> Audio Boost</span>
                        <span className="flex items-center gap-1 text-white/40 text-[10px] sm:text-xs">{audioBoost > 1 ? `${audioBoost}x` : "Off"} <ChevronRight className="w-3 h-3" /></span>
                      </button>
                      <button onClick={takeScreenshot}
                        className="flex items-center justify-between w-full px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-sm text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors">
                        <span className="flex items-center gap-2"><Camera className="w-3 h-3 sm:w-4 sm:h-4 text-white/50" /> Screenshot</span>
                        <span className="text-white/40 text-[10px] sm:text-xs">Save</span>
                      </button>
                      <button onClick={() => { const v = videoRef.current; if (!v) return; if (abLoop.a === null) setAbLoop({ a: v.currentTime, b: null }); else if (abLoop.b === null) setAbLoop(prev => ({ ...prev, b: v.currentTime })); else setAbLoop({ a: null, b: null }); }}
                        className="flex items-center justify-between w-full px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-sm text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors">
                        <span className="flex items-center gap-2"><Repeat className="w-3 h-3 sm:w-4 sm:h-4 text-white/50" /> A-B Loop</span>
                        <span className={`text-[10px] sm:text-xs ${abLoop.a !== null ? "text-primary font-medium" : "text-white/40"}`}>{abLoop.a !== null && abLoop.b !== null ? "Active ✓" : abLoop.a !== null ? "Set B →" : "Set A"}</span>
                      </button>
                      {[
                        { label: "Ambient",  icon: Sun,         value: ambientEnabled, toggle: () => setAmbientEnabled(!ambientEnabled) },
                        { label: "Cinema",   icon: SlidersHorizontal, value: cinemaMode, toggle: () => setCinemaMode(!cinemaMode) },
                        { label: "Autoplay", icon: SkipForward, value: autoPlayNext,   toggle: () => onAutoPlayToggle?.(!autoPlayNext) },
                      ].map(item => (
                        <button key={item.label} onClick={item.toggle}
                          className="flex items-center justify-between w-full px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-sm text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors">
                          <span className="flex items-center gap-2"><item.icon className="w-3 h-3 sm:w-4 sm:h-4 text-white/50" /> {item.label}</span>
                          <span className={`w-6 h-3 sm:w-9 sm:h-5 rounded-full transition-colors flex items-center ${item.value ? "bg-primary justify-end" : "bg-white/20 justify-start"}`}>
                            <span className="w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full bg-white mx-0.5 shadow" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {settingsPanel === "speed" && (
                    <div className="py-1">
                      <button onClick={() => setSettingsPanel("main")} className="flex items-center gap-2 w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-white/50 hover:bg-white/10">
                        <ChevronRight className="w-3 h-3 rotate-180" /> Speed
                      </button>
                      <div className="border-t border-white/10 mt-0.5" />
                      {SPEEDS.map(s => (
                        <button key={s} onClick={() => changeSpeed(s)}
                          className={`w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-left hover:bg-white/10 transition-colors ${speed === s ? "text-primary font-semibold" : "text-white/80"}`}>
                          {s === 1 ? "Normal" : `${s}×`}
                        </button>
                      ))}
                    </div>
                  )}
                  {settingsPanel === "caption" && (
                    <div className="py-1">
                      <button onClick={() => setSettingsPanel("main")} className="flex items-center gap-2 w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-white/50 hover:bg-white/10">
                        <ChevronRight className="w-3 h-3 rotate-180" /> Captions
                      </button>
                      <div className="border-t border-white/10 mt-0.5" />
                      <button onClick={() => {
                        setCaptionsOn(false);
                        const v = videoRef.current;
                        if (v) for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "hidden";
                        setSettingsPanel("main");
                      }} className={`w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-left hover:bg-white/10 ${!captionsOn ? "text-primary font-semibold" : "text-white/80"}`}>
                        Off
                      </button>
                      {subtitleTracks.map((t, i) => (
                        <button key={i} onClick={() => { setCaptionsOn(true); selectTrack(i); }}
                          className={`w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-left hover:bg-white/10 ${captionsOn && activeTrackIdx === i ? "text-primary font-semibold" : "text-white/80"}`}>
                          {t.label || "Unknown"}
                        </button>
                      ))}
                      {subtitleTracks.length === 0 && <p className="px-3 py-1.5 text-[10px] text-white/30">No captions available</p>}
                    </div>
                  )}
                  {settingsPanel === "quality" && (
                    <div className="py-1">
                      <button onClick={() => setSettingsPanel("main")} className="flex items-center gap-2 w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-white/50 hover:bg-white/10">
                        <ChevronRight className="w-3 h-3 rotate-180" /> Quality
                      </button>
                      <div className="border-t border-white/10 mt-0.5" />
                      <button onClick={() => changeQuality(-1)}
                        className={`w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-left hover:bg-white/10 ${currentQuality === -1 ? "text-primary font-semibold" : "text-white/80"}`}>
                        Auto
                      </button>
                      {qualityLevels.map((lvl, i) => (
                        <button key={i} onClick={() => changeQuality(i)}
                          className={`w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-left hover:bg-white/10 ${currentQuality === i ? "text-primary font-semibold" : "text-white/80"}`}>
                          {lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`}
                          {lvl.height >= 1080 && <span className="ml-2 text-[10px] text-accent font-bold">HD</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {settingsPanel === "boost" && (
                    <div className="py-1">
                      <button onClick={() => setSettingsPanel("main")}
                        className="flex items-center gap-2 w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-white/50 hover:bg-white/10">
                        <ChevronRight className="w-3 h-3 rotate-180" /> Audio Boost
                      </button>
                      <div className="border-t border-white/10 mt-0.5" />
                      {[1, 1.5, 2, 2.5, 3].map(b => (
                        <button key={b} onClick={() => { setAudioBoost(b); setSettingsPanel("main"); }}
                          className={`w-full px-3 py-1.5 sm:py-2 text-[11px] sm:text-sm text-left hover:bg-white/10 transition-colors ${audioBoost === b ? "text-primary font-semibold" : "text-white/80"}`}>
                          {b === 1 ? "Normal" : `${b}× Boost`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
            )}

            {/* Controls overlay */}
            <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 z-20 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.1) 60%, transparent 100%)" }} />

              <div className="relative px-2 sm:px-5 pb-1.5 sm:pb-4 pt-8 sm:pt-12">
                {/* Seek bar — YouTube-style with preview thumbnail */}
                <div className="w-full mb-3 sm:mb-3.5 cursor-pointer group/progress relative touch-none"
                  style={{ height: "32px", display: "flex", alignItems: "center" }}
                  onClick={seek}
                  onMouseMove={handleProgressHover}
                  onMouseLeave={handleProgressLeave}
                  onTouchStart={handleSeekBarTouchStart}
                  onTouchMove={handleSeekBarTouchMove}
                  onTouchEnd={handleSeekBarTouchEnd}>
                  <div className="absolute inset-x-0 rounded-full overflow-hidden transition-all duration-150"
                    style={{ height: "4px", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)" }}>
                    <style>{`.group\\/progress:hover .seek-track { height: 6px !important; }`}</style>
                    <div className="seek-track absolute inset-0 rounded-full overflow-hidden transition-all duration-150" style={{ height: "100%" }}>
                      <div className="absolute top-0 left-0 h-full bg-white/30 rounded-full" style={{ width: `${bufferedPct}%`, transition: "width 0.5s linear" }} />
                      <div className="absolute top-0 left-0 h-full rounded-full" style={{
                        width: `${progress}%`,
                        background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
                        transition: "width 0.1s linear",
                        boxShadow: "0 0 12px hsl(var(--primary) / 0.7), 0 0 4px hsl(var(--primary) / 0.5)",
                      }} />
                    </div>
                  </div>
                  <div className="absolute rounded-full pointer-events-none opacity-0 group-hover/progress:opacity-100 transition-all duration-150"
                    style={{ width: "14px", height: "14px", left: `${progress}%`, top: "50%", transform: "translateX(-50%) translateY(-50%)",
                      background: "white", boxShadow: "0 0 0 3px hsl(var(--primary) / 0.4), 0 2px 8px rgba(0,0,0,0.8)" }} />

                  {/* Preview thumbnail */}
                  {hoverTime !== null && (
                    <div
                      className="absolute bottom-6 sm:bottom-8 flex flex-col items-center gap-1 sm:gap-1.5 pointer-events-none z-20 -translate-x-1/2"
                      style={{ left: previewLeft }}
                    >
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-4 sm:h-6 bg-white/40" style={{ bottom: "-16px" }} />
                      <div className={`rounded-lg overflow-hidden border border-white/20 shadow-2xl bg-black/90 transition-opacity duration-75 ${previewHasFrame ? "opacity-100" : "opacity-40"}`}
                        style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.1)" }}>
                        <canvas ref={previewCanvasRef} width={PREVIEW_W} height={PREVIEW_H} className="block" />
                      </div>
                      <span className="text-[9px] sm:text-[11px] text-white font-bold px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-black/90 shadow tabular-nums border border-white/10">
                        {fmt(hoverTime)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-0.5 sm:gap-1">
                  <div className="flex items-center gap-0">
                    <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.max(0, v.currentTime - 10); flashCenter("rw"); } }}
                      className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all rounded-full group/btn overflow-hidden">
                      <span className="absolute inset-0 rounded-full bg-white/0 group-hover/btn:bg-white/10 transition-colors duration-150" />
                      <SkipBack className="relative w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <button onClick={togglePlay}
                      className="relative w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center transition-all rounded-full group/btn overflow-hidden">
                      <span className="absolute inset-0 rounded-full bg-white/0 group-hover/btn:bg-white/15 transition-colors duration-150" />
                      {playing ? <Pause className="relative w-4 h-4 sm:w-4.5 sm:h-4.5 text-white drop-shadow-md" />
                               : <Play  className="relative w-4 h-4 sm:w-4.5 sm:h-4.5 text-white drop-shadow-md ml-0.5" />}
                    </button>
                    <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.min(v.duration, v.currentTime + 10); flashCenter("ff"); } }}
                      className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all rounded-full group/btn overflow-hidden">
                      <span className="absolute inset-0 rounded-full bg-white/0 group-hover/btn:bg-white/10 transition-colors duration-150" />
                      <SkipForward className="relative w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>

                    <div className="hidden sm:flex items-center gap-1 group/vol">
                      <button onClick={toggleMute}
                        className="relative w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors rounded-full group/btn overflow-hidden">
                        <span className="absolute inset-0 rounded-full bg-white/0 group-hover/btn:bg-white/10 transition-colors" />
                        {muted || volume === 0 ? <VolumeX className="relative w-4 h-4" /> : <Volume2 className="relative w-4 h-4" />}
                      </button>
                      <div className="w-0 overflow-hidden group-hover/vol:w-16 transition-all duration-200 ease-out">
                        <div className="relative w-16 cursor-pointer" style={{ height: "18px", display: "flex", alignItems: "center" }}>
                          <div className="absolute inset-x-0 rounded-full bg-white/20 overflow-hidden" style={{ height: "3px", top: "50%", transform: "translateY(-50%)" }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${volumeFill}%`, background: "white" }} />
                          </div>
                          <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} onChange={handleVolumeChange}
                            className="absolute inset-0 w-full opacity-0 cursor-pointer z-10" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center ml-1">
                      <span className="text-[9px] sm:text-xs font-medium tabular-nums" style={{ color: "rgba(255,255,255,0.9)" }}>{fmt(currentTime)}</span>
                      <span className="text-[9px] sm:text-xs mx-0.5 sm:mx-1" style={{ color: "rgba(255,255,255,0.3)" }}>/</span>
                      <span className="text-[9px] sm:text-xs tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>{fmt(duration)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-0">
                    {speed !== 1 && (
                      <span className="text-[8px] sm:text-xs text-primary font-bold px-1 sm:px-1.5 py-0.5 rounded bg-primary/15 border border-primary/20">{speed}×</span>
                    )}
                    {currentQuality !== -1 && qualityLevels[currentQuality] && (
                      <span className="hidden sm:inline text-[10px] text-accent font-medium px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/20">{qualityLabel(currentQuality)}</span>
                    )}
                    <button
                      onClick={() => { setSettingsOpen(true); setSettingsPanel("caption"); }}
                      className={`sm:hidden relative w-7 h-7 flex items-center justify-center active:scale-90 transition-all rounded-full group/btn overflow-hidden ${captionsOn ? "text-primary" : "text-white/70 hover:text-white"}`}>
                      <span className="absolute inset-0 rounded-full bg-white/0 group-hover/btn:bg-white/10 transition-colors" />
                      <Subtitles className="relative w-3.5 h-3.5" />
                    </button>
                    <button onClick={toggleMute}
                      className="sm:hidden relative w-7 h-7 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all rounded-full group/btn overflow-hidden">
                      <span className="absolute inset-0 rounded-full bg-white/0 group-hover/btn:bg-white/10 transition-colors" />
                      {muted || volume === 0 ? <VolumeX className="relative w-3.5 h-3.5" /> : <Volume2 className="relative w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => { setSettingsOpen(!settingsOpen); setSettingsPanel("main"); }}
                      className={`relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center transition-all rounded-full group/btn overflow-hidden ${settingsOpen ? "text-primary" : "text-white/70 hover:text-white"}`}>
                      <span className={`absolute inset-0 rounded-full transition-colors ${settingsOpen ? "bg-primary/15" : "bg-white/0 group-hover/btn:bg-white/10"}`} />
                      <Settings className={`relative w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-300 ${settingsOpen ? "rotate-45" : ""}`} />
                    </button>
                    <button onClick={toggleFullscreen}
                      className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-white/70 hover:text-white active:scale-90 transition-all rounded-full group/btn overflow-hidden">
                      <span className="absolute inset-0 rounded-full bg-white/0 group-hover/btn:bg-white/10 transition-colors" />
                      {fullscreen ? <Minimize className="relative w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize className="relative w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
