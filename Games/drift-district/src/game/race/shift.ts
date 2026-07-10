import { seededStreams } from "@jgengine/core/random/rng";

import { vecLerp, type Vec2 } from "./geometry";
import { CHECKPOINTS_2D, CHECKPOINT_COUNT, DRIFT_GATES, SHIFT_PAIRS, shiftPairForLeg, type ShiftPair } from "./route";

export interface ShiftBarrierState {
  active: boolean;
  variantIndex: 0 | 1;
  triggeredBy: string | null;
  triggerCount: number;
}

export type ShiftState = Readonly<Record<string, ShiftBarrierState>>;

export function initialShiftState(): ShiftState {
  const entries = SHIFT_PAIRS.map((pair): readonly [string, ShiftBarrierState] => [
    pair.id,
    { active: false, variantIndex: 0, triggeredBy: null, triggerCount: 0 },
  ]);
  return Object.fromEntries(entries);
}

function driftGateById(gateId: string) {
  return DRIFT_GATES.find((gate) => gate.id === gateId) ?? null;
}

export function applyGateTrigger(state: ShiftState, seed: string, gateId: string): ShiftState {
  const gate = driftGateById(gateId);
  if (gate === null) return state;
  const prior = state[gate.targetShiftId] ?? { active: false, variantIndex: 0, triggeredBy: null, triggerCount: 0 };
  const nextCount = prior.triggerCount + 1;
  const rng = seededStreams(seed)(`shift:${gate.targetShiftId}:${nextCount}`);
  const variantIndex: 0 | 1 = rng() < 0.5 ? 0 : 1;
  return {
    ...state,
    [gate.targetShiftId]: { active: true, variantIndex, triggeredBy: gateId, triggerCount: nextCount },
  };
}

export function resolveShiftState(seed: string, triggeredGateIds: readonly string[]): ShiftState {
  let state = initialShiftState();
  for (const gateId of triggeredGateIds) state = applyGateTrigger(state, seed, gateId);
  return state;
}

export function barrierWorldPosition(pair: ShiftPair, state: ShiftState): Vec2 {
  const entry = state[pair.id];
  const t = pair.barrierVariantT[entry?.variantIndex ?? 0];
  const from = CHECKPOINTS_2D[pair.legIndex]!;
  const to = CHECKPOINTS_2D[(pair.legIndex + 1) % CHECKPOINT_COUNT]!;
  return vecLerp(from, to, t);
}

export function legWaypoints(legIndex: number, state: ShiftState): readonly Vec2[] {
  const from = CHECKPOINTS_2D[legIndex]!;
  const to = CHECKPOINTS_2D[(legIndex + 1) % CHECKPOINT_COUNT]!;
  const pair = shiftPairForLeg(legIndex);
  if (pair === null) return [from, to];
  const shifted = state[pair.id]?.active === true;
  return shifted ? [from, to] : [from, pair.longWaypoint, to];
}

export function isLegShifted(legIndex: number, state: ShiftState): boolean {
  const pair = shiftPairForLeg(legIndex);
  if (pair === null) return false;
  return state[pair.id]?.active === true;
}

export function gateStyleClears(gateId: string, driftCharge: number, drifting: boolean): boolean {
  const gate = driftGateById(gateId);
  if (gate === null) return false;
  return drifting && driftCharge >= gate.styleThreshold;
}

export function gateAt(position: Vec2, radius = 1): string | null {
  for (const gate of DRIFT_GATES) {
    const dx = position[0] - gate.position[0];
    const dz = position[1] - gate.position[1];
    if (Math.hypot(dx, dz) <= gate.radius + radius) return gate.id;
  }
  return null;
}
