import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderRadius: "0.8cqw",
  border: "1px solid rgba(232,213,163,0.2)",
  background: "rgba(15,31,28,0.6)",
  padding: "0.6cqw 1.2cqw",
};

const keyStyle: CSSProperties = {
  borderRadius: "0.4cqw",
  border: "1px solid rgba(232,213,163,0.4)",
  background: "#26413c",
  padding: "0.2cqw 0.8cqw",
  fontSize: "1.1cqw",
  fontWeight: 700,
  color: "#e8d5a3",
};

function ControlRow({ label, keyLabel }: { label: string; keyLabel: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: "1.2cqw", color: "rgba(232,213,163,0.8)" }}>{label}</span>
      <span style={keyStyle}>{keyLabel}</span>
    </div>
  );
}

export default function CourierZeroPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "rgba(15,31,28,0.85)",
        color: "#e8d5a3",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "1.6cqw",
          width: "68%",
          borderRadius: "1.4cqw",
          border: "1px solid rgba(42,157,143,0.5)",
          background: "rgba(38,65,60,0.95)",
          padding: "2.2cqw",
          textAlign: "center",
          boxShadow: "0 0 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3cqw" }}>
          <span style={{ fontSize: "1.3cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: "#2a9d8f" }}>
            Island Dispatch Radio
          </span>
          <span style={{ fontSize: "3.4cqw", fontWeight: 900, letterSpacing: "-0.02em", color: "#e8d5a3" }}>
            Courier Zero
          </span>
          <span style={{ fontSize: "1.3cqw", color: "rgba(232,213,163,0.75)" }}>
            The island's last courier. Deliver parcels between the four villages before the tide swallows every road.
          </span>
        </div>

        <span style={{ fontSize: "1.2cqw", fontStyle: "italic", color: "#e76f51" }}>
          "Tide's at your heels, Zero. Get moving."
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6cqw" }}>
          <ControlRow label="Move" keyLabel="WASD" />
          <ControlRow label="Sprint (stamina)" keyLabel="Shift" />
          <ControlRow label="Pick up / deliver" keyLabel="E" />
          <ControlRow label="Toggle flood chart" keyLabel="M" />
        </div>

        <span
          style={{
            borderRadius: "0.8cqw",
            background: "#e76f51",
            padding: "1cqw 2cqw",
            fontSize: "1.4cqw",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#26413c",
          }}
        >
          Start Run (Enter)
        </span>
      </div>
    </div>
  );
}
