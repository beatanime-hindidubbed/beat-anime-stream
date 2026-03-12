import { useEffect, useState } from "react";
import { useIsPremium } from "@/hooks/useIsPremium";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

interface Props {
  showIcon?: boolean;
}

export default function PlayerWatermark({ showIcon = false }: Props) {
  const { isPremium } = useIsPremium();
  const { isAdmin } = useSupabaseAuth();
  const [pos, setPos] = useState({ top: true, right: true });

  useEffect(() => {
    const interval = setInterval(() => {
      setPos({
        top: Math.random() > 0.3,
        right: Math.random() > 0.3,
      });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Premium users and admins don't see watermark
  if (isPremium || isAdmin) return null;

  return (
    <div
      className={`absolute z-30 flex items-center gap-1.5 pointer-events-none select-none transition-all duration-[2000ms] ${
        pos.top ? "top-3" : "bottom-14"
      } ${pos.right ? "right-3" : "left-3"}`}
      style={{ opacity: 0.45, mixBlendMode: "screen" }}
    >
      {showIcon && (
        <img
          src="/logo.png"
          alt="BeatAnime"
          className="w-5 h-5 rounded-sm object-contain shadow"
          draggable={false}
        />
      )}
      <span
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: "13px",
          color: "rgba(255,255,255,0.75)",
          letterSpacing: "0.06em",
          textShadow: "0 1px 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.5)",
          userSelect: "none",
        }}
      >
        @BeatAnime
      </span>
    </div>
  );
}
