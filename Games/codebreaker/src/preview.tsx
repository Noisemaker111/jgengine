import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PEG_COLORS: readonly string[] = [
  "#d5493f",
  "#e8892d",
  "#e7c53a",
  "#4f9d5b",
  "#4aa3d6",
  "#8b73c9",
];

const PEG_GLYPHS: readonly string[] = ["●", "■", "▲", "★", "♥", "♦"];

function pegStyle(color: string): CSSProperties {
  return {
    background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.7) 0%, ${color} 40%, ${color} 62%, rgba(0,0,0,0.42) 100%)`,
    boxShadow: "inset 0 -0.15cqw 0.3cqw rgba(0,0,0,0.45), 0 0.15cqw 0.3cqw rgba(0,0,0,0.4)",
    border: "1px solid rgba(0,0,0,0.32)",
  };
}

const wellStyle: CSSProperties = {
  background: "radial-gradient(circle at 50% 35%, #241708 0%, #130b04 72%)",
  boxShadow: "inset 0 0.15cqw 0.35cqw rgba(0,0,0,0.7)",
  border: "1px solid rgba(0,0,0,0.55)",
};

const keyDotStyle: CSSProperties = {
  background: "radial-gradient(circle at 50% 40%, #5a4423 0%, #38290f 72%)",
  boxShadow: "inset 0 0.1cqw 0.15cqw rgba(0,0,0,0.6)",
  border: "1px solid rgba(40,28,12,0.6)",
};

function Peg({ color, glyph }: { color?: string; glyph?: string }) {
  if (color === undefined) {
    return <span style={{ ...wellStyle, width: "2.6cqw", height: "2.6cqw", borderRadius: "50%", display: "inline-block" }} />;
  }
  return (
    <span
      style={{
        ...pegStyle(color),
        width: "2.6cqw",
        height: "2.6cqw",
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.3cqw",
        fontWeight: 800,
        color: "rgba(18,9,0,0.72)",
      }}
    >
      {glyph}
    </span>
  );
}

function KeyCluster() {
  return (
    <span
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "0.25cqw",
        borderRadius: "0.4cqw",
        padding: "0.35cqw",
        background: "linear-gradient(145deg, #b98b3e 0%, #8a6528 55%, #6d4f20 100%)",
        border: "1px solid rgba(60,40,15,0.7)",
      }}
    >
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} style={{ ...keyDotStyle, width: "0.9cqw", height: "0.9cqw", borderRadius: "50%" }} />
      ))}
    </span>
  );
}

function GuessRow({ index, active }: { index: number; active: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.7cqw",
        borderRadius: "0.6cqw",
        padding: "0.35cqw 0.6cqw",
        background: active ? "rgba(252,211,77,0.08)" : "transparent",
        boxShadow: active ? "inset 0 0 0 0.15cqw rgba(252,211,77,0.5)" : "none",
      }}
    >
      <span style={{ width: "1.2cqw", textAlign: "right", fontSize: "0.9cqw", fontWeight: 700, color: "rgba(252,211,77,0.4)" }}>
        {index}
      </span>
      <div style={{ display: "flex", gap: "0.5cqw" }}>
        {Array.from({ length: 4 }, (_, i) => (
          <Peg key={i} />
        ))}
      </div>
      <KeyCluster />
    </div>
  );
}

export default function CodebreakerPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(130% 120% at 50% 0%, #3a2c22 0%, #241a13 52%, #150e09 100%)",
        color: "#fde8c8",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "6%",
          bottom: "4%",
          transform: "translateX(-50%)",
          width: "44cqw",
          borderRadius: "1.2cqw",
          background: "linear-gradient(158deg, #5c4029 0%, #442d1c 46%, #35220f 100%)",
          border: "1px solid rgba(0,0,0,0.5)",
          boxShadow: "inset 0 1px 0 rgba(255,214,170,0.18), 0 1.6cqw 3.6cqw rgba(0,0,0,0.55)",
          padding: "1.4cqw",
          display: "flex",
          flexDirection: "column",
          gap: "0.35cqw",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.8cqw",
            borderRadius: "0.6cqw",
            padding: "0.6cqw 0.8cqw",
            marginBottom: "0.4cqw",
            background: "linear-gradient(150deg, #7a5a2b 0%, #5a4120 60%, #45311a 100%)",
            border: "1px solid rgba(30,20,8,0.7)",
          }}
        >
          <span style={{ fontSize: "0.9cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(20,12,2,0.7)" }}>
            Secret
          </span>
          <div style={{ display: "flex", gap: "0.5cqw" }}>
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                style={{
                  ...wellStyle,
                  width: "2.6cqw",
                  height: "2.6cqw",
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.3cqw",
                  fontWeight: 800,
                  color: "rgba(255,220,170,0.4)",
                }}
              >
                ?
              </span>
            ))}
          </div>
        </div>

        {Array.from({ length: 10 }, (_, i) => (
          <GuessRow key={i} index={i + 1} active={i === 0} />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "1.4%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "0.8cqw",
        }}
      >
        {PEG_COLORS.map((color, i) => (
          <span
            key={i}
            style={{
              ...pegStyle(color),
              width: "3cqw",
              height: "3cqw",
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5cqw",
              fontWeight: 800,
              color: "rgba(18,9,0,0.72)",
            }}
          >
            {PEG_GLYPHS[i]}
          </span>
        ))}
      </div>

    </div>
  );
}
