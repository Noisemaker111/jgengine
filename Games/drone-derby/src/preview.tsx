import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const RING_BLUE = "#4cc9f0";
const DRONE_LIME = "#9ef01a";
const DRONE_BODY = "#20242b";

function silhouette(leftPct: number, w: number, h: number): CSSProperties {
  return {
    position: "absolute",
    left: `${leftPct}%`,
    bottom: 0,
    width: `${w}cqw`,
    height: `${h}cqh`,
    background: "linear-gradient(#3a4048, #14171b)",
  };
}

function rotor(side: "left" | "right", edge: "top" | "bottom"): CSSProperties {
  return {
    position: "absolute",
    [side]: "-2cqw",
    [edge]: "-1.4cqw",
    width: "3.2cqmin",
    height: "3.2cqmin",
    borderRadius: "50%",
    background: DRONE_LIME,
    boxShadow: `0 0 1.4cqmin ${DRONE_LIME}`,
  };
}

export default function DroneDerbyPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#2c3540 0%, #1c2027 45%, #14171b 100%)",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={silhouette(4, 14, 20)} />
      <div style={silhouette(20, 10, 14)} />
      <div style={silhouette(72, 11, 16)} />
      <div style={silhouette(86, 13, 24)} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "26%",
          transform: "translate(-50%, -50%)",
          width: "20cqmin",
          height: "20cqmin",
          borderRadius: "50%",
          border: `0.6cqmin solid ${RING_BLUE}`,
          boxShadow: `0 0 3cqmin ${RING_BLUE}aa, inset 0 0 2cqmin ${RING_BLUE}66`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "16%",
          transform: "translate(-50%, 0)",
          width: "13cqw",
          height: "5cqw",
          borderRadius: "1.2cqmin",
          background: DRONE_BODY,
          boxShadow: "0 0.6cqmin 1.4cqmin rgba(0,0,0,0.6)",
        }}
      >
        <div style={rotor("left", "top")} />
        <div style={rotor("right", "top")} />
        <div style={rotor("left", "bottom")} />
        <div style={rotor("right", "bottom")} />
      </div>

      <span
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          fontSize: "1.3cqw",
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#eef2f5",
          textShadow: `0 0 1cqmin ${DRONE_LIME}88`,
        }}
      >
        Short — Ring 1/8
      </span>
    </div>
  );
}
