import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const TAPE_MAGENTA = "#e83d84";
const LOOP_TEAL = "#12b3a8";

const keyBadgeStyle: CSSProperties = {
  display: "inline-flex",
  minWidth: "2.6cqw",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "0.4cqw",
  border: "1px solid rgba(98,71,170,0.7)",
  background: "#12101f",
  padding: "0.4cqw 0.8cqw",
  fontSize: "1.1cqw",
  fontWeight: 700,
  letterSpacing: "0.05em",
  color: "#f5f2fa",
};

const keyRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.8cqw",
  fontSize: "1.2cqw",
  color: "rgba(245,242,250,0.8)",
};

function KeyBadge({ label, children }: { label: string; children: string }) {
  return (
    <span style={keyRowStyle}>
      <span style={keyBadgeStyle}>{label}</span>
      {children}
    </span>
  );
}

export default function LoopStationPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "rgba(18,16,31,0.92)",
        color: "#f5f2fa",
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
          gap: "1.6cqw",
          padding: "3cqw",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p
            style={{
              fontSize: "1.3cqw",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.4em",
              color: LOOP_TEAL,
            }}
          >
            Synthwave Tape-Loop Speedrunner
          </p>
          <h1
            style={{
              marginTop: "0.6cqw",
              fontSize: "6cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.25em",
              color: "#f5f2fa",
              textShadow: `0 0 3cqw ${TAPE_MAGENTA}a6`,
            }}
          >
            Loop Station
          </h1>
        </div>

        <div
          style={{
            maxWidth: "60cqw",
            display: "flex",
            flexDirection: "column",
            gap: "0.3cqw",
            fontSize: "1.5cqw",
            lineHeight: 1.5,
            textAlign: "center",
            color: "rgba(245,242,250,0.85)",
          }}
        >
          <p>Run the circuit. Every clean lap is recorded and replays forever as a solid ghost.</p>
          <p>Touch a ghost — or miss the over/under jump — and the tape ends.</p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            columnGap: "3cqw",
            rowGap: "0.9cqw",
            borderRadius: "1cqw",
            border: "1px solid rgba(98,71,170,0.5)",
            background: "rgba(28,24,48,0.7)",
            padding: "1.6cqw 2.4cqw",
          }}
        >
          <KeyBadge label="W">Pace up</KeyBadge>
          <KeyBadge label="S">Pace down</KeyBadge>
          <KeyBadge label="A">Steer / branch left</KeyBadge>
          <KeyBadge label="D">Steer right</KeyBadge>
          <KeyBadge label="Shift">Brake-drift</KeyBadge>
          <KeyBadge label="Space">Jump-hop</KeyBadge>
        </div>

        <p
          style={{
            fontSize: "1.2cqw",
            textTransform: "uppercase",
            letterSpacing: "0.3em",
            color: "rgba(245,242,250,0.6)",
          }}
        >
          Best tape: <span style={{ color: TAPE_MAGENTA }}>0</span> laps survived
        </p>

        <span
          style={{
            borderRadius: "0.6cqw",
            padding: "1cqw 3.2cqw",
            fontSize: "1.8cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "#12101f",
            background: `linear-gradient(90deg, ${TAPE_MAGENTA}, ${LOOP_TEAL})`,
            boxShadow: `0 0 2cqw ${LOOP_TEAL}8c`,
          }}
        >
          Press Enter — Start
        </span>
      </div>
    </div>
  );
}
