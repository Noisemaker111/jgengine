import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  skyTop: "#241a45",
  skyMid: "#191234",
  skyBottom: "#0d0a24",
  grass: "#1d6b46",
  grassDark: "#134d31",
  grassEdge: "#2b8a5c",
  asphalt: "#26262e",
  asphaltAlt: "#2f2f39",
  laneLine: "rgba(201,180,88,0.55)",
  river: "#1c2560",
  riverAlt: "#232c74",
  riverDeep: "#111845",
  log: "#7a4a24",
  logDark: "#5c3418",
  logTop: "#9a6236",
  turtle: "#3fae6b",
  turtleShell: "#2f8a52",
  car: "#ff5470",
  carAlt: "#ffb454",
  truck: "#8a6cff",
  headlight: "#fff4c2",
  hopper: "#7CFC5A",
  hopperDark: "#3f9e2c",
  hopperEye: "#0d1f0a",
  homeEmpty: "#0c2a1e",
  hedge: "#0a2417",
  text: "#eaf3ff",
  textDim: "#9fb0d8",
  accent: "#5fd0ff",
  gold: "#ffcf5a",
} as const;

const COLS = 13;
const ROWS = 13;
const CELL = 100 / COLS;

const START_ROW = 0;
const MEDIAN_ROW = 6;
const HOME_ROW = 12;
const START_COL = 6;
const BAY_COLS: readonly number[] = [0, 3, 6, 9, 12];

type Variant = "car" | "truck" | "log" | "turtle";

interface Body {
  readonly x: number;
  readonly len: number;
}

interface LaneRow {
  readonly row: number;
  readonly kind: "road" | "river";
  readonly variant: Variant;
  readonly dir: 1 | -1;
  readonly bodies: readonly Body[];
}

const LANES: readonly LaneRow[] = [
  { row: 1, kind: "road", variant: "truck", dir: -1, bodies: [{ x: -2.3, len: 2 }, { x: 6.7, len: 2 }] },
  { row: 2, kind: "road", variant: "car", dir: 1, bodies: [{ x: 0.1, len: 1 }, { x: 4.6, len: 1 }, { x: 9.1, len: 1 }, { x: 13.6, len: 1 }] },
  { row: 3, kind: "road", variant: "car", dir: -1, bodies: [{ x: -0.9, len: 1 }, { x: 5.1, len: 1 }, { x: 11.1, len: 1 }] },
  { row: 4, kind: "road", variant: "truck", dir: 1, bodies: [{ x: 0.2, len: 2 }, { x: 9.2, len: 2 }] },
  { row: 5, kind: "road", variant: "car", dir: -1, bodies: [{ x: -2.5, len: 1 }, { x: 2, len: 1 }, { x: 6.5, len: 1 }, { x: 11, len: 1 }] },
  { row: 7, kind: "river", variant: "log", dir: 1, bodies: [{ x: -1.9, len: 3 }, { x: 2.6, len: 3 }, { x: 7.1, len: 3 }, { x: 11.6, len: 3 }] },
  { row: 8, kind: "river", variant: "turtle", dir: -1, bodies: [{ x: -0.4, len: 3 }, { x: 5.6, len: 3 }, { x: 11.6, len: 3 }] },
  { row: 9, kind: "river", variant: "log", dir: 1, bodies: [{ x: -3.3, len: 2 }, { x: 2.7, len: 2 }, { x: 8.7, len: 2 }] },
  { row: 10, kind: "river", variant: "turtle", dir: -1, bodies: [{ x: -2, len: 3 }, { x: 4, len: 3 }, { x: 10, len: 3 }] },
  { row: 11, kind: "river", variant: "log", dir: 1, bodies: [{ x: -1.7, len: 3 }, { x: 2.8, len: 3 }, { x: 7.3, len: 3 }, { x: 11.8, len: 3 }] },
];

function rowTop(row: number): number {
  return (ROWS - 1 - row) * CELL;
}

function rowStyle(row: number, background: string): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    width: "100cqw",
    top: `${rowTop(row)}cqh`,
    height: `${CELL}cqh`,
    background,
  };
}

function bodyStyle(row: number, body: Body, background: string, radius: string): CSSProperties {
  return {
    position: "absolute",
    left: `${(body.x / COLS) * 100}cqw`,
    top: `${rowTop(row) + CELL * 0.14}cqh`,
    width: `${(body.len / COLS) * 100}cqw`,
    height: `${CELL * 0.72}cqh`,
    borderRadius: radius,
    background,
  };
}

function vehicleColor(variant: Variant, dir: 1 | -1): string {
  if (variant === "truck") return PALETTE.truck;
  return dir === 1 ? PALETTE.carAlt : PALETTE.car;
}

