import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const COLORS = {
  saucer: "#f472b6",
  squid: "#5ff2ff",
  crab: "#54ff9f",
  octopus: "#ffd166",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1cqw",
};

function ScoreRow({ color, label, points }: { color: string; label: string; points: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ width: "2cqw", height: "2cqw", background: color, borderRadius: "0.3cqw" }} />
      <span style={{ color: "#64748b", fontSize: "1.1cqw" }}>=</span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.1cqw", fontWeight: 800, color }}>{points}</span>
      <span style={{ fontSize: "1.1cqw", fontWeight: 700, color: "#e2e8f0" }}>{label}</span>
    </div>
  );
}

export default function StarInvadersPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(circle at 50% -20%, #071227 0%, #010208 60%)",
        color: "#fff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.5,
          backgroundImage:
            "radial-gradient(1.5px 1.5px at 12% 22%, #fff, transparent), radial-gradient(1.5px 1.5px at 32% 68%, #fff, transparent), radial-gradient(1.5px 1.5px at 58% 34%, #fff, transparent), radial-gradient(1.5px 1.5px at 78% 78%, #fff, transparent), radial-gradient(1.5px 1.5px at 88% 18%, #fff, transparent), radial-gradient(1.5px 1.5px at 20% 88%, #fff, transparent)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2.4cqw",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "4.4cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.3em",
              color: "#54ff9f",
              textShadow: "0 0 1.6cqw rgba(84,255,159,0.6)",
            }}
          >
            Star
          </div>
          <div
            style={{
              fontSize: "4.4cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.3em",
              color: "#5ff2ff",
              textShadow: "0 0 1.6cqw rgba(95,242,255,0.6)",
            }}
          >
            Invaders
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1cqw",
            borderRadius: "1cqw",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.03)",
            padding: "1.6cqw 2.4cqw",
          }}
        >
          <span
            style={{
              marginBottom: "0.4cqw",
              textAlign: "center",
              fontSize: "0.9cqw",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.3em",
              color: "#64748b",
            }}
          >
            Score Advance Table
          </span>
          <ScoreRow color={COLORS.saucer} label="Mystery" points="?" />
          <ScoreRow color={COLORS.squid} label="Squid" points="30" />
          <ScoreRow color={COLORS.crab} label="Crab" points="20" />
          <ScoreRow color={COLORS.octopus} label="Octopus" points="10" />
        </div>

        <span
          style={{
            borderRadius: "1cqw",
            border: "1px solid rgba(84,255,159,0.6)",
            background: "rgba(84,255,159,0.15)",
            padding: "1cqw 2.8cqw",
            fontSize: "1.4cqw",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.25em",
            color: "#d1fae5",
            boxShadow: "0 0 1.6cqw rgba(84,255,159,0.3)",
          }}
        >
          Press Space
        </span>

        <span
          style={{
            fontSize: "1cqw",
            textTransform: "uppercase",
            letterSpacing: "0.25em",
            color: "#64748b",
          }}
        >
          ← → / A D move · Space fire
        </span>
      </div>
    </div>
  );
}
