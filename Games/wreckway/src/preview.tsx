import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const rowLabelStyle: CSSProperties = {
  fontSize: "0.9cqw",
  fontWeight: 900,
  letterSpacing: "0.2em",
  color: "#8d99a6",
};

const controlRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.9cqw",
  fontSize: "1.1cqw",
  color: "#e7ddce",
};

const keyChipStyle: CSSProperties = {
  minWidth: "2.6cqw",
  textAlign: "center",
  borderRadius: "0.3cqw",
  border: "1px solid rgba(141,153,166,0.5)",
  background: "#1c1a17",
  padding: "0.25cqw 0.6cqw",
  fontSize: "1cqw",
  fontWeight: 700,
  color: "#f0c419",
};

const CONTROLS: readonly { key: string; label: string }[] = [
  { key: "W", label: "Throttle" },
  { key: "S", label: "Brake" },
  { key: "A", label: "Steer left" },
  { key: "D", label: "Steer right" },
  { key: "Space", label: "Jump" },
];

const PARTS: readonly string[] = ["Plow", "Springs", "Turbo", "Armor", "Winch", "Spikes"];

export default function WreckwayPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#1c1a17",
        color: "#fef3e0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "3cqw",
          borderRadius: "1.2cqw",
          border: "2px solid #b7410e",
          background: "#241f19",
          boxShadow: "0 0 6cqw rgba(0,0,0,0.6)",
          padding: "2.4cqw 3cqw",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <span style={{ fontSize: "1.1cqw", fontWeight: 900, letterSpacing: "0.3em", color: "#f0c419" }}>
          PIT RADIO — CHANNEL 6
        </span>
        <span
          style={{
            marginTop: "0.4cqw",
            fontSize: "5.2cqw",
            fontWeight: 900,
            letterSpacing: "-0.01em",
            color: "#fef3e0",
          }}
        >
          WRECKWAY
        </span>
        <span style={{ marginTop: "0.9cqw", maxWidth: "70%", fontSize: "1.15cqw", color: "#c9b8a4", lineHeight: 1.5 }}>
          The compactor line is crushing the yard behind you. Bolt on whatever you drive over, keep her ahead of the
          crushers, and hit the exit gate before Row Six catches up.
        </span>

        <div style={{ marginTop: "2.6cqw", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3cqw", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.9cqw" }}>
            <span style={rowLabelStyle}>CONTROLS</span>
            {CONTROLS.map((row) => (
              <div key={row.key} style={controlRowStyle}>
                <span style={keyChipStyle}>{row.key}</span>
                <span>{row.label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.9cqw" }}>
            <span style={rowLabelStyle}>PART LEGEND</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6cqw 1.4cqw" }}>
              {PARTS.map((part) => (
                <span key={part} style={{ fontSize: "1.05cqw", color: "#c9b8a4" }}>
                  {part}
                </span>
              ))}
            </div>
          </div>
        </div>

        <span
          style={{
            marginTop: "2cqw",
            alignSelf: "flex-start",
            borderRadius: "0.6cqw",
            border: "2px solid #f0c419",
            background: "#b7410e",
            padding: "1cqw 3cqw",
            fontSize: "1.5cqw",
            fontWeight: 900,
            letterSpacing: "0.15em",
            color: "#fef3e0",
          }}
        >
          BOLT IT ON, GO GO — ENTER
        </span>
      </div>
    </div>
  );
}
