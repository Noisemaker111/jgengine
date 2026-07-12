import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const CONTROL_ROWS: readonly { label: string; key: string }[] = [
  { label: "Throttle", key: "W" },
  { label: "Brake", key: "S" },
  { label: "Steer left", key: "A" },
  { label: "Steer right", key: "D" },
  { label: "Handbrake", key: "Space" },
  { label: "Restart", key: "R" },
];

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderRadius: "0.6cqw",
  border: "1px solid #3d4a5c",
  background: "#141b23",
  padding: "0.7cqw 1cqw",
  fontSize: "1.3cqw",
  color: "#9fb8c8",
};

const keyStyle: CSSProperties = {
  borderRadius: "0.4cqw",
  border: "1px solid rgba(217,164,65,0.6)",
  padding: "0.15cqw 0.7cqw",
  fontWeight: 700,
  color: "#d9a441",
};

export default function StormlinePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#1e2633",
        color: "#e6edf3",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% -10%, rgba(242,92,5,0.16), transparent 45%), linear-gradient(#161c26, #10151d)",
        }}
      />
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
            width: "62cqw",
            borderRadius: "1.4cqw",
            border: "1px solid #3d4a5c",
            background: "#1e2633",
            boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
            padding: "3cqw",
          }}
        >
          <div>
            <span style={{ fontSize: "1.2cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: "#f25c05" }}>
              Big Sky Thunder Western
            </span>
            <div style={{ marginTop: "0.6cqw", fontSize: "4.4cqw", fontWeight: 800, color: "#d9a441" }}>Stormline</div>
            <div style={{ marginTop: "0.6cqw", fontSize: "1.5cqw", color: "#9fb8c8" }}>
              Route: Cutbank Run · Seed stormline-cutbank-run · 6 gates to shelter
            </div>
          </div>

          <p style={{ marginTop: "1.8cqw", fontSize: "1.5cqw", lineHeight: 1.5, color: "#9fb8c8" }}>
            "Storm wall's building behind you, driver. Every fork gives you a fast road that hugs the storm and a
            slow road that stays dry. Ride the line — she's closing."
          </p>

          <div style={{ marginTop: "2cqw", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8cqw" }}>
            {CONTROL_ROWS.map((row) => (
              <div key={row.label} style={rowStyle}>
                <span>{row.label}</span>
                <span style={keyStyle}>{row.key}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "2.2cqw",
              borderRadius: "1cqw",
              background: "#f25c05",
              color: "#1e2633",
              textAlign: "center",
              fontSize: "1.7cqw",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "1.2cqw",
            }}
          >
            Roll out — Enter
          </div>
        </div>
      </div>
    </div>
  );
}
