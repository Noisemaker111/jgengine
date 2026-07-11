import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const controlRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.8cqw",
};

const keyStyle: CSSProperties = {
  borderRadius: "0.4cqw",
  border: "1px solid rgba(223,230,238,0.4)",
  background: "#2b2f36",
  padding: "0.2cqw 0.6cqw",
  fontFamily: "ui-monospace, monospace",
  fontSize: "1.1cqw",
  color: "#dfe6ee",
};

const CONTROLS: { key: string; label: string }[] = [
  { key: "A/D", label: "LANE LEFT/RIGHT" },
  { key: "F", label: "FLIP POLARITY" },
  { key: "SHIFT", label: "BOOST" },
  { key: "SPACE", label: "START" },
];

export default function MagnetRunPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(180deg, #1a1d22, #16191d)",
        color: "#dfe6ee",
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
            "repeating-linear-gradient(90deg, rgba(255,210,63,0.08) 0 3cqw, transparent 3cqw 6cqw)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 50%, rgba(62,123,255,0.1), transparent 55%)",
        }}
      />

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "2cqw" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.4cqw",
            borderRadius: "1cqw",
            border: "1px solid rgba(223,230,238,0.15)",
            background: "rgba(32,36,42,0.95)",
            padding: "2.4cqw 3.2cqw",
            textAlign: "center",
            maxWidth: "70%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3cqw" }}>
            <span style={{ fontSize: "3.4cqw", fontWeight: 900, letterSpacing: "0.05em", color: "#dfe6ee" }}>
              MAGNET RUN
            </span>
            <span style={{ fontSize: "1.1cqw", fontWeight: 700, letterSpacing: "0.2em", color: "#ffd23f" }}>
              SECTOR 3 CLEAR OR BUST — TELEMETRY LIVE
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "1.6cqw",
              width: "100%",
              borderRadius: "0.6cqw",
              background: "rgba(43,47,54,0.7)",
              padding: "0.9cqw 1.4cqw",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6cqw", fontSize: "1.2cqw", fontWeight: 700 }}>
              <span style={{ height: "1.1cqw", width: "1.1cqw", borderRadius: "50%", background: "#ff4b3e" }} />
              RED BOT
            </div>
            <span style={{ fontSize: "1.1cqw", color: "rgba(223,230,238,0.4)" }}>sticks to</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6cqw", fontSize: "1.2cqw", fontWeight: 700 }}>
              <span style={{ height: "1.1cqw", width: "1.1cqw", borderRadius: "50%", background: "#3e7bff" }} />
              BLUE STRIP
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, auto)",
              gap: "0.6cqw 2cqw",
            }}
          >
            {CONTROLS.map((entry) => (
              <div key={entry.key} style={controlRowStyle}>
                <span style={keyStyle}>{entry.key}</span>
                <span style={{ fontSize: "1.1cqw", color: "rgba(223,230,238,0.8)" }}>{entry.label}</span>
              </div>
            ))}
          </div>

          <span
            style={{
              width: "100%",
              borderRadius: "0.6cqw",
              background: "#ff4b3e",
              padding: "1cqw 0",
              fontSize: "1.6cqw",
              fontWeight: 900,
              letterSpacing: "0.2em",
              color: "#fff",
            }}
          >
            START — SPACE
          </span>
        </div>
      </div>
    </div>
  );
}
