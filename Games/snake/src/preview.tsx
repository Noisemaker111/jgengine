import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PHOSPHOR = "#7dffb0";
const GLOW = "0 0 3cqw rgba(90, 255, 150, 0.55), 0 0 0.8cqw rgba(200, 255, 220, 0.8)";

const labelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.3em",
  color: "#5fbf8c",
};

function PillButton({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <span
      style={{
        borderRadius: "1cqw",
        border: `1px solid ${primary ? PHOSPHOR : "rgba(125,255,176,0.45)"}`,
        padding: "1cqw 3cqw",
        fontSize: "1.5cqw",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.3em",
        color: primary ? "#04150d" : PHOSPHOR,
        background: primary ? PHOSPHOR : "transparent",
        boxShadow: primary ? "0 0 4cqw rgba(90,255,150,0.5)" : "none",
      }}
    >
      {label}
    </span>
  );
}

function ModeChip({ label, hint, active }: { label: string; hint: string; active?: boolean }) {
  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.3cqw",
        borderRadius: "1cqw",
        border: `1px solid ${active ? PHOSPHOR : "rgba(125,255,176,0.35)"}`,
        padding: "0.9cqw 2.2cqw",
        color: active ? "#04150d" : PHOSPHOR,
        background: active ? PHOSPHOR : "transparent",
        boxShadow: active ? "0 0 3cqw rgba(90,255,150,0.45)" : "none",
      }}
    >
      <span style={{ fontSize: "1.4cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.25em" }}>{label}</span>
      <span style={{ fontSize: "1cqw", textTransform: "uppercase", opacity: 0.8 }}>{hint}</span>
    </span>
  );
}

export default function SnakePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#05100b",
        fontFamily: "ui-monospace, monospace",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(125,255,176,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(125,255,176,0.06) 1px, transparent 1px)",
          backgroundSize: "6cqw 6cqw",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 45%, rgba(5,25,16,0.72), rgba(3,12,8,0.94))",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2.4cqw",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "9cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.3em",
            color: PHOSPHOR,
            textShadow: GLOW,
            margin: 0,
          }}
        >
          Snake
        </h1>
        <p style={{ fontSize: "1.5cqw", textTransform: "uppercase", letterSpacing: "0.3em", color: "#7fcfa4", margin: 0 }}>
          Eat · grow · do not bite yourself
        </p>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8cqw" }}>
          <span style={labelStyle}>Mode</span>
          <div style={{ display: "flex", gap: "1.4cqw" }}>
            <ModeChip label="Walled" hint="edges kill" active />
            <ModeChip label="Wrap" hint="edges loop" />
          </div>
        </div>

        <PillButton label="Play" primary />

        <p style={{ fontSize: "1.1cqw", textTransform: "uppercase", letterSpacing: "0.25em", color: "#4f9c74", margin: 0 }}>
          Arrows / WASD or swipe to steer · Space play · P pause
        </p>
      </div>
    </div>
  );
}
