import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const VOID_COLOR = "#12101f";
const TAPE_MAGENTA = "#e83d84";
const LOOP_TEAL = "#12b3a8";
const GRID_VIOLET = "#6247aa";
const PAPER_WHITE = "#f5f2fa";

const BASE_LEFT = 12;
const BASE_RIGHT = 90;
const BASE_TOP = 97;
const VANISH_LEFT = 40;
const VANISH_TOP = 37;
const ROAD_TOP_HALF_WIDTH = 3;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ease(u: number): number {
  return u ** 1.6;
}

function roadCenterX(t: number): number {
  return lerp((BASE_LEFT + BASE_RIGHT) / 2, VANISH_LEFT, t);
}

function roadHalfWidth(t: number): number {
  return lerp((BASE_RIGHT - BASE_LEFT) / 2, ROAD_TOP_HALF_WIDTH, t);
}

function roadY(t: number): number {
  return lerp(BASE_TOP, VANISH_TOP, t);
}

interface PylonSpot {
  left: number;
  top: number;
  size: number;
  color: string;
}

const PYLON_STEPS = [0.12, 0.26, 0.41, 0.57, 0.74, 0.9];

function pylonSpots(side: -1 | 1): PylonSpot[] {
  return PYLON_STEPS.map((u, i) => {
    const t = ease(u);
    const half = roadHalfWidth(t);
    return {
      left: roadCenterX(t) + side * (half * 1.18 + 1),
      top: roadY(t),
      size: lerp(3.2, 0.5, t),
      color: i % 2 === 0 ? TAPE_MAGENTA : LOOP_TEAL,
    };
  });
}

interface DashSpot {
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
}

const DASH_STEPS = [0.08, 0.22, 0.38, 0.55, 0.73, 0.9];

function dashSpots(): DashSpot[] {
  return DASH_STEPS.map((u) => {
    const t = ease(u);
    return {
      left: roadCenterX(t),
      top: roadY(t),
      width: lerp(2.2, 0.35, t),
      height: lerp(1.1, 0.2, t),
      opacity: lerp(0.9, 0.35, t),
    };
  });
}

function pylonStyle(spot: PylonSpot): CSSProperties {
  return {
    position: "absolute",
    left: `${spot.left}cqw`,
    top: `${spot.top}cqh`,
    width: `${spot.size * 0.35}cqw`,
    height: `${spot.size * 2.2}cqh`,
    transform: "translate(-50%, -100%)",
    borderRadius: "0.2cqw",
    background: spot.color,
    boxShadow: `0 0 ${spot.size * 0.9}cqw ${spot.color}99`,
  };
}

function dashStyle(spot: DashSpot): CSSProperties {
  return {
    position: "absolute",
    left: `${spot.left}cqw`,
    top: `${spot.top}cqh`,
    width: `${spot.width}cqw`,
    height: `${spot.height}cqh`,
    transform: "translate(-50%, -50%)",
    borderRadius: "0.3cqw",
    background: PAPER_WHITE,
    opacity: spot.opacity,
  };
}

const GATE_T = ease(0.52);

export default function LoopStationPreview({ className }: GamePreviewProps) {
  const roadPolygon = `polygon(${BASE_LEFT}cqw ${BASE_TOP}cqh, ${BASE_RIGHT}cqw ${BASE_TOP}cqh, ${VANISH_LEFT + ROAD_TOP_HALF_WIDTH}cqw ${VANISH_TOP}cqh, ${VANISH_LEFT - ROAD_TOP_HALF_WIDTH}cqw ${VANISH_TOP}cqh)`;
  const gateHalf = roadHalfWidth(GATE_T);
  const gateCenter = roadCenterX(GATE_T);
  const gateY = roadY(GATE_T);
  const startX = roadCenterX(0);

  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `linear-gradient(180deg, #1d1832 0%, ${VOID_COLOR} 42%, #08060f 100%)`,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${VANISH_LEFT}cqw`,
          top: `${VANISH_TOP - 4}cqh`,
          width: "34cqw",
          height: "34cqw",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `0.25cqw solid ${GRID_VIOLET}`,
          opacity: 0.4,
          boxShadow: `0 0 4cqw ${LOOP_TEAL}55`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${VANISH_TOP - 2}cqh`,
          height: "10cqh",
          background: `radial-gradient(ellipse at 50% 0%, ${TAPE_MAGENTA}33, transparent 70%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: roadPolygon,
          background: "linear-gradient(180deg, #241f38 0%, #2c2544 60%, #33294f 100%)",
        }}
      />

      {dashSpots().map((spot, i) => (
        <div key={i} style={dashStyle(spot)} />
      ))}

      <div
        style={{
          position: "absolute",
          left: `${gateCenter - gateHalf - 0.6}cqw`,
          top: `${gateY}cqh`,
          width: `${(gateHalf + 0.6) * 2}cqw`,
          height: "0.5cqh",
          transform: "translateY(-1.6cqh)",
          background: LOOP_TEAL,
          boxShadow: `0 0 1.2cqw ${LOOP_TEAL}aa`,
        }}
      />

      {pylonSpots(-1).map((spot, i) => (
        <div key={`l${i}`} style={pylonStyle(spot)} />
      ))}
      {pylonSpots(1).map((spot, i) => (
        <div key={`r${i}`} style={pylonStyle(spot)} />
      ))}

      <div
        style={{
          position: "absolute",
          left: `${startX}cqw`,
          top: "78cqh",
          width: "9cqw",
          height: "13cqh",
          transform: "translate(-50%, 0)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 0,
            height: 0,
            transform: "translateX(-50%)",
            borderLeft: "4.5cqw solid transparent",
            borderRight: "4.5cqw solid transparent",
            borderBottom: `7cqh solid ${PAPER_WHITE}`,
            filter: `drop-shadow(0 0 1.6cqw ${PAPER_WHITE}cc)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "6cqh",
            width: "6cqw",
            height: "5.5cqh",
            transform: "translateX(-50%)",
            borderRadius: "0.6cqw",
            background: PAPER_WHITE,
            boxShadow: `0 0 1.4cqw ${PAPER_WHITE}aa`,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: "4cqh",
          left: "4cqw",
          display: "flex",
          flexDirection: "column",
          gap: "0.3cqh",
        }}
      >
        <span
          style={{
            fontSize: "1.6cqw",
            fontWeight: 800,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: TAPE_MAGENTA,
            textShadow: `0 0 1cqw ${TAPE_MAGENTA}80`,
          }}
        >
          Lap 1
        </span>
        <span
          style={{
            fontSize: "1cqw",
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: LOOP_TEAL,
          }}
        >
          Pace 1.00×
        </span>
      </div>
    </div>
  );
}
