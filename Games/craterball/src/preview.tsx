import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const controlLabelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  color: "rgba(205,184,145,0.7)",
};

const controlKeyStyle: CSSProperties = {
  borderRadius: "0.3cqw",
  background: "rgba(0,0,0,0.6)",
  padding: "0.2cqw 0.6cqw",
  fontSize: "1.1cqw",
  fontWeight: 700,
  color: "#ffd7ba",
};

function ControlCell({ label, keyLabel }: { label: string; keyLabel: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6cqw" }}>
      <span style={controlLabelStyle}>{label}</span>
      <span style={controlKeyStyle}>{keyLabel}</span>
    </div>
  );
}

function DifficultyChip({ label, selected }: { label: string; selected: boolean }) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "0.8cqw",
        border: selected ? "2px solid #ff6b35" : "2px solid rgba(205,184,145,0.2)",
        background: selected ? "#2b1710" : "rgba(0,0,0,0.2)",
        padding: "0.8cqw",
        fontSize: "1.1cqw",
        fontWeight: 700,
        textTransform: "uppercase",
        color: selected ? "#ffd7ba" : "rgba(205,184,145,0.7)",
      }}
    >
      {label}
    </span>
  );
}

export default function CraterballPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "rgba(12,8,6,0.85)",
        color: "#e8ddca",
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
          gap: "1.4cqw",
          width: "70%",
          borderRadius: "1.4cqw",
          border: "1px solid rgba(255,107,53,0.3)",
          background: "rgba(22,15,12,0.95)",
          padding: "2cqw",
          boxShadow: "0 0 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3cqw", textAlign: "center" }}>
          <span
            style={{
              fontSize: "4cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#ff6b35",
              textShadow: "0 0 16px rgba(255,107,53,0.5)",
            }}
          >
            Craterball
          </span>
          <span style={{ fontSize: "1.1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: "rgba(205,184,145,0.7)" }}>
            The pitch remembers every blast
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5cqw" }}>
          <span style={{ display: "flex", gap: "0.6cqw", fontSize: "1.2cqw" }}>
            <span style={{ color: "#ff6b35" }}>▸</span>
            <span>Nobody touches the ball — arm a blast charge and detonate it beside the ball to launch it.</span>
          </span>
          <span style={{ display: "flex", gap: "0.6cqw", fontSize: "1.2cqw" }}>
            <span style={{ color: "#ff6b35" }}>▸</span>
            <span>First to 5 goals, or the higher score at the final horn.</span>
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.5cqw 1.6cqw",
            borderRadius: "0.8cqw",
            border: "1px solid rgba(205,184,145,0.15)",
            background: "rgba(0,0,0,0.25)",
            padding: "1cqw",
          }}
        >
          <ControlCell label="Move" keyLabel="WASD" />
          <ControlCell label="Aim" keyLabel="Mouse" />
          <ControlCell label="Arm Charge" keyLabel="LMB" />
          <ControlCell label="Detonate" keyLabel="Space" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5cqw", alignItems: "center" }}>
          <span style={{ fontSize: "1.1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(205,184,145,0.6)" }}>
            AI Difficulty
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.8cqw", width: "100%" }}>
            <DifficultyChip label="Ash Rookie" selected={false} />
            <DifficultyChip label="Basalt Veteran" selected={true} />
            <DifficultyChip label="Magma Overlord" selected={false} />
          </div>
        </div>

        <span
          style={{
            alignSelf: "center",
            borderRadius: "0.8cqw",
            background: "#ff6b35",
            padding: "1cqw 3cqw",
            fontSize: "1.5cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: "#160f0c",
          }}
        >
          Start — Enter
        </span>
      </div>
    </div>
  );
}
