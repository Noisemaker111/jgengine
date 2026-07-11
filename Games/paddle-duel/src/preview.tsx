import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const FONT = '"IBM Plex Mono", "SFMono-Regular", ui-monospace, Menlo, monospace';
const PHOSPHOR = "#c7ffd2";
const PHOSPHOR_BRIGHT = "#effff2";
const GLOW = "0 0 1cqw rgba(88,255,150,0.55), 0 0 2.4cqw rgba(88,255,150,0.22)";

const buttonStyle: CSSProperties = {
  borderRadius: "0.3cqw",
  border: "1px solid rgba(88,255,150,0.5)",
  padding: "1cqw 2cqw",
  fontSize: "1.4cqw",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: PHOSPHOR_BRIGHT,
  textShadow: GLOW,
  whiteSpace: "nowrap",
};

export default function PaddleDuelPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#04070a",
        color: PHOSPHOR,
        fontFamily: FONT,
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "6%",
          border: "1px solid rgba(88,255,150,0.18)",
          boxShadow: "0 0 4cqw rgba(88,255,150,0.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "6%",
          bottom: "6%",
          width: 0,
          borderLeft: "0.3cqw dashed rgba(88,255,150,0.3)",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "10%",
          top: "44%",
          width: "1.4cqw",
          height: "10cqw",
          background: PHOSPHOR,
          boxShadow: GLOW,
        }}
      />
      <span
        style={{
          position: "absolute",
          right: "10%",
          top: "44%",
          width: "1.4cqw",
          height: "10cqw",
          background: PHOSPHOR,
          boxShadow: GLOW,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "20%",
          width: "1.6cqw",
          height: "1.6cqw",
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          background: PHOSPHOR_BRIGHT,
          boxShadow: GLOW,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.72)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2.4cqw",
            textAlign: "center",
            width: "80%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2cqw" }}>
            <span
              style={{
                fontSize: "5cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.32em",
                color: PHOSPHOR_BRIGHT,
                textShadow: GLOW,
              }}
            >
              Paddle
            </span>
            <span
              style={{
                fontSize: "5cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.32em",
                color: PHOSPHOR_BRIGHT,
                textShadow: GLOW,
              }}
            >
              Duel
            </span>
            <span style={{ marginTop: "0.6cqw", fontSize: "1.3cqw", textTransform: "uppercase", letterSpacing: "0.28em", opacity: 0.7 }}>
              First to 11 · win by 2
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.2cqw", width: "100%", alignItems: "center" }}>
            <span style={{ fontSize: "1.3cqw", textTransform: "uppercase", letterSpacing: "0.3em", opacity: 0.6 }}>
              Versus CPU
            </span>
            <div style={{ display: "flex", gap: "1cqw" }}>
              <span style={buttonStyle}>Easy</span>
              <span style={buttonStyle}>Medium</span>
              <span style={buttonStyle}>Hard</span>
            </div>
            <span style={{ ...buttonStyle, width: "70%" }}>2 Players — W/S vs ↑/↓</span>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "1.6cqw",
              fontSize: "1.3cqw",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              opacity: 0.75,
            }}
          >
            <span style={{ opacity: 0.6 }}>Match wins</span>
            <span>Easy 0</span>
            <span>Medium 0</span>
            <span>Hard 0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
