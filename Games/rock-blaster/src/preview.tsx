import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelStyle: CSSProperties = {
  background: "rgba(2, 6, 16, 0.82)",
  border: "1px solid rgba(150, 190, 255, 0.35)",
  boxShadow: "0 0 3cqw rgba(40, 90, 180, 0.35)",
  borderRadius: "1.4cqw",
};

const titleStyle: CSSProperties = {
  color: "#f4f8ff",
  textShadow: "0 0 1.8cqw rgba(150, 210, 255, 0.7)",
  letterSpacing: "0.36em",
};

export default function RockBlasterPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#000000",
        color: "#f4f8ff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(1px 1px at 12% 22%, rgba(255,255,255,0.6), transparent), radial-gradient(1px 1px at 34% 68%, rgba(255,255,255,0.4), transparent), radial-gradient(1.5px 1.5px at 62% 30%, rgba(255,255,255,0.55), transparent), radial-gradient(1px 1px at 78% 78%, rgba(255,255,255,0.4), transparent), radial-gradient(1.5px 1.5px at 88% 18%, rgba(255,255,255,0.5), transparent)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            ...panelStyle,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "2.4cqw 4cqw",
            textAlign: "center",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <div style={{ ...titleStyle, fontSize: "3.6cqw", fontWeight: 900, textTransform: "uppercase" }}>
            Rock Blaster
          </div>
          <div
            style={{
              marginTop: "0.5cqw",
              fontSize: "1.1cqw",
              textTransform: "uppercase",
              letterSpacing: "0.3em",
              color: "#7fb0ff",
            }}
          >
            Inertial vector combat
          </div>
          <div style={{ marginTop: "1.4cqw", fontSize: "1cqw", lineHeight: 1.6, color: "#a9c4ef" }}>
            Rotate ← → / A D · Thrust ↑ / W · Fire Space
            <br />
            Hyperspace Shift · Pause P/Esc
          </div>
          <div
            style={{
              marginTop: "1.2cqw",
              fontSize: "1.3cqw",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "#ffcf6a",
            }}
          >
            Hi-Score 0
          </div>
          <span
            style={{
              marginTop: "1.4cqw",
              padding: "0.8cqw 2.4cqw",
              borderRadius: "999px",
              color: "#02121f",
              background: "#bfe0ff",
              fontSize: "1.3cqw",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.28em",
              boxShadow: "0 0 2.2cqw rgba(150, 210, 255, 0.55)",
            }}
          >
            Launch
          </span>
        </div>
      </div>
    </div>
  );
}
