import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const VOID_VIOLET = "#241b3a";
const PULSE_GOLD = "#ffd166";
const TEMPLE_STONE = "#6d5f8d";
const EMBER_ROSE = "#ef476f";
const MOON_WHITE = "#f8f4ff";
const SKY_HORIZON = "#3a2a55";
const SKY_ZENITH = "#0e0a18";
const FOG = "#1c1430";
const FLOOR_LOW = "#151022";

const AISLE_FLOOR = "polygon(8cqw 100cqh, 92cqw 100cqh, 58cqw 40cqh, 42cqw 40cqh)";

interface PillarSpec {
  readonly t: number;
  readonly side: "left" | "right";
}

const PILLARS: readonly PillarSpec[] = [
  { t: 0.15, side: "left" },
  { t: 0.15, side: "right" },
  { t: 0.4, side: "left" },
  { t: 0.4, side: "right" },
  { t: 0.65, side: "left" },
  { t: 0.65, side: "right" },
];

function pillarLayout(spec: PillarSpec): { x: number; y: number; scale: number } {
  const y = 100 - 60 * spec.t;
  const x = spec.side === "left" ? 8 + 34 * spec.t : 92 - 34 * spec.t;
  const scale = 1 - 0.68 * spec.t;
  return { x, y, scale };
}

function dividerStyle(bottomX: number, topX: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    clipPath: `polygon(${bottomX - 0.35}cqw 100cqh, ${bottomX + 0.35}cqw 100cqh, ${topX + 0.12}cqw 40cqh, ${topX - 0.12}cqw 40cqh)`,
    background: "rgba(255,209,102,0.4)",
  };
}

function Pillar({ spec }: { spec: PillarSpec }) {
  const { x, y, scale } = pillarLayout(spec);
  const height = 24 * scale;
  const width = 3.2 * scale;
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}cqw`,
        top: `${y}cqh`,
        width: `${width}cqw`,
        height: `${height}cqh`,
        transform: "translate(-50%, -100%)",
        background: `linear-gradient(${TEMPLE_STONE}, ${FLOOR_LOW})`,
        borderRadius: "0.4cqw",
        boxShadow: `0 0 ${Math.max(0.4, 1.2 * scale)}cqw ${PULSE_GOLD}44`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: `${18 * scale}%`,
          left: "50%",
          width: `${width * 1.9}cqw`,
          height: `${Math.max(0.25, 0.6 * scale)}cqh`,
          transform: "translateX(-50%)",
          borderRadius: "999px",
          background: PULSE_GOLD,
          boxShadow: `0 0 ${Math.max(0.3, 1 * scale)}cqw ${PULSE_GOLD}`,
        }}
      />
    </div>
  );
}

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
        background: `linear-gradient(180deg, ${SKY_ZENITH} 0%, ${SKY_HORIZON} 55%, ${FOG} 100%)`,
        color: MOON_WHITE,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "42cqw",
          top: "26cqh",
          width: "16cqw",
          height: "14cqh",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${FOG}cc 0%, transparent 70%)`,
          filter: "blur(1.5cqw)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: AISLE_FLOOR,
          backgroundImage: `linear-gradient(to top, ${FLOOR_LOW} 0%, ${TEMPLE_STONE} 100%)`,
        }}
      />
      <div style={dividerStyle(36, 47.33)} />
      <div style={dividerStyle(64, 52.67)} />

      {PILLARS.map((spec) => (
        <Pillar key={`${spec.side}-${spec.t}`} spec={spec} />
      ))}

      <div
        style={{
          position: "absolute",
          left: "44cqw",
          top: "34cqh",
          width: "4cqw",
          height: "8cqh",
          background: TEMPLE_STONE,
          borderRadius: "0.2cqw 0.2cqw 0 0",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "52cqw",
          top: "34cqh",
          width: "4cqw",
          height: "8cqh",
          background: TEMPLE_STONE,
          borderRadius: "0.2cqw 0.2cqw 0 0",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "43cqw",
          top: "33cqh",
          width: "14cqw",
          height: "0.9cqh",
          background: PULSE_GOLD,
          boxShadow: `0 0 1cqw ${PULSE_GOLD}`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50cqw",
          top: "80cqh",
          width: "8cqw",
          height: "8cqw",
          transform: "translate(-50%, -50%) rotate(45deg)",
          background: `linear-gradient(135deg, ${TEMPLE_STONE}, ${PULSE_GOLD})`,
          borderRadius: "0.8cqw",
          boxShadow: `0 0 2.6cqw ${PULSE_GOLD}aa`,
        }}
      />

      <div style={{ position: "absolute", top: "4cqh", left: "4cqw", display: "flex", flexDirection: "column", gap: "1cqh" }}>
        <span style={{ fontSize: "1.4cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4em", color: "rgba(248,244,255,0.75)" }}>
          The First Hour
        </span>
        <div style={{ width: "20cqw", height: "0.5cqh", borderRadius: "999px", background: VOID_VIOLET, overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", borderRadius: "999px", background: TEMPLE_STONE }} />
        </div>
      </div>

      <div style={{ position: "absolute", top: "4cqh", right: "4cqw", display: "flex", flexDirection: "column", alignItems: "center", gap: "1cqh" }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "9cqw",
            height: "9cqw",
            borderRadius: "50%",
            border: `0.25cqw solid ${MOON_WHITE}`,
            background: `radial-gradient(circle, ${VOID_VIOLET}cc 0%, ${FOG}cc 70%)`,
            boxShadow: `0 0 1.4cqw ${TEMPLE_STONE}55`,
          }}
        >
          <span style={{ fontSize: "2cqw", fontWeight: 700, letterSpacing: "0.05em" }}>100</span>
        </div>
        <span style={{ fontSize: "0.9cqw", textTransform: "uppercase", letterSpacing: "0.3em", color: TEMPLE_STONE }}>pulse</span>
        <div style={{ display: "flex", gap: "0.6cqw" }}>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              style={{
                width: "1.1cqw",
                height: "1.1cqw",
                borderRadius: "50%",
                border: `0.15cqw solid ${EMBER_ROSE}`,
                background: "transparent",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
