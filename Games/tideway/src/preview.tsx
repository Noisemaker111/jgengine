import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const CONTROL_ROWS: readonly { label: string; key: string }[] = [
  { label: "throttle up", key: "W" },
  { label: "throttle astern", key: "S" },
  { label: "rudder to port", key: "A" },
  { label: "rudder to starboard", key: "D" },
  { label: "brace turn", key: "Space" },
  { label: "restart", key: "R" },
];

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: "1.4cqw",
};

const keyStyle: CSSProperties = {
  minWidth: "3.6cqw",
  textAlign: "center",
  borderRadius: "0.3cqw",
  border: "1px solid rgba(242,193,78,0.5)",
  background: "#0e2a30",
  padding: "0.2cqw 0.7cqw",
  fontSize: "1.2cqw",
  fontWeight: 700,
  color: "#f2c14e",
};

export default function TidewayPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#0e2a30, #0a2126)",
        color: "#e6f2ef",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3cqw",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "58cqw",
            borderRadius: "0.3cqw",
            border: "1px solid rgba(242,193,78,0.4)",
            background: "#14505c",
            boxShadow: "0 0 60px rgba(0,0,0,0.5)",
            padding: "3cqw",
          }}
        >
          <span
            style={{
              position: "absolute",
              right: "2.4cqw",
              top: "2.4cqw",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "3.2cqw",
              width: "3.2cqw",
              borderRadius: "0.3cqw",
              border: "1px solid rgba(242,193,78,0.3)",
              background: "rgba(14,42,48,0.75)",
              color: "#f2c14e",
              fontSize: "1.6cqw",
            }}
          >
            ⚙
          </span>

          <span style={{ fontSize: "1.2cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.35em", color: "#f2c14e" }}>
            Race Committee
          </span>
          <div style={{ marginTop: "0.6cqw", fontSize: "5cqw", fontWeight: 900, letterSpacing: "-0.01em", color: "#e6f2ef" }}>
            TIDEWAY
          </div>
          <div style={{ marginTop: "0.8cqw", fontSize: "1.5cqw", color: "rgba(230,242,239,0.8)" }}>
            Harbor Regatta &middot; seed <span style={{ color: "#f2c14e" }}>tideway-harbor-7</span> &middot; 8 gates &middot; 2 laps
          </div>

          <p style={{ marginTop: "1.8cqw", fontSize: "1.5cqw", lineHeight: 1.55, color: "rgba(230,242,239,0.9)" }}>
            Read the water, ride the push. The current swings on a schedule — the wide channel that's fast this lap
            can turn to sludge the next.
          </p>

          <div
            style={{
              marginTop: "2cqw",
              display: "flex",
              flexDirection: "column",
              gap: "0.7cqw",
              borderTop: "1px solid rgba(230,242,239,0.15)",
              paddingTop: "1.8cqw",
            }}
          >
            {CONTROL_ROWS.map((row) => (
              <div key={row.label} style={rowStyle}>
                <span style={{ color: "rgba(230,242,239,0.8)" }}>{row.label}</span>
                <span style={keyStyle}>{row.key}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "2.4cqw",
              borderRadius: "0.3cqw",
              background: "#c74a34",
              color: "#e6f2ef",
              textAlign: "center",
              fontSize: "1.8cqw",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "1.3cqw",
            }}
          >
            Start Race &middot; Enter
          </div>
        </div>
      </div>
    </div>
  );
}
