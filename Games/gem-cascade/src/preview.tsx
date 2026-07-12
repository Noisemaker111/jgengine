import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const GEM_COLORS: readonly [string, string][] = [
  ["#fb7185", "#e11d48"],
  ["#60a5fa", "#2563eb"],
  ["#6ee7b7", "#10b981"],
  ["#fcd34d", "#f59e0b"],
  ["#d8b4fe", "#a855f7"],
  ["#fdba74", "#f97316"],
  ["#67e8f9", "#06b6d4"],
];

const panelLabelStyle: CSSProperties = {
  fontSize: "0.95cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.28em",
  color: "#94a3b8",
};

const chipStyle: CSSProperties = {
  borderRadius: "0.7cqw",
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.05)",
  padding: "0.5cqw 1.2cqw",
  fontSize: "1.1cqw",
  fontWeight: 700,
  color: "#e2e8f0",
};

const BOARD_SIZE = 8;

function gemKindAt(x: number, y: number): number {
  return (x * 2 + y * 3 + Math.floor(x / 3)) % GEM_COLORS.length;
}

export default function GemCascadePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(circle at 50% 20%, #241a3d 0%, #140f24 45%, #07050d 100%)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 50%, rgba(168,85,247,0.12), transparent 60%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "2.5%",
          top: "18%",
          display: "flex",
          flexDirection: "column",
          gap: "0.8cqw",
          borderRadius: "1cqw",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.55)",
          padding: "1cqw 1.4cqw",
        }}
      >
        <span style={{ fontSize: "1.6cqw", fontWeight: 900, letterSpacing: "-0.01em", color: "#f0abfc" }}>
          Gem Cascade
        </span>
        <div style={{ display: "flex", gap: "0.7cqw" }}>
          <span
            style={{
              ...chipStyle,
              borderColor: "rgba(240,171,252,0.7)",
              background: "rgba(192,38,211,0.8)",
              color: "#fff",
            }}
          >
            Endless
          </span>
          <span style={chipStyle}>Timed</span>
          <span style={{ ...chipStyle, borderColor: "rgba(252,211,77,0.5)", background: "rgba(245,158,11,0.85)", color: "#0f172a" }}>
            New
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: "2.5%",
          top: "18%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "0.3cqw",
          borderRadius: "1cqw",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.55)",
          padding: "1cqw 1.6cqw",
        }}
      >
        <span style={panelLabelStyle}>Score</span>
        <span style={{ fontSize: "2.6cqw", fontWeight: 900, lineHeight: 1, color: "#fff" }}>0</span>
        <span style={{ fontSize: "1cqw", fontWeight: 600, color: "#fcd34d" }}>Best 0</span>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "56%",
          transform: "translate(-50%, -50%)",
          width: "min(56cqw, 62cqh)",
          aspectRatio: "1 / 1",
          borderRadius: "1.4cqw",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.55)",
          boxShadow: "0 0 8cqw rgba(120,60,200,0.28)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "3%",
            display: "grid",
            gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
            gap: "0.5cqw",
          }}
        >
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
            const x = i % BOARD_SIZE;
            const y = Math.floor(i / BOARD_SIZE);
            const [light, dark] = GEM_COLORS[gemKindAt(x, y)]!;
            return (
              <span
                key={i}
                style={{
                  position: "relative",
                  borderRadius: "22%",
                  background: `linear-gradient(135deg, ${light}, ${dark})`,
                  boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.25)`,
                }}
              />
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "2.5%",
          bottom: "9%",
          display: "flex",
          alignItems: "center",
          gap: "1cqw",
          borderRadius: "1cqw",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.55)",
          padding: "0.8cqw 1.2cqw",
        }}
      >
        <span
          style={{
            ...chipStyle,
            borderColor: "rgba(52,211,153,0.6)",
            background: "rgba(5,150,105,0.85)",
            color: "#fff",
          }}
        >
          Hint
        </span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={panelLabelStyle}>Moves</span>
          <span style={{ fontSize: "1.4cqw", fontWeight: 900, color: "#e2e8f0" }}>0</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "2.5%",
          transform: "translateX(-50%)",
          borderRadius: "999px",
          background: "rgba(0,0,0,0.45)",
          padding: "0.5cqw 1.4cqw",
          fontSize: "0.85cqw",
          fontWeight: 500,
          letterSpacing: "0.02em",
          color: "#94a3b8",
          whiteSpace: "nowrap",
        }}
      >
        Lineage: Shariki (Eugene Alemzhin, 1994) · Bejeweled (PopCap, 2001)
      </div>
    </div>
  );
}
