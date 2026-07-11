import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const labelStyle: CSSProperties = {
  fontSize: "1.2cqw",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "#a5906f",
};

function LevelTile({ n, stars }: { n: number; stars: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.4cqw",
        borderRadius: "0.8cqw",
        border: "1px solid #4a4030",
        background: "#221b12",
        padding: "1cqw 0",
      }}
    >
      <span style={{ fontSize: "1.7cqw", fontWeight: 700, color: "#ece0c8" }}>{n}</span>
      <span style={{ fontSize: "1.4cqw", letterSpacing: "0.1em", color: "#ffbb3c" }}>
        {"★".repeat(stars)}
        <span style={{ color: "#463c2b" }}>{"★".repeat(3 - stars)}</span>
      </span>
      <span style={{ fontSize: "0.9cqw", fontFamily: "ui-monospace, monospace", color: "#8b7a5b" }}>—</span>
    </div>
  );
}

export default function LightsOutPreview({ className }: GamePreviewProps) {
  const levelStars = [3, 2, 3, 1, 0, 0, 2, 0, 0, 0, 0, 0];
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(125% 95% at 50% -5%, #241d14 0%, #17130d 46%, #0b0906 100%)",
        color: "#ece0c8",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "18%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "70%",
          maxWidth: "70%",
          borderRadius: "1.6cqw",
          border: "1px solid #3a3024",
          background: "linear-gradient(160deg, #241d15 0%, #191309 62%, #120d07 100%)",
          boxShadow: "0 2cqw 4cqw rgba(0,0,0,0.6)",
          padding: "2.2cqw",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1.6cqw" }}>
          <div>
            <div
              style={{
                fontSize: "3cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.3em",
                color: "#ffbb3c",
                textShadow: "0 0 1.6cqw rgba(255,170,45,0.5)",
              }}
            >
              Lights Out
            </div>
            <div style={labelStyle}>2 / 12 cleared · 5★</div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.8cqw",
              border: "1px solid #7a3c06",
              background: "linear-gradient(180deg, #ffb63e, #df7c11)",
              padding: "0.9cqw 1.8cqw",
              fontSize: "1.4cqw",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#2a1602",
            }}
          >
            Random
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "1cqw" }}>
          {levelStars.map((stars, i) => (
            <LevelTile key={i} n={i + 1} stars={stars} />
          ))}
        </div>

        <div style={{ marginTop: "1.6cqw", textAlign: "center", fontSize: "1.1cqw", color: "#6f6047" }}>
          Toggle a cell and its neighbors — clear the board in as few presses as par.
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "3%", right: "2.5%", fontSize: "1.1cqw", color: "#8b7a5b" }}>
        Lights Out — Tiger Electronics (1995)
      </div>
    </div>
  );
}
