import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  minWidth: "3cqw",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "0.5cqw",
  border: "1px solid rgba(245,243,255,0.4)",
  background: "#0a0820",
  padding: "0.3cqw 0.8cqw",
  fontSize: "1.3cqw",
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "#f5f3ff",
};

const CONTROLS: readonly { key: string; label: string }[] = [
  { key: "W", label: "Thrust" },
  { key: "S", label: "Retro-Thrust" },
  { key: "A", label: "Rotate Left" },
  { key: "D", label: "Rotate Right" },
  { key: "Space", label: "Discharge Sling" },
  { key: "R", label: "Restart Race" },
];

export default function OrbitKartPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(circle at center, rgba(127,216,190,0.16), rgba(5,4,15,0.96) 72%), #05040f",
        color: "#f5f3ff",
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
          gap: "3cqw",
          padding: "0 4cqw",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.9cqw" }}>
          <span
            style={{
              fontSize: "1.4cqw",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5em",
              color: "#7fd8be",
            }}
          >
            Retro Space-Cartoon Grand Prix
          </span>
          <span
            style={{
              fontSize: "7cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: "#f5f3ff",
              textShadow: "0 0 20px rgba(255,127,17,0.5)",
            }}
          >
            Orbit Kart
          </span>
          <span style={{ maxWidth: "62cqw", fontSize: "1.6cqw", lineHeight: 1.45, color: "rgba(245,243,255,0.75)" }}>
            Six checkpoint rings, three laps, seven gravity wells. Aim the predicted thread into a well, charge the
            slingshot meter, and discharge inside the clean window to sling out faster than you flew in.
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, auto)",
            columnGap: "3.4cqw",
            rowGap: "1.3cqw",
            borderRadius: "1cqw",
            border: "1px solid rgba(245,243,255,0.15)",
            background: "rgba(10,8,32,0.9)",
            padding: "2.2cqw 2.8cqw",
            boxShadow: "0 0 40px rgba(0,0,0,0.6)",
          }}
        >
          {CONTROLS.map((control) => (
            <div key={control.key} style={{ display: "flex", alignItems: "center", gap: "0.9cqw" }}>
              <span style={badgeStyle}>{control.key}</span>
              <span style={{ fontSize: "1.4cqw", color: "rgba(245,243,255,0.8)", whiteSpace: "nowrap" }}>
                {control.label}
              </span>
            </div>
          ))}
        </div>

        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.3cqw",
            borderRadius: "99cqw",
            border: "0.3cqw solid #ff7f11",
            background: "rgba(255,127,17,0.1)",
            padding: "1.3cqw 3.4cqw",
            fontSize: "2.2cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "#ff7f11",
          }}
        >
          Green Light
          <span style={badgeStyle}>Enter</span>
        </span>
      </div>
    </div>
  );
}
