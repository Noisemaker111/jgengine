import type { Checkpoint } from "@jgengine/core/game/race";

import { districtById } from "../district/districts";
import { offsetLateral, vecLerp, type Vec2 } from "./geometry";

export const ROAD_Y = 0.15;
export const CHECKPOINT_HALF: readonly [number, number, number] = [11, 6, 11];

export const CHECKPOINTS_2D: readonly Vec2[] = [
  [0, -170],
  [-90, -170],
  [-190, -120],
  [-220, -20],
  [-190, 70],
  [-100, 130],
  [10, 170],
  [110, 150],
  [180, 80],
  [200, -20],
  [150, -110],
  [70, -160],
];

export const CHECKPOINT_COUNT = CHECKPOINTS_2D.length;

export function checkpointPosition(index: number): readonly [number, number, number] {
  const p = CHECKPOINTS_2D[index % CHECKPOINT_COUNT]!;
  return [p[0], ROAD_Y, p[1]];
}

export const CHECKPOINTS: readonly Checkpoint[] = CHECKPOINTS_2D.map((_, i) => ({
  id: `checkpoint-${i}`,
  center: checkpointPosition(i),
  half: CHECKPOINT_HALF,
}));

export interface ShiftPair {
  id: string;
  legIndex: number;
  district: string;
  longWaypoint: Vec2;
  barrierVariantT: readonly [number, number];
}

function detourVia(from: Vec2, to: Vec2, push: number): Vec2 {
  const mid: Vec2 = vecLerp(from, to, 0.5);
  const mag = Math.hypot(mid[0], mid[1]) || 1;
  const outward: Vec2 = [mid[0] / mag, mid[1] / mag];
  return [mid[0] + outward[0] * push, mid[1] + outward[1] * push];
}

export const SHIFT_PAIRS: readonly ShiftPair[] = [
  {
    id: "harbor-cut",
    legIndex: 2,
    district: "harbor",
    longWaypoint: detourVia(CHECKPOINTS_2D[2]!, CHECKPOINTS_2D[3]!, 70),
    barrierVariantT: [0.35, 0.65],
  },
  {
    id: "heights-cut",
    legIndex: 5,
    district: "heights",
    longWaypoint: detourVia(CHECKPOINTS_2D[5]!, CHECKPOINTS_2D[6]!, 70),
    barrierVariantT: [0.4, 0.6],
  },
  {
    id: "downtown-cut",
    legIndex: 8,
    district: "downtown",
    longWaypoint: detourVia(CHECKPOINTS_2D[8]!, CHECKPOINTS_2D[9]!, 70),
    barrierVariantT: [0.3, 0.7],
  },
  {
    id: "finish-cut",
    legIndex: 10,
    district: "downtown",
    longWaypoint: detourVia(CHECKPOINTS_2D[10]!, CHECKPOINTS_2D[11]!, 70),
    barrierVariantT: [0.4, 0.6],
  },
] as const;

export function shiftPairById(id: string): ShiftPair {
  const found = SHIFT_PAIRS.find((p) => p.id === id);
  if (found === undefined) throw new Error(`shiftPairById: unknown shift pair "${id}"`);
  return found;
}

export function shiftPairForLeg(legIndex: number): ShiftPair | null {
  return SHIFT_PAIRS.find((p) => p.legIndex === legIndex) ?? null;
}

export interface DriftGate {
  id: string;
  targetShiftId: string;
  position: Vec2;
  radius: number;
  styleThreshold: number;
  label: string;
}

function gatePosition(legIndex: number, lateral: number): Vec2 {
  const from = CHECKPOINTS_2D[legIndex]!;
  const to = CHECKPOINTS_2D[(legIndex + 1) % CHECKPOINT_COUNT]!;
  return offsetLateral(from, to, lateral);
}

export const DRIFT_GATES: readonly DriftGate[] = [
  {
    id: "harbor-apex",
    targetShiftId: "harbor-cut",
    position: gatePosition(2, -14),
    radius: 20,
    styleThreshold: 0.5,
    label: "Harbor Apex",
  },
  {
    id: "harbor-wide",
    targetShiftId: "harbor-cut",
    position: gatePosition(2, 22),
    radius: 20,
    styleThreshold: 0.7,
    label: "Harbor Wide",
  },
  {
    id: "heights-corner",
    targetShiftId: "heights-cut",
    position: gatePosition(5, -14),
    radius: 20,
    styleThreshold: 0.55,
    label: "Heights Bend",
  },
  {
    id: "downtown-apex",
    targetShiftId: "downtown-cut",
    position: gatePosition(8, -14),
    radius: 20,
    styleThreshold: 0.5,
    label: "Downtown Apex",
  },
  {
    id: "downtown-wide",
    targetShiftId: "downtown-cut",
    position: gatePosition(8, 22),
    radius: 20,
    styleThreshold: 0.7,
    label: "Downtown Wide",
  },
  {
    id: "finish-corner",
    targetShiftId: "finish-cut",
    position: gatePosition(10, -14),
    radius: 20,
    styleThreshold: 0.55,
    label: "Finish Bend",
  },
] as const;

export const LAPS = 3;
export const SPAWN_POSITION: readonly [number, number, number] = checkpointPosition(0);
export const SPAWN_HEADING = 0;

export function districtForLeg(legIndex: number): string {
  const pair = shiftPairForLeg(legIndex);
  if (pair !== null) return pair.district;
  if (legIndex <= 4) return districtById("harbor").id;
  if (legIndex <= 7) return districtById("heights").id;
  return districtById("downtown").id;
}
