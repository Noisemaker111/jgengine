import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const COLS = 7;
const ROWS = 6;

const boardFrameStyle: CSSProperties = {
  background: "linear-gradient(160deg, #2563eb 0%, #1d4ed8 45%, #1e3a8a 100%)",
  boxShadow:
    "inset 0 0.3cqw 0 rgba(255,255,255,0.35), inset 0 -0.6cqw 1.4cqw rgba(8,20,60,0.6), 0 3cqw 6cqw -3cqw rgba(6,20,60,0.9)",
  border: "0.08cqw solid rgba(191,219,254,0.35)",
};

const emptyHoleStyle: CSSProperties = {
  background: "radial-gradient(circle at 38% 32%, #16234a 0%, #101a38 60%, #0b1330 100%)",
  boxShadow: "inset 0.3cqw 0.4cqw 0.7cqw rgba(3,8,24,0.85), inset -0.15cqw -0.15cqw 0.3cqw rgba(120,150,220,0.25)",
};

function PlayerChip({ label, color, edge, active }: { label: string; color: string; edge: string; active: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.9cqw",
        borderRadius: "0.8cqw",
        padding: "0.7cqw 1.1cqw",
        background: active ? `${color}22` : "rgba(148,163,184,0.08)",
        boxShadow: active ? `inset 0 0 0 0.14cqw ${color}` : "inset 0 0 0 0.08cqw rgba(148,163,184,0.18)",
      }}
    >
      <span
        style={{
          height: "1.6cqw",
          width: "1.6cqw",
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, #ffffff88, ${color} 55%, ${edge})`,
        }}
      />
      <span style={{ fontSize: "1.3cqw", fontWeight: 700, color: active ? "#f8fafc" : "#94a3b8" }}>{label}</span>
    </div>
  );
}

export default function FourInARowPreview({ className }: GamePreviewProps) {
  const cells = Array.from({ length: ROWS * COLS }, (_, i) => i);

  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background:
          "radial-gradient(120% 90% at 50% 12%, #f1f5f9 0%, #dbe3ee 42%, #b6c2d6 78%, #93a2bd 100%)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(30,41,80,0.28) 100%)",
        }}
      />

      <div style={{ position: "absolute", top: "3%", right: "3%", display: "flex", flexDirection: "column", gap: "0.7cqw" }}>
        <PlayerChip label="Sunflower · You" color="#fbbf24" edge="#d97706" active />
        <PlayerChip label="Crimson · AI" color="#ef4444" edge="#991b1b" active={false} />
      </div>

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div style={{ ...boardFrameStyle, borderRadius: "1.4cqw", padding: "1.6cqw" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 5cqw)`, gap: "0.9cqw" }}>
            {cells.map((i) => (
              <div key={i} style={{ position: "relative", width: "5cqw", height: "5cqw", borderRadius: "50%", ...emptyHoleStyle }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
