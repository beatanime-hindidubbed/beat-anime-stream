import { useEffect, useState } from "react";

interface Props {
  showIcon?: boolean;
}

export default function PlayerWatermark({ showIcon = false }: Props) {
  // Randomize position slightly to prevent easy cropping
  const [pos, setPos] = useState({ top: true, right: true });

  useEffect(() => {
    const interval = setInterval(() => {
      setPos({
        top: Math.random() > 0.3,
        right: Math.random() > 0.3,
      });
    }, 30000); // shift every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`absolute z-30 flex items-center gap-1.5 pointer-events-none select-none transition-all duration-[2000ms] ${
        pos.top ? "top-3" : "bottom-14"
      } ${pos.right ? "right-3" : "left-3"}`}
      style={{ opacity: 0.45, mixBlendMode: "screen" }}
    >
      {showIcon && (
        <div
          className="w-5 h-5 rounded-sm bg-primary flex items-center justify-center shadow"
          style={{ fontSize: "11px", fontWeight: 900, color: "#000", lineHeight: 1 }}
        >
          B
        </div>
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
        Beat AniStream
      </span>
    </div>
  );
}
