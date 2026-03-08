import { useEffect, useRef } from "react";
import { useSiteSettings, ParticleEffect } from "@/hooks/useSiteSettings";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  rotation: number;
  vr: number;
  char?: string;
  flickerSpeed?: number;
  flickerPhase?: number;
}

const CONFIGS: Record<ParticleEffect, { count: number; colors: string[]; chars?: string[]; speed: number; sizeRange: [number, number] }> = {
  none: { count: 0, colors: [], speed: 0, sizeRange: [0, 0] },
  stars: { count: 40, colors: ["#fff", "#ffd700", "#87ceeb", "#dda0dd"], speed: 0.3, sizeRange: [1, 3] },
  sakura: { count: 30, colors: ["#ffb7c5", "#ff69b4", "#ffc0cb", "#ff91a4", "#f8a4c8"], chars: ["🌸"], speed: 0.8, sizeRange: [10, 20] },
  snow: { count: 50, colors: ["#fff", "#e8e8e8", "#dce6f0", "#c8dff0"], speed: 0.5, sizeRange: [2, 5] },
  diyas: { count: 20, colors: ["#ff9500", "#ffd700", "#ff6b00", "#ffaa00"], chars: ["🪔", "✨", "🕯️"], speed: 0.2, sizeRange: [12, 20] },
  colors: { count: 30, colors: ["#ff0080", "#00ff80", "#8000ff", "#ff8000", "#0080ff", "#ff0040"], speed: 0.6, sizeRange: [4, 8] },
  tricolor: { count: 30, colors: ["#ff9933", "#ffffff", "#138808"], speed: 0.4, sizeRange: [3, 6] },
  lanterns: { count: 15, colors: ["#ff4444", "#ff6600", "#ffcc00", "#ff3366"], chars: ["🏮", "🎐", "🎋"], speed: 0.15, sizeRange: [14, 22] },
  fireflies: { count: 35, colors: ["#ccff00", "#aaff44", "#ffee55", "#88ff66"], speed: 0.2, sizeRange: [2, 4] },
};

export default function ParticleCanvas() {
  const { settings } = useSiteSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const effect = settings.particleEffect || "none";
    const config = CONFIGS[effect];
    if (!config || config.count === 0) {
      particlesRef.current = [];
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    particlesRef.current = Array.from({ length: config.count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * config.speed,
      vy: Math.random() * config.speed + 0.2,
      size: config.sizeRange[0] + Math.random() * (config.sizeRange[1] - config.sizeRange[0]),
      opacity: 0.3 + Math.random() * 0.7,
      color: config.colors[Math.floor(Math.random() * config.colors.length)],
      rotation: Math.random() * 360,
      vr: (Math.random() - 0.5) * 2,
      char: config.chars ? config.chars[Math.floor(Math.random() * config.chars.length)] : undefined,
      flickerSpeed: 0.02 + Math.random() * 0.04,
      flickerPhase: Math.random() * Math.PI * 2,
    }));

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      for (const p of particlesRef.current) {
        // Sakura: add gentle swaying
        if (effect === "sakura") {
          p.vx = Math.sin(frame * 0.01 + p.flickerPhase!) * 0.5;
        }
        
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vr;

        if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);

        // Fireflies: pulsing opacity
        if (effect === "fireflies") {
          p.opacity = 0.3 + Math.abs(Math.sin(frame * p.flickerSpeed! + p.flickerPhase!)) * 0.7;
        }

        ctx.globalAlpha = p.opacity;

        if (p.char) {
          ctx.font = `${p.size}px serif`;
          ctx.textAlign = "center";
          ctx.fillText(p.char, 0, 0);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();

          // Glow effect for stars and fireflies
          if (effect === "stars" || effect === "fireflies") {
            ctx.shadowBlur = p.size * (effect === "fireflies" ? 6 : 3);
            ctx.shadowColor = p.color;
            ctx.fill();
          }
        }
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [settings.particleEffect]);

  if (!settings.particleEffect || settings.particleEffect === "none") return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[1] pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}
