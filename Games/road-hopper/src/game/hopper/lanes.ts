import {
  DIVE_BLINK,
  DIVE_CYCLE,
  DIVE_DOWN_BASE,
  DIVE_DOWN_MAX,
  DIVE_DOWN_PER_LEVEL,
  LANE_SPAN,
  LEVEL_SPEED_STEP,
  RIVER_ROWS,
  ROAD_ROWS,
  TRAFFIC_MAX_EXTRA,
  TRAFFIC_STEP_LEVELS,
  WRAP_MIN,
} from "./constants";
import { bodyCoversCentre, footprintsOverlap } from "./grid";

export type LaneKind = "road" | "river";
export type Variant = "car" | "truck" | "log" | "turtle";

export interface LaneTemplate {
  readonly variant: Variant;
  readonly dir: 1 | -1;
  readonly speed: number;
  readonly len: number;
  readonly count: number;
  readonly dive: boolean;
  readonly divePhase: number;
}

export interface Lane {
  row: number;
  kind: LaneKind;
  variant: Variant;
  dir: 1 | -1;
  speed: number;
  len: number;
  count: number;
  gap: number;
  offset: number;
  dive: boolean;
  diveClock: number;
  submerged: boolean;
  blinking: boolean;
}

export interface Body {
  readonly x: number;
  readonly len: number;
}

const ROAD_TEMPLATES: readonly LaneTemplate[] = [
  { variant: "truck", dir: -1, speed: 1.7, len: 2, count: 2, dive: false, divePhase: 0 },
  { variant: "car", dir: 1, speed: 2.6, len: 1, count: 4, dive: false, divePhase: 0 },
  { variant: "car", dir: -1, speed: 2.1, len: 1, count: 3, dive: false, divePhase: 0 },
  { variant: "truck", dir: 1, speed: 1.5, len: 2, count: 2, dive: false, divePhase: 0 },
  { variant: "car", dir: -1, speed: 3.2, len: 1, count: 4, dive: false, divePhase: 0 },
];

const RIVER_TEMPLATES: readonly LaneTemplate[] = [
  { variant: "log", dir: 1, speed: 1.5, len: 3, count: 4, dive: false, divePhase: 0 },
  { variant: "turtle", dir: -1, speed: 1.9, len: 3, count: 3, dive: true, divePhase: 0.0 },
  { variant: "log", dir: 1, speed: 2.4, len: 2, count: 3, dive: false, divePhase: 0 },
  { variant: "turtle", dir: -1, speed: 1.7, len: 3, count: 3, dive: true, divePhase: 0.5 },
  { variant: "log", dir: 1, speed: 1.9, len: 3, count: 4, dive: false, divePhase: 0 },
];

export function speedMultiplier(level: number): number {
  return 1 + (level - 1) * LEVEL_SPEED_STEP;
}

function trafficExtra(level: number): number {
  return Math.min(TRAFFIC_MAX_EXTRA, Math.floor((level - 1) / TRAFFIC_STEP_LEVELS));
}

function laneFromTemplate(row: number, kind: LaneKind, t: LaneTemplate, level: number): Lane {
  const extra = kind === "road" ? trafficExtra(level) : 0;
  const count = Math.max(1, t.count + extra);
  const gap = LANE_SPAN / count;
  return {
    row,
    kind,
    variant: t.variant,
    dir: t.dir,
    speed: t.speed * speedMultiplier(level),
    len: t.len,
    count,
    gap,
    offset: (t.divePhase * LANE_SPAN + row * 2.3) % LANE_SPAN,
    dive: t.dive,
    diveClock: t.divePhase * DIVE_CYCLE,
    submerged: false,
    blinking: false,
  };
}

export function buildLanes(level: number): Lane[] {
  const lanes: Lane[] = [];
  ROAD_ROWS.forEach((row, i) => lanes.push(laneFromTemplate(row, "road", ROAD_TEMPLATES[i]!, level)));
  RIVER_ROWS.forEach((row, i) => lanes.push(laneFromTemplate(row, "river", RIVER_TEMPLATES[i]!, level)));
  return lanes;
}

export type DiveState = "up" | "blink" | "down";

export function diveDownDuration(level: number): number {
  return Math.min(DIVE_DOWN_MAX, DIVE_DOWN_BASE + (level - 1) * DIVE_DOWN_PER_LEVEL);
}

export function turtleDiveState(clock: number, level: number): DiveState {
  const t = ((clock % DIVE_CYCLE) + DIVE_CYCLE) % DIVE_CYCLE;
  const down = diveDownDuration(level);
  const up = DIVE_CYCLE - down - DIVE_BLINK;
  if (t < up) return "up";
  if (t < up + DIVE_BLINK) return "blink";
  return "down";
}

/** Advance a lane's scroll offset and (for turtle lanes) its dive schedule. Mutates the lane. */
export function advanceLane(lane: Lane, dt: number, level: number): void {
  lane.offset = (lane.offset + lane.speed * dt) % LANE_SPAN;
  if (lane.dive) {
    lane.diveClock += dt;
    const state = turtleDiveState(lane.diveClock, level);
    lane.submerged = state === "down";
    lane.blinking = state === "blink";
  }
}

/** Left-edge positions of every body in a lane, in tile units (may extend past the field edges). */
export function laneBodies(lane: Lane): Body[] {
  const bodies: Body[] = [];
  for (let i = 0; i < lane.count; i += 1) {
    const base = i * lane.gap;
    const raw = lane.dir === 1 ? base + lane.offset : base - lane.offset;
    const x = WRAP_MIN + (((raw - WRAP_MIN) % LANE_SPAN) + LANE_SPAN) % LANE_SPAN;
    bodies.push({ x, len: lane.len });
  }
  return bodies;
}

/** True when any vehicle in a road lane overlaps the hopper footprint at `col`. */
export function vehicleHitsCol(lane: Lane, col: number): boolean {
  for (const body of laneBodies(lane)) {
    if (footprintsOverlap(col, body.x, body.len)) return true;
  }
  return false;
}

export interface Support {
  readonly supported: boolean;
  readonly dir: 1 | -1;
  readonly speed: number;
}

/** Whether a solid carrier (log, or surfaced turtle) is under the hopper centre at `col`. */
export function carrierSupportAt(lane: Lane, col: number): Support {
  if (lane.submerged) return { supported: false, dir: lane.dir, speed: lane.speed };
  for (const body of laneBodies(lane)) {
    if (bodyCoversCentre(col, body.x, body.len)) {
      return { supported: true, dir: lane.dir, speed: lane.speed };
    }
  }
  return { supported: false, dir: lane.dir, speed: lane.speed };
}
