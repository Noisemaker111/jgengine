import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "2.2cqw",
  height: "2.2cqw",
  padding: "0 0.5cqw",
  borderRadius: "0.4cqw",
  border: "1px solid rgba(232,230,240,0.25)",
  background: "rgba(21,21,29,0.9)",
  fontSize: "1.1cqw",
  fontWeight: 700,
  color: "#e8e6f0",
};

const CONTROLS: readonly { key: string; label: string }[] = [
  { key: "W", label: "Throttle" },
  { key: "S", label: "Brake / Reverse" },
  { key: "A", label: "Steer Left" },
  { key: "D", label: "Steer Right" },
  { key: "Space", label: "Handbrake Drift" },
  { key: "Shift", label: "Boost" },
];

export default function DriftDistrictPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 50% 50%, rgba(255,45,120,0.16), rgba(10,10,16,0.94) 70%)",
        color: "#e8e6f0",
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
          gap: "2cqw",
          padding: "0 4cqw",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6cqw" }}>
          <span style={{ fontSize: "1.1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5em", color: "#29d9e0" }}>
            Neon Noir Arcade Racer
          </span>
          <span
            style={{
              fontSize: "5.4cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              color: "#e8e6f0",
              textShadow: "0 0 22px rgba(255,45,120,0.55)",
            }}
          >
            Drift District
          </span>
          <span style={{ fontSize: "1.3cqw", color: "rgba(232,230,240,0.7)", maxWidth: "60cqw" }}>
            Three laps through Harbor, Downtown, and Heights. Drift a gate hard and the district reshuffles the road ahead.
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, auto)",
            gap: "0.8cqw 2.4cqw",
            borderRadius: "0.6cqw",
            border: "1px solid rgba(232,230,240,0.15)",
            background: "rgba(21,21,29,0.9)",
            padding: "1.4cqw 2.4cqw",
          }}
        >
          {CONTROLS.map((control) => (
            <div key={control.key} style={{ display: "flex", alignItems: "center", gap: "0.8cqw" }}>
              <span style={badgeStyle}>{control.key}</span>
              <span style={{ fontSize: "1.1cqw", color: "rgba(232,230,240,0.8)" }}>{control.label}</span>
            </div>
          ))}
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "1cqw",
            borderRadius: "999px",
            border: "2px solid #ff2d78",
            background: "rgba(255,45,120,0.1)",
            padding: "0.9cqw 3cqw",
            fontSize: "1.6cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "#ff2d78",
          }}
        >
          Send It
          <span style={badgeStyle}>Enter</span>
        </span>
      </div>
    </div>
  );
}
