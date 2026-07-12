import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const BLOCK_COLORS: readonly string[] = ["#5a8a3c", "#7a5a3a", "#8a8a8a", "#a06b3a", "#3a6b2a", "#d9c58a"];

const hudLabelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "rgba(255,255,255,0.6)",
};

export default function VoxelMinePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#7ec8e3 0%, #bfe3f0 42%, #6a9e4a 42.5%, #4a7a34 100%)",
        color: "#fff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "42.5%",
          bottom: 0,
          display: "grid",
          gridTemplateColumns: "repeat(14, 1fr)",
          gap: "0.15cqw",
          padding: "0.4cqw",
        }}
      >
        {Array.from({ length: 84 }, (_, i) => (
          <span
            key={i}
            style={{
              aspectRatio: "1",
              background: BLOCK_COLORS[(i * 7 + Math.floor(i / 14)) % BLOCK_COLORS.length],
              boxShadow: "inset -0.15cqw -0.15cqw 0 rgba(0,0,0,0.18), inset 0.1cqw 0.1cqw 0 rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </div>

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <span style={{ position: "relative", width: "2.6cqw", height: "2.6cqw" }}>
          <span style={{ position: "absolute", left: "50%", top: 0, width: "0.2cqw", height: "1.1cqw", transform: "translateX(-50%)", background: "rgba(255,255,255,0.85)" }} />
          <span style={{ position: "absolute", left: "50%", bottom: 0, width: "0.2cqw", height: "1.1cqw", transform: "translateX(-50%)", background: "rgba(255,255,255,0.85)" }} />
          <span style={{ position: "absolute", top: "50%", left: 0, height: "0.2cqw", width: "1.1cqw", transform: "translateY(-50%)", background: "rgba(255,255,255,0.85)" }} />
          <span style={{ position: "absolute", top: "50%", right: 0, height: "0.2cqw", width: "1.1cqw", transform: "translateY(-50%)", background: "rgba(255,255,255,0.85)" }} />
        </span>
      </div>

      <div style={{ position: "absolute", top: "16%", left: "3%", display: "flex", flexDirection: "column", gap: "0.5cqw" }}>
        <div style={{ ...hudLabelStyle, color: "#fde68a" }}>Mining Basics</div>
        <div style={{ fontSize: "1cqw", color: "#6ee7b7" }}>● Coal 0/5</div>
        <div style={{ fontSize: "1cqw", color: "rgba(255,255,255,0.85)" }}>● Iron 0/3</div>
      </div>

      <div style={{ position: "absolute", top: "16%", right: "3%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.6cqw" }}>
        <span style={hudLabelStyle}>Pack</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.35cqw" }}>
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              style={{
                width: "2.4cqw",
                height: "2.4cqw",
                borderRadius: "0.3cqw",
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "4%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.6cqw",
        }}
      >
        <div
          style={{
            borderRadius: "0.4cqw",
            background: "rgba(0,0,0,0.45)",
            padding: "0.4cqw 1.2cqw",
            fontSize: "1.1cqw",
            fontWeight: 600,
          }}
        >
          Pickaxe <span style={{ color: "rgba(255,255,255,0.55)" }}>Mine</span>
        </div>
        <div style={{ display: "flex", gap: "0.5cqw" }}>
          {["Pickaxe", ...BLOCK_COLORS].map((entry, index) => (
            <span
              key={index}
              style={{
                position: "relative",
                width: "3.4cqw",
                height: "3.4cqw",
                borderRadius: "0.4cqw",
                background: index === 0 ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.35)",
                border: index === 0 ? "2px solid #fcd34d" : "1px solid rgba(255,255,255,0.15)",
                display: "grid",
                placeItems: "center",
              }}
            >
              {index > 0 ? (
                <span style={{ width: "1.7cqw", height: "1.7cqw", borderRadius: "0.25cqw", background: BLOCK_COLORS[index - 1] }} />
              ) : (
                <span style={{ fontSize: "1.4cqw" }}>⛏</span>
              )}
              <span style={{ position: "absolute", bottom: "0.1cqw", right: "0.25cqw", fontSize: "0.75cqw", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
                {index + 1}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