function renderLane(lane: LaneRow) {
  if (lane.variant === "log") {
    return lane.bodies.map((body, i) => (
      <div key={`${lane.row}-${i}`} style={bodyStyle(lane.row, body, `linear-gradient(180deg, ${PALETTE.logTop}, ${PALETTE.log} 55%, ${PALETTE.logDark})`, "2.4cqw")} />
    ));
  }
  if (lane.variant === "turtle") {
    return lane.bodies.flatMap((body, i) =>
      Array.from({ length: body.len }, (_, k) => {
        const cx = body.x + k;
        return (
          <div
            key={`${lane.row}-${i}-${k}`}
            style={{
              position: "absolute",
              left: `${((cx + 0.12) / COLS) * 100}cqw`,
              top: `${rowTop(lane.row) + CELL * 0.16}cqh`,
              width: `${(0.76 / COLS) * 100}cqw`,
              height: `${CELL * 0.68}cqh`,
              borderRadius: "50%",
              background: PALETTE.turtleShell,
              boxShadow: `inset 0 0 0 ${CELL * 0.08}cqh ${PALETTE.turtle}`,
            }}
          />
        );
      }),
    );
  }
  return lane.bodies.map((body, i) => (
    <div key={`${lane.row}-${i}`} style={bodyStyle(lane.row, body, vehicleColor(lane.variant, lane.dir), "1.6cqw")}>
      <div
        style={{
          position: "absolute",
          top: "18%",
          left: lane.dir === 1 ? "auto" : "10%",
          right: lane.dir === 1 ? "10%" : "auto",
          width: "12%",
          height: "22%",
          borderRadius: "50%",
          background: PALETTE.headlight,
          boxShadow: `0 0 3cqw ${PALETTE.headlight}`,
        }}
      />
    </div>
  ));
}

export default function RoadHopperPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `radial-gradient(circle at 50% -8%, ${PALETTE.skyTop} 0%, ${PALETTE.skyMid} 45%, ${PALETTE.skyBottom} 100%)`,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={rowStyle(HOME_ROW, PALETTE.hedge)}>
        {BAY_COLS.map((col) => (
          <div
            key={col}
            style={{
              position: "absolute",
              left: `${((col + 0.08) / COLS) * 100}cqw`,
              top: "12%",
              width: `${(0.84 / COLS) * 100}cqw`,
              height: "76%",
              borderRadius: "1.2cqw",
              background: PALETTE.homeEmpty,
              border: "1px solid rgba(120,220,160,0.28)",
            }}
          />
        ))}
      </div>

      {[7, 8, 9, 10, 11].map((row) => (
        <div key={row} style={rowStyle(row, `linear-gradient(180deg, ${PALETTE.riverAlt}, ${PALETTE.river} 50%, ${PALETTE.riverDeep})`)} />
      ))}

      <div style={rowStyle(MEDIAN_ROW, `linear-gradient(180deg, ${PALETTE.grassEdge}, ${PALETTE.grass} 20%, ${PALETTE.grassDark})`)} />

      {[1, 2, 3, 4, 5].map((row) => (
        <div key={row} style={rowStyle(row, row % 2 === 0 ? PALETTE.asphalt : PALETTE.asphaltAlt)}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              width: "100%",
              height: "1px",
              backgroundImage: `repeating-linear-gradient(90deg, ${PALETTE.laneLine} 0 3cqw, transparent 3cqw 6cqw)`,
            }}
          />
        </div>
      ))}

      <div style={rowStyle(START_ROW, `linear-gradient(180deg, ${PALETTE.grassEdge}, ${PALETTE.grass} 20%, ${PALETTE.grassDark})`)} />

      {LANES.map((lane) => renderLane(lane))}

      <div
        style={{
          position: "absolute",
          left: `${((START_COL + 0.14) / COLS) * 100}cqw`,
          top: `${rowTop(START_ROW) + CELL * 0.1}cqh`,
          width: `${(0.72 / COLS) * 100}cqw`,
          height: `${CELL * 0.8}cqh`,
          borderRadius: "1.6cqw",
          background: PALETTE.hopper,
        }}
      >
        <div style={{ position: "absolute", top: "10%", left: "12%", width: "22%", height: "22%", borderRadius: "50%", background: PALETTE.hopperDark }} />
        <div style={{ position: "absolute", top: "10%", right: "12%", width: "22%", height: "22%", borderRadius: "50%", background: PALETTE.hopperDark }} />
        <div style={{ position: "absolute", top: "14%", left: "17%", width: "10%", height: "10%", borderRadius: "50%", background: PALETTE.hopperEye }} />
        <div style={{ position: "absolute", top: "14%", right: "17%", width: "10%", height: "10%", borderRadius: "50%", background: PALETTE.hopperEye }} />
      </div>

      <div
        style={{
          position: "absolute",
          top: "2.4cqh",
          left: "3cqw",
          display: "flex",
          gap: "2.6cqw",
          alignItems: "flex-end",
        }}
      >
        <span style={{ fontSize: "2.1cqw", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: PALETTE.hopper, textShadow: "0 0 4px rgba(124,252,90,0.5)" }}>
          Score 0
        </span>
        <span style={{ fontSize: "1.5cqw", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: PALETTE.accent }}>
          Lv 1
        </span>
      </div>

      <div style={{ position: "absolute", top: "2.6cqh", right: "3cqw", display: "flex", gap: "0.8cqw" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: "1.6cqw", height: "1.6cqw", borderRadius: "50%", background: PALETTE.hopper, boxShadow: "0 0 4px rgba(124,252,90,0.6)" }} />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: "6.2cqh",
          left: "3cqw",
          width: "24cqw",
          height: "0.7cqh",
          borderRadius: "1cqw",
          background: "rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: "1cqw", background: PALETTE.hopper, boxShadow: `0 0 4px ${PALETTE.hopper}` }} />
      </div>
    </div>
  );
}
