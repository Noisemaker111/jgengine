import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  skyTop: "#241a45",
  skyMid: "#191234",
  skyBottom: "#0d0a24",
  hopper: "#7CFC5A",
  text: "#eaf3ff",
  textDim: "#9fb0d8",
  accent: "#5fd0ff",
  gold: "#ffcf5a",
} as const;

const FONT = "'Segoe UI', system-ui, sans-serif";

const btnStyle: CSSProperties = {
  padding: "0.9cqw 2.6cqw",
  borderRadius: "1cqw",
  border: "1px solid rgba(95,208,255,0.55)",
  background: "rgba(95,208,255,0.14)",
  color: PALETTE.text,
  fontSize: "1.4cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.22em",
  textShadow: "0 0 4px rgba(95,208,255,0.35)",
};

export default function RoadHopperPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `radial-gradient(circle at 50% -8%, ${PALETTE.skyTop} 0%, ${PALETTE.skyMid} 45%, ${PALETTE.skyBottom} 100%)`,
        color: PALETTE.text,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.4cqw",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: "6cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: PALETTE.hopper,
            textShadow: "0 0 3cqw rgba(124,252,90,0.55)",
          }}
        >
          Road Hopper
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: "1.3cqw",
            textTransform: "uppercase",
            letterSpacing: "0.34em",
            color: PALETTE.accent,
          }}
        >
          Cross the road · ride the river · fill all 5 homes
        </div>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.8cqw", color: PALETTE.gold }}>
          Best 0
        </div>
        <span style={btnStyle}>Start</span>
        <div
          style={{
            fontFamily: FONT,
            fontSize: "1.1cqw",
            textTransform: "uppercase",
            letterSpacing: "0.24em",
            color: PALETTE.textDim,
          }}
        >
          Arrows / WASD to hop · swipe on touch · P pause
        </div>
      </div>
    </div>
  );
}
