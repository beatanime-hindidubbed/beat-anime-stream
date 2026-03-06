// src/components/PlayerWatermark.tsx
// Translucent watermark for video players - text always visible, icon on disturbance

import { useEffect, useState } from "react";

interface Props {
  showIcon?: boolean; // show favicon icon (when player is disturbed)
}

export default function PlayerWatermark({ showIcon = false }: Props) {
  return (
    <div
      className="absolute top-3 right-3 z-30 flex items-center gap-1.5 pointer-events-none select-none"
      style={{
        opacity: 0.55,
        mixBlendMode: "screen",
      }}
    >
      {/* Favicon/icon - only visible when player is disturbed */}
      {showIcon && (
        <div
          className="w-5 h-5 rounded-sm bg-primary flex items-center justify-center shadow"
          style={{ fontSize: "11px", fontWeight: 900, color: "#000", lineHeight: 1 }}
        >
          B
        </div>
      )}
      {/* Text - always visible, translucent white */}
      <span
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: "12px",
          color: "rgba(255,255,255,0.7)",
          letterSpacing: "0.05em",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          userSelect: "none",
        }}
      >
        BeatAnime
      </span>
    </div>
  );
}
