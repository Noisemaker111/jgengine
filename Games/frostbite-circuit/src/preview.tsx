import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  iceBlue: "#a8dadc",
  deepWater: "#0d1b2a",
  snowWhite: "#f1faee",
  auroraGreen: "#80ffdb",
  flareRed: "#e63946",
} as const;

const timeFieldLabel: CSSProperties = {
  fontSize: "0.85cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.22em",
  color: `${PALETTE.snowWhite}73`,
};

const timeFieldValue: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "1.3cqw",
  fontWeight: 700,
  color: PALETTE.snowWhite,
};

function Sled({ left, top, rotate, primary, accent }: { left: string; top: string; rotate: number; primary: string; accent: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: "5cqw",
        height: "2.4cqw",
        transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
        borderRadius: "1.2cqw",
        background: `linear-gradient(90deg, ${accent} 0%, ${primary} 45%, ${primary} 100%)`,
        boxShadow: `0 0.3cqw 0.9cqw rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.25)`,
      }}
    />
  );
}

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
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          width: "84cqw",
          height: "62cqh",
          borderRadius: "50%",
          background: `linear-gradient(160deg, ${PALETTE.iceBlue}3d 0%, ${PALETTE.iceBlue}1a 55%, ${PALETTE.iceBlue}0d 100%)`,
          boxShadow: `inset 0 0 0 1px ${PALETTE.iceBlue}40, 0 0 6cqw rgba(0,0,0,0.5)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          width: "38cqw",
          height: "28cqh",
          borderRadius: "50%",
          background: `${PALETTE.deepWater}f0`,
          boxShadow: `inset 0 0 0 1px ${PALETTE.iceBlue}26`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "83%",
          transform: "translate(-50%, -50%)",
          width: "8cqw",
          height: "1cqw",
          background: `repeating-linear-gradient(90deg, ${PALETTE.snowWhite} 0 0.7cqw, ${PALETTE.deepWater} 0.7cqw 1.4cqw)`,
          borderRadius: "0.2cqw",
          boxShadow: "0 0 0.6cqw rgba(0,0,0,0.5)",
        }}
      />

      <Sled left="47%" top="79%" rotate={-4} primary={PALETTE.snowWhite} accent={PALETTE.iceBlue} />
      <Sled left="41%" top="83%" rotate={-2} primary={PALETTE.flareRed} accent="#3a0d10" />
      <Sled left="59%" top="83%" rotate={2} primary={PALETTE.auroraGreen} accent="#0d2b26" />

      <div
        style={{
          position: "absolute",
          left: "3%",
          top: "5%",
          display: "flex",
          flexDirection: "column",
          gap: "0.7cqw",
          borderRadius: "0.8cqw",
          border: `1px solid ${PALETTE.iceBlue}26`,
          background: `${PALETTE.deepWater}d9`,
          padding: "1.1cqw 1.4cqw",
          boxShadow: "0 0 2cqw rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "1.2cqw" }}>
          <span style={{ fontSize: "0.9cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: PALETTE.auroraGreen }}>
            Lap 1/5
          </span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.5cqw", fontWeight: 900, color: PALETTE.snowWhite }}>
            P1<span style={{ fontSize: "0.9cqw", color: `${PALETTE.snowWhite}80` }}>/3</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: "1.4cqw" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={timeFieldLabel}>Lap Time</span>
            <span style={timeFieldValue}>0:00.00</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={timeFieldLabel}>Best</span>
            <span style={timeFieldValue}>--:--.--</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={timeFieldLabel}>Total</span>
            <span style={timeFieldValue}>0:00.00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
