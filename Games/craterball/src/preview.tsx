import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const CYAN = "#3bc7c4";
const MAGENTA = "#d94a8c";
const BALL_ORANGE = "#ff6b35";

function blob(xPct: number, zPct: number, size: number, color: string): CSSProperties {
  return {
    position: "absolute",
    left: `${xPct}%`,
    top: `${zPct}%`,
    width: `${size}cqmin`,
    height: `${size}cqmin`,
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    background: color,
    boxShadow: `0 0 ${size * 0.6}cqmin ${color}99`,
  };
}

export default function CraterballPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(circle at 50% 40%, #3a2013, #160f0c 75%)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "86cqw",
          height: "62cqh",
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 45%, #cdb891, #6b5a3f 55%, #23201d 100%)",
          border: "0.3cqmin solid rgba(255,107,53,0.5)",
          boxShadow: "0 0 4cqmin rgba(0,0,0,0.6) inset",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "17cqw",
            height: "31cqh",
            borderRadius: "50%",
            border: "0.2cqmin solid rgba(35,32,29,0.55)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "37.5%",
            width: "2.5cqw",
            height: "25%",
            background: "rgba(59,199,196,0.35)",
            boxShadow: "0 0 1.5cqmin rgba(59,199,196,0.7)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "37.5%",
            width: "2.5cqw",
            height: "25%",
            background: "rgba(217,74,140,0.35)",
            boxShadow: "0 0 1.5cqmin rgba(217,74,140,0.7)",
          }}
        />

        <div style={blob(36.8, 50, 5.5, CYAN)} />
        <div style={blob(71.5, 50, 5.5, MAGENTA)} />
        <div style={blob(50, 50, 4.2, BALL_ORANGE)} />
      </div>

      <span
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          fontSize: "2cqw",
          fontWeight: 800,
          letterSpacing: "0.1em",
          color: "#ffd7ba",
          textShadow: "0 0 1.2cqmin rgba(255,107,53,0.5)",
        }}
      >
        0 – 0
      </span>
    </div>
  );
}
