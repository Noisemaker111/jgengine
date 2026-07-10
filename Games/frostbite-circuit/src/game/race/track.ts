import type { Checkpoint } from "@jgengine/core/game/race";

import type { CorridorId } from "../ice/grid";
import {
  closedCatmullRomLoop,
  headingFromTangent,
  loopNormalAt,
  loopTangentAt,
  offsetPoint,
  vecLerp,
  type Vec2,
} from "./geometry";

export const CORNER_COUNT = 6;
export const LAPS = 5;
export const ICE_Y = 0.06;

const RADIUS_X = 70;
const RADIUS_Z = 50;
const CORNER_RADIUS_SCALE: readonly number[] = [1, 0.72, 1.08, 0.85, 1.15, 0.78];

export const SAMPLES_PER_LEG = 32;

function cornerPoint(index: number): Vec2 {
  const angle = (index / CORNER_COUNT) * Math.PI * 2;
  const scale = CORNER_RADIUS_SCALE[index % CORNER_COUNT]!;
  return [Math.cos(angle) * RADIUS_X * scale, Math.sin(angle) * RADIUS_Z * scale];
}

export const CORNER_POINTS: readonly Vec2[] = Array.from({ length: CORNER_COUNT }, (_, i) => cornerPoint(i));

export const CORNER_NAMES: readonly string[] = [
  "Start Straight",
  "Corner 1 — Hairpin Bend",
  "Corner 2 — Long Sweeper",
  "Corner 3 — The Pinch",
  "Corner 4 — Wide Arc",
  "Corner 5 — Final Chicane",
];

export const CENTERLINE: readonly Vec2[] = closedCatmullRomLoop(CORNER_POINTS, SAMPLES_PER_LEG);
export const CENTERLINE_LENGTH: number = CENTERLINE.length;

export const CORRIDOR_LATERAL_OFFSET: Readonly<Record<CorridorId, number>> = { inner: -9, mid: 0, outer: 9 };
export const CORRIDOR_HALF_WIDTH = 3.2;

function buildCorridorLine(corridor: CorridorId): Vec2[] {
  const offset = CORRIDOR_LATERAL_OFFSET[corridor];
  return CENTERLINE.map((point, index) => offsetPoint(point, loopNormalAt(CENTERLINE, index), offset));
}

export const CORRIDOR_LINES: Readonly<Record<CorridorId, readonly Vec2[]>> = {
  inner: buildCorridorLine("inner"),
  mid: buildCorridorLine("mid"),
  outer: buildCorridorLine("outer"),
};

export function legIndexAt(sampleIndex: number): number {
  return Math.floor((sampleIndex % CENTERLINE_LENGTH) / SAMPLES_PER_LEG);
}

export function legSampleRange(legIndex: number): readonly [number, number] {
  const start = legIndex * SAMPLES_PER_LEG;
  return [start, start + SAMPLES_PER_LEG];
}

export function toWorld(point: Vec2, y = ICE_Y): readonly [number, number, number] {
  return [point[0], y, point[1]];
}

const CHECKPOINT_HALF: readonly [number, number, number] = [16, 5, 16];

export const CHECKPOINTS: readonly Checkpoint[] = Array.from({ length: CORNER_COUNT }, (_, i) => {
  const cornerIndex = (i + 1) % CORNER_COUNT;
  const center = CORNER_POINTS[cornerIndex]!;
  return { id: `corner-${cornerIndex}`, center: toWorld(center), half: CHECKPOINT_HALF };
});

const SPAWN_LEAD_SAMPLES = 6;
const spawnSampleIndex = (CENTERLINE_LENGTH - SPAWN_LEAD_SAMPLES + CENTERLINE_LENGTH) % CENTERLINE_LENGTH;
export const SPAWN_POSITION: readonly [number, number, number] = toWorld(CORRIDOR_LINES.mid[spawnSampleIndex]!);
export const SPAWN_HEADING: number = headingFromTangent(loopTangentAt(CENTERLINE, spawnSampleIndex));

export interface SectorGate {
  readonly id: string;
  readonly corner: number;
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly heading: number;
}

export const SECTOR_GATES: readonly SectorGate[] = CORNER_POINTS.map((point, index) => ({
  id: `gate-${index}`,
  corner: index,
  name: CORNER_NAMES[index]!,
  position: toWorld(point, ICE_Y + 0.4),
  heading: headingFromTangent(loopTangentAt(CENTERLINE, index * SAMPLES_PER_LEG)),
}));

export function nearestSampleIndex(point: Vec2): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < CENTERLINE.length; i += 1) {
    const c = CENTERLINE[i]!;
    const d = (c[0] - point[0]) ** 2 + (c[1] - point[1]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export function legIndexAfterCheckpoint(checkpointIndex: number | null): number {
  if (checkpointIndex === null || checkpointIndex < 0) return 0;
  return (checkpointIndex + 1) % CORNER_COUNT;
}

export function corridorPointAt(corridor: CorridorId, t: number): Vec2 {
  const line = CORRIDOR_LINES[corridor];
  const scaled = ((t % 1) + 1) % 1;
  const exact = scaled * line.length;
  const i0 = Math.floor(exact) % line.length;
  const i1 = (i0 + 1) % line.length;
  return vecLerp(line[i0]!, line[i1]!, exact - Math.floor(exact));
}
