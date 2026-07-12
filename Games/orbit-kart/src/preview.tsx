import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  spaceIndigo: "#1b1f4b",
  planetPeach: "#ffb377",
  planetMint: "#7fd8be",
  boostTangerine: "#ff7f11",
  starlight: "#f5f3ff",
} as const;

interface PlanetoidDot {
  left: number;
  top: number;
  diameter: number;
  color: string;
  ring: string | null;
}

const PLANETOIDS: readonly PlanetoidDot[] = [
  { left: 74.89, top: 50.0, diameter: 8.71, color: PALETTE.planetMint, ring: PALETTE.starlight },
  { left: 62.44, top: 28.45, diameter: 6.22, color: PALETTE.planetPeach, ring: null },
  { left: 62.44, top: 71.55, diameter: 4.35, color: "#2f3470", ring: null },
  { left: 37.56, top: 71.55, diameter: 8.71, color: PALETTE.planetMint, ring: PALETTE.boostTangerine },
  { left: 25.11, top: 50.0, diameter: 4.35, color: PALETTE.planetPeach, ring: null },
  { left: 37.56, top: 28.45, diameter: 6.22, color: PALETTE.starlight, ring: null },
  { left: 50.0, top: 63.69, diameter: 6.22, color: PALETTE.boostTangerine, ring: PALETTE.planetMint },
];

const CHECKPOINTS: readonly { left: number; top: number }[] = [
  { left: 50.0, top: 12.04 },
  { left: 82.87, top: 31.02 },
  { left: 82.87, top: 68.98 },
  { left: 50.0, top: 87.96 },
  { left: 17.13, top: 68.98 },
  { left: 17.13, top: 31.02 },
];

const BOOST_PADS: readonly { left: number; top: number }[] = [
  { left: 57.89, top: 20.55 },
  { left: 76.4, top: 34.76 },
  { left: 79.45, top: 57.89 },
  { left: 57.89, top: 79.45 },
  { left: 34.76, top: 76.4 },
  { left: 20.55, top: 57.89 },
  { left: 23.6, top: 34.76 },
  { left: 42.11, top: 20.55 },
];

const ASTEROID_BELTS: readonly { left: number; top: number; rocks: readonly { dx: number; dy: number; r: number }[] }[] = [
  {
    left: 58.21,
    top: 19.35,
    rocks: [
      { dx: -2.4, dy: 1.1, r: 0.9 },
      { dx: 1.6, dy: -1.4, r: 1.2 },
      { dx: 3.1, dy: 2.2, r: 0.7 },
      { dx: -1.1, dy: -2.6, r: 1.0 },
    ],
  },
  {
    left: 45.81,
    top: 65.63,
    rocks: [
      { dx: -1.8, dy: -0.9, r: 1.1 },
      { dx: 1.3, dy: 1.7, r: 0.8 },
      { dx: 2.6, dy: -1.3, r: 0.9 },
    ],
  },
  {
    left: 19.35,
    top: 58.21,
    rocks: [
      { dx: -2.2, dy: -1.5, r: 1.0 },
      { dx: 1.9, dy: 0.8, r: 1.3 },
      { dx: -0.6, dy: 2.4, r: 0.7 },
      { dx: 2.7, dy: 1.9, r: 0.9 },
    ],
  },
];

interface KartMarker {
  left: number;
  top: number;
  hull: string;
  glow: string;
}

const START_HEADING_DEG = 60;

const KARTS: readonly KartMarker[] = [
  { left: 13.81, top: 31.5, hull: PALETTE.starlight, glow: PALETTE.boostTangerine },
  { left: 13.52, top: 34.72, hull: PALETTE.planetMint, glow: PALETTE.starlight },
  { left: 10.42, top: 33.1, hull: PALETTE.boostTangerine, glow: PALETTE.starlight },
];

function pct(x: number, y: number): CSSProperties {
  return { position: "absolute", left: `${x}%`, top: `${y}%` };
}

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
        background: `radial-gradient(circle at 50% 50%, rgba(127,216,190,0.14), ${PALETTE.spaceIndigo} 55%, #05040f 100%)`,
        color: PALETTE.starlight,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "75.9cqw",
          height: "75.9cqw",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `0.15cqw dashed rgba(245,243,255,0.28)`,
        }}
      />

      {ASTEROID_BELTS.map((belt, i) => (
        <div key={i} style={pct(belt.left, belt.top)}>
          {belt.rocks.map((rock, j) => (
            <span
              key={j}
              style={{
                position: "absolute",
                left: `${rock.dx}cqw`,
                top: `${rock.dy}cqw`,
                width: `${rock.r}cqw`,
                height: `${rock.r}cqw`,
                borderRadius: "40%",
                background: "#4a4f7a",
              }}
            />
          ))}
        </div>
      ))}

      {BOOST_PADS.map((pad, i) => (
        <span
          key={i}
          style={{
            ...pct(pad.left, pad.top),
            width: "2.4cqw",
            height: "2.4cqw",
            transform: "translate(-50%, -50%) rotate(45deg)",
            background: `linear-gradient(135deg, ${PALETTE.boostTangerine}, transparent)`,
            opacity: 0.7,
          }}
        />
      ))}

      {CHECKPOINTS.map((cp, i) => (
        <span
          key={i}
          style={{
            ...pct(cp.left, cp.top),
            width: "3.2cqw",
            height: "3.2cqw",
            transform: "translate(-50%, -50%) rotate(45deg)",
            border: `0.18cqw solid ${PALETTE.boostTangerine}`,
            boxShadow: `0 0 1.2cqw rgba(255,127,17,0.5)`,
          }}
        />
      ))}

      {PLANETOIDS.map((p, i) => (
        <div key={i} style={{ ...pct(p.left, p.top), transform: "translate(-50%, -50%)" }}>
          {p.ring !== null ? (
            <span
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: `${p.diameter * 1.6}cqw`,
                height: `${p.diameter * 0.55}cqw`,
                transform: "translate(-50%, -50%) rotate(-18deg)",
                borderRadius: "50%",
                border: `0.12cqw solid ${p.ring}`,
                opacity: 0.55,
              }}
            />
          ) : null}
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: `${p.diameter}cqw`,
              height: `${p.diameter}cqw`,
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5), ${p.color} 55%, rgba(0,0,0,0.4))`,
              boxShadow: `0 0 1.4cqw ${p.color}88`,
            }}
          />
        </div>
      ))}

      {KARTS.map((kart, i) => (
        <span
          key={i}
          style={{
            ...pct(kart.left, kart.top),
            width: "2.6cqw",
            height: "2.6cqw",
            transform: `translate(-50%, -50%) rotate(${START_HEADING_DEG}deg)`,
            clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
            background: kart.hull,
            boxShadow: `0 0 1cqw ${kart.glow}`,
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          left: "3cqw",
          top: "3cqh",
          display: "flex",
          flexDirection: "column",
          gap: "0.3cqw",
          borderRadius: "0.8cqw",
          border: "1px solid rgba(245,243,255,0.2)",
          background: "rgba(10,8,32,0.85)",
          padding: "1cqw 1.4cqw",
          boxShadow: "0 0 2cqw rgba(0,0,0,0.5)",
        }}
      >
        <span
          style={{
            fontSize: "1.4cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.28em",
            color: PALETTE.planetMint,
          }}
        >
          Lap 1/3
        </span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.3cqw", fontWeight: 700, color: PALETTE.starlight }}>
          0:00.00
        </span>
      </div>
    </div>
  );
}
