import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, Subtitles, Gauge, Sun, X, ChevronRight,
  SkipForward, SkipBack, Loader2
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

// XOR obfuscation for stream URLs
function obfuscateUrl(url: string): string {
  const key = 0x5A;
  return btoa(Array.from(url).map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join(""));
}
function deobfuscateUrl(encoded: string): string {
  const key = 0x5A;
  const decoded = atob(encoded);
  return Array.from(decoded).map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join("");
}

export default function VideoPlayer({ src, tracks, intro, outro, onTimeUpdate, onEnded, startTime, ambientMode = false, autoPlayNext = true, onAutoPlayToggle }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<"main" | "speed" | "caption">("main");
  const [speed, setSpeed] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [activeTrackIdx, setActiveTrackIdx] = useState(0);
  const [ambientEnabled, setAmbientEnabled] = useState(ambientMode);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showCenterIcon, setShowCenterIcon] = useState<"play" | "pause" | "ff" | "rw" | null>(null);
  const [longPress, setLongPress] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const ambientFrameRef = useRef<number>();
  const centerIconTimer = useRef<ReturnType<typeof setTimeout>>();
  const doubleTapTimer = useRef<ReturnType<typeof setTimeout>>();
  const tapCount = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState(0);
  const encodedSrc = useRef(obfuscateUrl(src));

  useEffect(() => {
    encodedSrc.current = obfuscateUrl(src);
  }, [src]);

  // HLS setup with adaptive buffering
  useEffect(() => {
    const video = videoRef.current;
    const realSrc = deobfuscateUrl(encodedSrc.current);
    if (!video || !realSrc) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 15,
        maxMaxBufferLength: 60,
        startPosition: startTime || -1,
        enableWorker: true,
        lowLatencyMode: false,
        abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
      });
      hls.loadSource(realSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hlsRef.current = hls;
      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = realSrc;
      if (startTime) video.currentTime = startTime;
      video.play().catch(() => {});
    }
  }, [src, startTime]);

  // Buffering detection
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onCanPlay = () => setIsBuffering(false);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, []);

  // Ambient mode canvas
  useEffect(() => {
    if (!ambientEnabled) {
      if (ambientFrameRef.current) cancelAnimationFrame(ambientFrameRef.current);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      if (video.paused || video.ended) { ambientFrameRef.current = requestAnimationFrame(draw); return; }
      canvas.width = 16; canvas.height = 9;
      ctx.filter = "blur(2px) saturate(2)";
      ctx.drawImage(video, 0, 0, 16, 9);
      ambientFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (ambientFrameRef.current) cancelAnimationFrame(ambientFrameRef.current); };
  }, [ambientEnabled]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.code === "ArrowRight") { v.currentTime = Math.min(v.duration, v.currentTime + 10); flashCenter("ff"); }
      if (e.code === "ArrowLeft") { v.currentTime = Math.max(0, v.currentTime - 10); flashCenter("rw"); }
      if (e.code === "KeyF") toggleFullscreen();
      if (e.code === "KeyM") toggleMute();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playing]);

  const flashCenter = (icon: "play" | "pause" | "ff" | "rw") => {
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
    // Update buffered
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
    if (intro) setShowSkipIntro(v.currentTime >= intro.start && v.currentTime < intro.end);
    else setShowSkipIntro(false);
    if (outro) setShowSkipOutro(v.currentTime >= outro.start && v.currentTime < outro.end);
    else setShowSkipOutro(false);
  }, [intro, outro, onTimeUpdate]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); flashCenter("play"); }
    else { v.pause(); setPlaying(false); flashCenter("pause"); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = Number(e.target.value);
    v.volume = val; setVolume(val);
    if (val === 0) { v.muted = true; setMuted(true); }
    else { v.muted = false; setMuted(false); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pct * duration);
    setHoverPos(e.clientX - rect.left);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) { containerRef.current.requestFullscreen(); setFullscreen(true); }
    else { document.exitFullscreen(); setFullscreen(false); }
  };

  const changeSpeed = (s: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = s;
    setSpeed(s);
    setSettingsPanel("main");
  };

  const toggleCaptions = () => {
    const v = videoRef.current;
    if (!v) return;
    const newState = !captionsOn;
    setCaptionsOn(newState);
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode = newState && i === activeTrackIdx ? "showing" : "hidden";
    }
  };

  const selectTrack = (idx: number) => {
    const v = videoRef.current;
    if (!v) return;
    setActiveTrackIdx(idx);
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode = captionsOn && i === idx ? "showing" : "hidden";
    }
    setSettingsPanel("main");
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000);
  };

  // Mobile double-tap to seek
  const handleTouchEnd = (e: React.TouchEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !videoRef.current) return;
    const touch = e.changedTouches[0];
    const x = touch.clientX - rect.left;
    const isLeft = x < rect.width / 3;
    const isRight = x > (rect.width * 2) / 3;

    tapCount.current++;
    if (doubleTapTimer.current) clearTimeout(doubleTapTimer.current);
    doubleTapTimer.current = setTimeout(() => { tapCount.current = 0; }, 300);

    if (tapCount.current >= 2) {
      tapCount.current = 0;
      const v = videoRef.current;
      if (isLeft) { v.currentTime = Math.max(0, v.currentTime - 10); flashCenter("rw"); }
      else if (isRight) { v.currentTime = Math.min(v.duration, v.currentTime + 10); flashCenter("ff"); }
    }
  };

  // Long press for 2x speed
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v) { v.playbackRate = 2; setLongPress(true); }
    }, 500);
  };
  const handleTouchEndRelease = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (longPress) {
      const v = videoRef.current;
      if (v) v.playbackRate = speed;
      setLongPress(false);
    }
  };

  const subtitleTracks = tracks?.filter((t) => t.kind === "captions" || t.kind === "subtitles") || [];
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div className="relative">
      {ambientEnabled && (
        <canvas ref={canvasRef} className="absolute -inset-8 w-[calc(100%+4rem)] h-[calc(100%+4rem)] opacity-50 blur-3xl scale-110 pointer-events-none -z-10 rounded-3xl" />
      )}

      <div
        ref={containerRef}
        className="relative w-full aspect-video bg-background rounded-lg overflow-hidden group select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { if (playing) { setShowControls(false); setSettingsOpen(false); } }}
        onTouchEnd={handleTouchEnd}
        onTouchStart={handleTouchStart}
        onTouchCancel={handleTouchEndRelease}
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
        >
          {subtitleTracks.map((t, i) => (
            <track key={i} src={t.file} label={t.label || "Unknown"} kind="subtitles" default={t.default} />
          ))}
        </video>

        {/* Center icon flash */}
        <AnimatePresence>
          {showCenterIcon && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
            >
              <div className="w-16 h-16 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center">
                {showCenterIcon === "play" && <Play className="w-8 h-8 text-foreground" />}
                {showCenterIcon === "pause" && <Pause className="w-8 h-8 text-foreground" />}
                {showCenterIcon === "ff" && <SkipForward className="w-8 h-8 text-foreground" />}
                {showCenterIcon === "rw" && <SkipBack className="w-8 h-8 text-foreground" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buffering spinner */}
        {(isBuffering || (!playing && !videoRef.current?.paused)) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          </div>
        )}

        {/* Long press 2x indicator */}
        {longPress && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-background/70 backdrop-blur text-xs text-primary font-bold z-20">
            2× Speed
          </div>
        )}

        {/* Skip Intro */}
        <AnimatePresence>
          {showSkipIntro && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onClick={() => { if (videoRef.current && intro) videoRef.current.currentTime = intro.end; }}
              className="absolute bottom-20 right-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-glow hover:scale-105 transition-transform z-10 flex items-center gap-2"
            >
              <SkipForward className="w-4 h-4" /> Skip Intro
            </motion.button>
          )}
        </AnimatePresence>

        {/* Skip Outro */}
        <AnimatePresence>
          {showSkipOutro && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onClick={() => { if (videoRef.current && outro) videoRef.current.currentTime = outro.end; }}
              className="absolute bottom-20 right-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-glow hover:scale-105 transition-transform z-10 flex items-center gap-2"
            >
              <SkipForward className="w-4 h-4" /> Skip Outro
            </motion.button>
          )}
        </AnimatePresence>

        {/* Settings popup */}
        <AnimatePresence>
          {settingsOpen && showControls && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-16 right-4 w-56 bg-card/95 backdrop-blur-lg border border-border rounded-lg shadow-card overflow-hidden z-20"
            >
              {settingsPanel === "main" && (
                <div className="py-1">
                  <button onClick={() => setSettingsPanel("speed")} className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors">
                    <span className="flex items-center gap-2"><Gauge className="w-4 h-4" /> Speed</span>
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">{speed}x <ChevronRight className="w-3 h-3" /></span>
                  </button>
                  <button onClick={() => setSettingsPanel("caption")} className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors">
                    <span className="flex items-center gap-2"><Subtitles className="w-4 h-4" /> Captions</span>
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">{captionsOn ? subtitleTracks[activeTrackIdx]?.label || "On" : "Off"} <ChevronRight className="w-3 h-3" /></span>
                  </button>
                  <button onClick={() => setAmbientEnabled(!ambientEnabled)} className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors">
                    <span className="flex items-center gap-2"><Sun className="w-4 h-4" /> Ambient Mode</span>
                    <span className={`w-8 h-4 rounded-full transition-colors flex items-center ${ambientEnabled ? "bg-primary justify-end" : "bg-muted justify-start"}`}>
                      <span className="w-3 h-3 rounded-full bg-foreground mx-0.5" />
                    </span>
                  </button>
                  {onAutoPlayToggle && (
                    <button onClick={() => onAutoPlayToggle(!autoPlayNext)} className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors">
                      <span className="flex items-center gap-2"><SkipForward className="w-4 h-4" /> Autoplay Next</span>
                      <span className={`w-8 h-4 rounded-full transition-colors flex items-center ${autoPlayNext ? "bg-primary justify-end" : "bg-muted justify-start"}`}>
                        <span className="w-3 h-3 rounded-full bg-foreground mx-0.5" />
                      </span>
                    </button>
                  )}
                </div>
              )}

              {settingsPanel === "speed" && (
                <div className="py-1">
                  <button onClick={() => setSettingsPanel("main")} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:bg-secondary/80">
                    <ChevronRight className="w-3 h-3 rotate-180" /> Speed
                  </button>
                  <div className="border-t border-border" />
                  {SPEEDS.map((s) => (
                    <button key={s} onClick={() => changeSpeed(s)} className={`w-full px-4 py-2 text-sm text-left transition-colors hover:bg-secondary/80 ${speed === s ? "text-primary font-medium" : "text-foreground"}`}>
                      {s === 1 ? "Normal" : `${s}x`}
                    </button>
                  ))}
                </div>
              )}

              {settingsPanel === "caption" && (
                <div className="py-1">
                  <button onClick={() => setSettingsPanel("main")} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:bg-secondary/80">
                    <ChevronRight className="w-3 h-3 rotate-180" /> Captions
                  </button>
                  <div className="border-t border-border" />
                  <button
                    onClick={() => { setCaptionsOn(false); const v = videoRef.current; if (v) for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "hidden"; setSettingsPanel("main"); }}
                    className={`w-full px-4 py-2 text-sm text-left transition-colors hover:bg-secondary/80 ${!captionsOn ? "text-primary font-medium" : "text-foreground"}`}
                  >
                    Off
                  </button>
                  {subtitleTracks.map((t, i) => (
                    <button key={i} onClick={() => { setCaptionsOn(true); selectTrack(i); }} className={`w-full px-4 py-2 text-sm text-left transition-colors hover:bg-secondary/80 ${captionsOn && activeTrackIdx === i ? "text-primary font-medium" : "text-foreground"}`}>
                      {t.label || "Unknown"}
                    </button>
                  ))}
                  {subtitleTracks.length === 0 && <p className="px-4 py-2 text-xs text-muted-foreground">No captions available</p>}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls overlay */}
        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent p-4 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          {/* Progress bar */}
          <div
            className="w-full h-1.5 mb-3 cursor-pointer rounded-full bg-muted/40 group/progress relative"
            onClick={seek}
            onMouseMove={handleProgressHover}
            onMouseLeave={() => setHoverTime(null)}
          >
            {/* Buffered */}
            <div className="absolute h-full rounded-full bg-muted-foreground/20" style={{ width: `${bufferedPct}%` }} />
            {/* Progress */}
            <div className="h-full rounded-full bg-primary relative z-[1]" style={{ width: `${progress}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary shadow-glow opacity-0 group-hover/progress:opacity-100 transition-opacity" />
            </div>
            {/* Hover time tooltip */}
            {hoverTime !== null && (
              <div className="absolute -top-8 px-2 py-0.5 rounded bg-card text-xs text-foreground border border-border z-10 pointer-events-none" style={{ left: `${hoverPos}px`, transform: "translateX(-50%)" }}>
                {fmt(hoverTime)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Skip back 10s */}
              <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.max(0, v.currentTime - 10); flashCenter("rw"); } }} className="text-foreground hover:text-primary transition-colors">
                <SkipBack className="w-5 h-5" />
              </button>

              <button onClick={togglePlay} className="text-foreground hover:text-primary transition-colors">
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              {/* Skip forward 10s */}
              <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.min(v.duration, v.currentTime + 10); flashCenter("ff"); } }} className="text-foreground hover:text-primary transition-colors">
                <SkipForward className="w-5 h-5" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1 group/vol">
                <button onClick={toggleMute} className="text-foreground hover:text-primary transition-colors">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-0 group-hover/vol:w-16 transition-all duration-200 h-1 appearance-none cursor-pointer rounded-full bg-muted/40 overflow-hidden [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                />
              </div>

              <span className="text-xs text-muted-foreground hidden sm:inline">{fmt(currentTime)} / {fmt(duration)}</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {speed !== 1 && <span className="text-xs text-primary font-medium">{speed}x</span>}
              <button onClick={() => { setSettingsOpen(!settingsOpen); setSettingsPanel("main"); }} className="text-foreground hover:text-primary transition-colors">
                <Settings className="w-5 h-5" />
              </button>
              <button onClick={toggleFullscreen} className="text-foreground hover:text-primary transition-colors">
                {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
