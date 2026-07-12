import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const labelStyle: CSSProperties = {
  fontSize: "1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.35em",
  color: "#6d5f8d",
};

const keyBadgeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.8cqw",
  fontSize: "1.1cqw",
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "rgba(248,244,255,0.8)",
};

const kbdStyle: CSSProperties = {
  minWidth: "2.4cqw",
  borderRadius: "0.3cqw",
  border: "1px solid #6d5f8d",
  background: "#241b3a",
  padding: "0.3cqw 0.7cqw",
  textAlign: "center",
  fontFamily: "ui-monospace, monospace",
  fontSize: "1.1cqw",
  color: "#ffd166",
};

function KeyBadge({ label, keyText }: { label: string; keyText: string }) {
  return (
    <span style={keyBadgeStyle}>
      <span style={kbdStyle}>{keyText}</span>
      <span>{label}</span>
    </span>
  );
}

const movements = [
  { title: "The First Hour", bpm: 90 },
  { title: "The Long Aisle", bpm: 110 },
  { title: "The Last Nave", bpm: 128 },
];

export default function PulseRunnerPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(circle at 50% 42%, #241b3a 0%, #150f24 80%)",
        color: "#f8f4ff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            width: "62cqw",
            flexDirection: "column",
            alignItems: "center",
            gap: "2.2cqw",
            borderRadius: "1cqw",
            border: "1px solid #6d5f8d",
            background: "radial-gradient(circle, #241b3aee 0%, #150f24f2 80%)",
            padding: "3.6cqw 4cqw",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5cqw" }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "ui-serif, Georgia, serif",
                fontSize: "3.6cqw",
                fontWeight: 700,
                letterSpacing: "0.3em",
                color: "#f8f4ff",
              }}
            >
              PULSE RUNNER
            </h1>
            <p style={{ margin: 0, fontSize: "1.1cqw", textTransform: "uppercase", letterSpacing: "0.35em", color: "#ffd166" }}>
              the world is the metronome
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.4cqw" }}>
            {movements.map((movement, index) => (
              <div key={movement.title} style={{ display: "flex", alignItems: "center", gap: "1.4cqw" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3cqw" }}>
                  <span style={{ fontSize: "0.9cqw", textTransform: "uppercase", letterSpacing: "0.2em", color: "#6d5f8d" }}>
                    {movement.title}
                  </span>
                  <span style={{ fontFamily: "ui-serif, Georgia, serif", fontSize: "1.8cqw", color: "#f8f4ff" }}>{movement.bpm}</span>
                </div>
                {index < movements.length - 1 ? <span style={{ color: "#6d5f8d", fontSize: "1.4cqw" }}>→</span> : null}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.7cqw" }}>
            <KeyBadge label="stride the beat" keyText="Space" />
            <KeyBadge label="lane left" keyText="A" />
            <KeyBadge label="lane right" keyText="D" />
            <KeyBadge label="lean (speed nudge)" keyText="Shift" />
          </div>

          <span
            style={{
              borderRadius: "999px",
              border: "1px solid #ffd166",
              padding: "0.9cqw 3cqw",
              fontSize: "1.2cqw",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.3em",
              color: "#ffd166",
            }}
          >
            keep the pulse
          </span>

          <p style={{ ...labelStyle, margin: 0 }}>press enter or space to start</p>
        </div>
      </div>
    </div>
  );
}
