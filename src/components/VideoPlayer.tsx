import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipForward, Settings } from "lucide-react";

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
  startTime?: number;
}

export default function VideoPlayer({ src, tracks, intro, outro, onTimeUpdate, startTime }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startPosition: startTime || -1,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hlsRef.current = hls;
      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      if (startTime) video.currentTime = startTime;
      video.play().catch(() => {});
    }
  }, [src, startTime]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    setDuration(v.duration || 0);
    onTimeUpdate?.(v.currentTime, v.duration);

    if (intro) setShowSkipIntro(v.currentTime >= intro.start && v.currentTime < intro.end);
    else setShowSkipIntro(false);
    if (outro) setShowSkipOutro(v.currentTime >= outro.start && v.currentTime < outro.end);
    else setShowSkipOutro(false);
  }, [intro, outro, onTimeUpdate]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Number(e.target.value);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const skipIntro = () => {
    if (videoRef.current && intro) videoRef.current.currentTime = intro.end;
  };

  const skipOutro = () => {
    if (videoRef.current && outro) videoRef.current.currentTime = outro.end;
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-background rounded-lg overflow-hidden group"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { if (playing) setShowControls(false); }}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={togglePlay}
        crossOrigin="anonymous"
      >
        {tracks?.filter((t) => t.kind === "captions" || t.kind === "subtitles").map((t, i) => (
          <track key={i} src={t.file} label={t.label || "Unknown"} kind="subtitles" default={t.default} />
        ))}
      </video>

      {/* Skip buttons */}
      {showSkipIntro && (
        <button onClick={skipIntro} className="absolute bottom-20 right-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity z-10">
          Skip Intro
        </button>
      )}
      {showSkipOutro && (
        <button onClick={skipOutro} className="absolute bottom-20 right-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity z-10">
          Skip Outro
        </button>
      )}

      {/* Controls */}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}>
        {/* Progress bar */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          value={currentTime}
          onChange={seek}
          className="w-full h-1 mb-3 appearance-none cursor-pointer rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          style={{
            background: `linear-gradient(to right, hsl(175 80% 50%) ${(currentTime / (duration || 1)) * 100}%, hsl(220 15% 18%) ${(currentTime / (duration || 1)) * 100}%)`,
          }}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-foreground hover:text-primary transition-colors">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button onClick={toggleMute} className="text-foreground hover:text-primary transition-colors">
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <span className="text-xs text-muted-foreground">{fmt(currentTime)} / {fmt(duration)}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleFullscreen} className="text-foreground hover:text-primary transition-colors">
              {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
