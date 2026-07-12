import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  cloudWhite: "#f4f7f9",
  skyTeal: "#4ecdc4",
  citySlate: "#5d737e",
  windsockOrange: "#ff9f1c",
} as const;

function Control({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6cqw" }}>
      <span
        style={{
          borderRadius: "0.35cqw",
          border: "1px solid rgba(93,115,126,0.5)",
          background: "rgba(78,205,196,0.08)",
          padding: "0.3cqw 0.7cqw",
          fontSize: "1cqw",
          fontWeight: 700,
          color: PALETTE.skyTeal,
        }}
      >
        {label[0]}
      </span>
      <span style={{ fontSize: "1cqw", color: "rgba(244,247,249,0.8)" }}>{label}</span>
    </div>
  );
}

const CONTROLS = ["Pitch Up", "Pitch Down", "Yaw Left", "Yaw Right", "Thrust", "Airbrake", "Dodge", "Restart"];

export default function TurbineCityPreview({ className }: GamePreviewProps) {
  const style: CSSProperties = {
    containerType: "size",
    position: "relative",
    height: "100%",
    width: "100%",
    overflow: "hidden",
    background: `radial-gradient(circle at center, ${PALETTE.skyTeal}22, #0d1b1c 78%)`,
    color: PALETTE.cloudWhite,
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    userSelect: "none",
  };

  return (
    <div className={className} style={style}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.6cqw",
          padding: "0 4cqw",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5cqw" }}>
          <span style={{ fontSize: "1.1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5em", color: PALETTE.skyTeal }}>
            Cloud-City Aerodrome
          </span>
          <span style={{ fontSize: "6cqw", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em", lineHeight: 1, color: PALETTE.cloudWhite }}>
            Turbine City
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, auto)",
            columnGap: "2.4cqw",
            rowGap: "0.8cqw",
            borderRadius: "0.8cqw",
            border: `1px solid ${PALETTE.citySlate}55`,
            background: "#0f1d1e",
            padding: "1.2cqw 2cqw",
          }}
        >
          {CONTROLS.map((label) => (
            <Control key={label} label={label} />
          ))}
        </div>

        <span
          style={{
            borderRadius: "999px",
            border: `2px solid ${PALETTE.windsockOrange}`,
            background: `${PALETTE.windsockOrange}1a`,
            color: PALETTE.windsockOrange,
            padding: "1cqw 3cqw",
            fontSize: "1.8cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
          }}
        >
          Cleared for Departure
        </span>
      </div>
    </div>
  );
}
