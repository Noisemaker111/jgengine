import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  cream: "#f2e8cf",
  forestGreen: "#386641",
  signalRed: "#bc4749",
  brass: "#a98467",
  ink: "#211d14",
} as const;

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1.4cqw",
  fontFamily: "ui-monospace, monospace",
  fontSize: "1.3cqw",
  color: "rgba(242,232,207,0.85)",
};

const keyStyle: CSSProperties = {
  borderRadius: "0.3cqw",
  border: "1px solid #a98467",
  background: "#1a160f",
  padding: "0.3cqw 0.9cqw",
  fontSize: "1.1cqw",
  textTransform: "uppercase",
  color: PALETTE.cream,
};

const CONTROLS = [
  { help: "Pump / hold speed", key: "Space" },
  { help: "Brake", key: "Shift" },
  { help: "Throw next junction", key: "E" },
  { help: "Expand dispatcher board", key: "Tab" },
];

export default function RailRushersPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#1a160f",
        color: PALETTE.cream,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 20%, rgba(56,102,65,0.22), transparent 40%), linear-gradient(#211d14, #14110c)",
        }}
      />

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "4cqw" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.8cqw",
            width: "70cqw",
            borderRadius: "0.5cqw",
            border: "2px solid #a98467",
            background: "#211d14",
            boxShadow: "0 1cqw 0 rgba(0,0,0,0.5)",
            padding: "2.6cqw",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.5cqw",
              borderBottom: "2px solid #a98467",
              paddingBottom: "1.6cqw",
              textAlign: "center",
            }}
          >
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.2cqw", textTransform: "uppercase", letterSpacing: "0.3em", color: PALETTE.brass }}>
              Mountain Rail Network
            </span>
            <span style={{ fontSize: "3.6cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: PALETTE.cream }}>
              Rail Rushers
            </span>
            <span style={{ maxWidth: "56cqw", fontFamily: "ui-monospace, monospace", fontSize: "1.3cqw", lineHeight: 1.5, color: "rgba(242,232,207,0.8)" }}>
              Pump the handcar from Depot to Summit Terminus before the Evening Express arrives — throw junctions ahead of
              you, dodge freights on the spurs, and squeeze the single-track tunnel and trestle clean.
            </span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.2cqw", textTransform: "uppercase", letterSpacing: "0.14em", color: PALETTE.signalRed }}>
              Express due at Terminus — 240 seconds
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1cqw 3cqw" }}>
            {CONTROLS.map((c) => (
              <div key={c.help} style={rowStyle}>
                <span>{c.help}</span>
                <span style={keyStyle}>{c.key}</span>
              </div>
            ))}
          </div>

          <span
            style={{
              alignSelf: "stretch",
              textAlign: "center",
              borderRadius: "0.3cqw",
              border: `2px solid ${PALETTE.cream}`,
              background: PALETTE.forestGreen,
              boxShadow: "0 0.5cqw 0 rgba(0,0,0,0.4)",
              padding: "1.2cqw",
              fontSize: "1.6cqw",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: PALETTE.cream,
            }}
          >
            Depart — Clear Running
          </span>
        </div>
      </div>
    </div>
  );
}
