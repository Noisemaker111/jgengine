import { seededRng } from "@jgengine/core/random/rng";
import { type Vec2, vecScale } from "../shared/vec2";
import { ZONE_IDS, type ZoneId, zoneAt } from "./zones";

export const SWING_INTERVAL_SEC = 25;
export const ANNOUNCE_LEAD_SEC = 10;
export const CURRENT_MIN_STRENGTH = 2.4;
export const CURRENT_MAX_STRENGTH = 5.6;

export type CompassLabel = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

const COMPASS_DIRECTIONS: readonly { label: CompassLabel; dir: Vec2 }[] = [
  { label: "N", dir: [0, -1] },
  { label: "NE", dir: [0.7071, -0.7071] },
  { label: "E", dir: [1, 0] },
  { label: "SE", dir: [0.7071, 0.7071] },
  { label: "S", dir: [0, 1] },
  { label: "SW", dir: [-0.7071, 0.7071] },
  { label: "W", dir: [-1, 0] },
  { label: "NW", dir: [-0.7071, -0.7071] },
];

export interface CurrentState {
  compass: CompassLabel;
  dir: Vec2;
  strength: number;
}

export type CurrentZoneStates = Record<ZoneId, CurrentState>;

export interface CurrentField {
  swingIndex: number;
  secIntoSwing: number;
  secToSwing: number;
  announcing: boolean;
  zoneStates: CurrentZoneStates;
  nextZoneStates: CurrentZoneStates;
}

export function currentStateForSwing(seed: string, zoneId: ZoneId, swingIndex: number): CurrentState {
  const rng = seededRng(`${seed}:current:${zoneId}:${swingIndex}`);
  const pickRoll = rng();
  const strengthRoll = rng();
  const compassIndex = Math.floor(pickRoll * COMPASS_DIRECTIONS.length) % COMPASS_DIRECTIONS.length;
  const picked = COMPASS_DIRECTIONS[compassIndex]!;
  const strength = CURRENT_MIN_STRENGTH + strengthRoll * (CURRENT_MAX_STRENGTH - CURRENT_MIN_STRENGTH);
  return { compass: picked.label, dir: picked.dir, strength };
}

function zoneStatesForSwing(seed: string, swingIndex: number): CurrentZoneStates {
  const states = {} as Record<ZoneId, CurrentState>;
  for (const zoneId of ZONE_IDS) states[zoneId] = currentStateForSwing(seed, zoneId, swingIndex);
  return states;
}

export function sampleCurrentField(seed: string, simTimeSec: number): CurrentField {
  const clampedTime = Math.max(0, simTimeSec);
  const swingIndex = Math.floor(clampedTime / SWING_INTERVAL_SEC);
  const secIntoSwing = clampedTime - swingIndex * SWING_INTERVAL_SEC;
  const secToSwing = SWING_INTERVAL_SEC - secIntoSwing;
  return {
    swingIndex,
    secIntoSwing,
    secToSwing,
    announcing: secToSwing <= ANNOUNCE_LEAD_SEC,
    zoneStates: zoneStatesForSwing(seed, swingIndex),
    nextZoneStates: zoneStatesForSwing(seed, swingIndex + 1),
  };
}

export function currentVectorAt(field: CurrentField, x: number, z: number): Vec2 {
  const zoneId = zoneAt(x, z);
  const state = field.zoneStates[zoneId];
  return vecScale(state.dir, state.strength);
}

export function swingCountInRace(raceDurationSec: number): number {
  return Math.floor(raceDurationSec / SWING_INTERVAL_SEC);
}
