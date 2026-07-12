import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const GOLD = "#f2b950";
const LILAC = "#b8a9d9";
const FOG = "#e8c79a";
const INK = "#2b2320";
const CONCRETE = "#c9c4b8";
const JERSEY = "#b3573f";
const TAR = "#3c3a3a";
const TAR_LIGHT = "#55514f";
const WALL = "#8f4a35";

interface PlatformVis {
  x: number;
  z: number;
  roofY: number;
  w: number;
  d: number;
}

const LEG1_PLATFORMS: readonly PlatformVis[] = [
  { x: 0, z: 3, roofY: 4, w: 7, d: 7 },
  { x: 1, z: 11, roofY: 4, w: 5, d: 5 },
  { x: 0, z: 19, roofY: 5, w: 5, d: 5 },
  { x: 1, z: 26, roofY: 4, w: 5, d: 5 },
  { x: 1, z: 35, roofY: 5, w: 7, d: 7 },
];

const Z_MAX = 42;

function scaleFor(z: number): number {
  return 1 - (z / Z_MAX) * 0.62;
}

function centerYFor(z: number): number {
  const t = z / Z_MAX;
  return 90 - t * 64;
}

function centerXFor(x: number, scale: number): number {
  return 50 + x * 6 * scale;
}

function platformStyle(p: PlatformVis): CSSProperties {
  const scale = scaleFor(p.z);
  const cx = centerXFor(p.x, scale);
  const cy = centerYFor(p.z);
  const lift = (p.roofY - 4) * scale * 1.6;
  const width = p.w * scale * 3.4;
  const height = p.d * scale * 1.5;
  return {
    position: "absolute",
    left: `${cx}cqw`,
    top: `${cy - lift}cqh`,
    width: `${width}cqw`,
    height: `${height}cqh`,
    transform: "translate(-50%, -50%)",
    borderRadius: `${Math.max(0.3, scale * 0.6)}cqw`,
    background: `linear-gradient(180deg, ${TAR_LIGHT} 0%, ${TAR} 100%)`,
    border: "1px solid rgba(0,0,0,0.45)",
    boxShadow: `0 ${height * 0.35}cqh 0 rgba(0,0,0,0.35)`,
  };
}

const BUILDINGS: readonly { left: number; width: number; height: number }[] = [
  { left: 6, width: 10, height: 14 },
  { left: 18, width: 7, height: 20 },
  { left: 62, width: 9, height: 17 },
  { left: 76, width: 12, height: 23 },
  { left: 90, width: 8, height: 15 },
];

export default function RooftopRelayPreview({ className }: GamePreviewProps) {
  const start = LEG1_PLATFORMS[0]!;
  const startScale = scaleFor(start.z);
  const startCx = centerXFor(start.x, startScale);
  const startTopY = centerYFor(start.z) - (start.d * startScale * 1.5) / 2;

  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `linear-gradient(180deg, ${LILAC} 0%, ${GOLD} 50%, ${FOG} 72%, ${INK} 100%)`,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {BUILDINGS.map((b) => (
        <div
          key={b.left}
          style={{
            position: "absolute",
            left: `${b.left}cqw`,
            top: `${28 - b.height * 0.55}cqh`,
            width: `${b.width}cqw`,
            height: `${b.height}cqh`,
            background: WALL,
            opacity: 0.35,
            borderRadius: "0.2cqw",
          }}
        />
      ))}

      {LEG1_PLATFORMS.map((p) => (
        <div key={`${p.x}-${p.z}`} style={platformStyle(p)} />
      ))}

      <div
        style={{
          position: "absolute",
          left: `${startCx}cqw`,
          top: `${startTopY}cqh`,
          width: "3cqw",
          height: "9cqh",
          transform: "translate(-50%, -100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: "2.4cqh",
            left: "50%",
            width: "3cqw",
            height: "6.4cqh",
            transform: "translateX(-50%)",
            borderRadius: "1.5cqw",
            background: JERSEY,
            border: "1px solid rgba(0,0,0,0.4)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "7.6cqh",
            left: "50%",
            width: "2.2cqw",
            height: "2.2cqh",
            transform: "translateX(-50%)",
            borderRadius: "50%",
            background: CONCRETE,
            border: "1px solid rgba(0,0,0,0.4)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          display: "flex",
          flexDirection: "column",
          gap: "0.3cqh",
          borderRadius: "0.6cqw",
          border: `1px solid ${GOLD}80`,
          background: "rgba(43,35,32,0.7)",
          padding: "0.8cqh 1.2cqw",
        }}
      >
        <span style={{ fontSize: "1.3cqw", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: CONCRETE }}>
          Runner 1/5 — Zoe Chen
        </span>
        <span style={{ fontSize: "1.1cqw", color: `${CONCRETE}cc` }}>Warehouse Flats</span>
      </div>

      <div
        style={{
          position: "absolute",
          top: "3cqh",
          left: "50%",
          transform: "translateX(-50%)",
          borderRadius: "0.6cqw",
          border: `1px solid ${GOLD}80`,
          background: "rgba(43,35,32,0.7)",
          padding: "0.6cqh 1.4cqw",
          fontFamily: "ui-monospace, monospace",
          fontSize: "2cqw",
          fontWeight: 800,
          color: GOLD,
        }}
      >
        0:00.0
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "3cqh",
          left: "50%",
          transform: "translateX(-50%)",
          width: "40cqw",
          display: "flex",
          flexDirection: "column",
          gap: "0.4cqh",
          borderRadius: "0.5cqw",
          border: `1px solid ${CONCRETE}60`,
          background: "rgba(0,0,0,0.5)",
          padding: "0.7cqh 1cqw",
        }}
      >
        <span style={{ fontSize: "1cqw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: CONCRETE }}>
          Stamina
        </span>
        <div style={{ height: "1cqh", width: "100%", borderRadius: "0.5cqh", background: "rgba(255,255,255,0.15)" }}>
          <div style={{ height: "100%", width: "100%", borderRadius: "0.5cqh", background: GOLD }} />
        </div>
      </div>
    </div>
  );
}
