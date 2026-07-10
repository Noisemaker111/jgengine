import type { Lane } from "./course";
import type { Polarity } from "./polarity";

export type TrainLineId = "alpha" | "beta";

export interface TrainLineDef {
  id: TrainLineId;
  displayName: string;
  lane: Lane;
  roofPolarity: Polarity;
  speed: number;
  length: number;
  headway: number;
  offset: number;
  trackStartZ: number;
  trackEndZ: number;
}

export interface TrainWindow {
  headZ: number;
  tailZ: number;
  index: number;
}

export function trainWindowAt(def: TrainLineDef, t: number): TrainWindow {
  const raw = t - def.offset;
  const index = Math.floor(raw / def.headway);
  const cycleStart = index * def.headway + def.offset;
  const headZ = def.trackStartZ + def.speed * (t - cycleStart);
  return { headZ, tailZ: headZ - def.length, index };
}

export function isTrainOnTrack(def: TrainLineDef, window: TrainWindow): boolean {
  return window.headZ >= def.trackStartZ && window.tailZ <= def.trackEndZ;
}

export function isBoardable(def: TrainLineDef, t: number, botZ: number, tolerance = 0.6): boolean {
  const window = trainWindowAt(def, t);
  if (!isTrainOnTrack(def, window)) return false;
  return botZ >= window.tailZ - tolerance && botZ <= window.headZ + tolerance;
}

export function secondsUntilHeadReaches(def: TrainLineDef, t: number, atZ: number): number | null {
  const window = trainWindowAt(def, t);
  if (!isTrainOnTrack(def, window)) return null;
  if (window.headZ > atZ) return null;
  return (atZ - window.headZ) / def.speed;
}

export function trainRideZ(def: TrainLineDef, t: number, boardedOffset: number): number {
  const window = trainWindowAt(def, t);
  return window.headZ + boardedOffset;
}
