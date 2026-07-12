import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  iceBlue: "#a8dadc",
  deepWater: "#0d1b2a",
  snowWhite: "#f1faee",
  auroraGreen: "#80ffdb",
  flareRed: "#e63946",
} as const;

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: "1.8cqw",
  minWidth: "1.8cqw",
  padding: "0 0.4cqw",
  borderRadius: "0.4cqw",
  border: `1px solid ${PALETTE.iceBlue}55`,
  background: `${PALETTE.deepWater}cc`,
  fontSize: "1cqw",
  fontWeight: 700,
  color: PALETTE.iceBlue,
};

const CONTROLS: readonly { key: string; label: string }[] = [
  { key: "W", label: "Throttle" },
  { key: "S", label: "Brake / Reverse" },
  { key: "A", label: "Steer Left" },
  { key: "D", label: "Steer Right" },
  { key: "Shift", label: "Handbrake Slide" },
  { key: "R", label: "Restart Race" },
];

export default function FrostbiteCircuitPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `radial-gradient(circle at 50% 46%, ${PALETTE.iceBlue}22, ${PALETTE.deepWater}f2 70%)`,
        color: PALETTE.snowWhite,
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
          gap: "2.4cqw",
          padding: "2cqw 4cqw",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6cqw" }}>
          <span
            style={{
              fontSize: "1.1cqw",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5em",
              color: PALETTE.auroraGreen,
            }}
          >
            Expedition Radio — Arctic Midnight Circuit
          </span>
          <span
            style={{
              fontSize: "5.4cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              color: PALETTE.snowWhite,
              textShadow: `0 0 3cqw ${PALETTE.iceBlue}8c`,
            }}
          >
            Frostbite Circuit
          </span>
          <span style={{ maxWidth: "60cqw", fontSize: "1.4cqw", color: `${PALETTE.snowWhite}b3` }}>
            Five laps on a frozen lake. The ice remembers every line you take — cross a cell twice and it
            cracks; cross it again and it's black water.
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, auto)",
            columnGap: "3cqw",
            rowGap: "1cqw",
            borderRadius: "0.8cqw",
            border: `1px solid ${PALETTE.iceBlue}26`,
            background: `${PALETTE.deepWater}e6`,
            padding: "1.6cqw 2.4cqw",
            boxShadow: "0 0 3cqw rgba(0,0,0,0.6)",
          }}
        >
          {CONTROLS.map((control) => (
            <div key={control.key} style={{ display: "flex", alignItems: "center", gap: "0.8cqw" }}>
              <span style={badgeStyle}>{control.key}</span>
              <span style={{ fontSize: "1.2cqw", color: `${PALETTE.snowWhite}cc` }}>{control.label}</span>
            </div>
          ))}
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "1cqw",
            borderRadius: "999px",
            border: `2px solid ${PALETTE.flareRed}`,
            background: `${PALETTE.flareRed}1a`,
            padding: "1cqw 2.6cqw",
            fontSize: "1.8cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: PALETTE.flareRed,
          }}
        >
          Roll Out
          <span style={badgeStyle}>Enter</span>
        </span>
      </div>
    </div>
  );
}
