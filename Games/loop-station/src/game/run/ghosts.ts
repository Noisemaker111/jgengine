import { positiveMod } from "../track/geometry";
import type { GhostFrameData, GhostRecord } from "./types";

export function ghostPositionAt(ghost: GhostRecord, now: number): GhostFrameData | null {
  if (ghost.lapDuration <= 0) return null;
  const elapsed = positiveMod(now - ghost.startTime, ghost.lapDuration);
  const frame = ghost.buffer.seek(elapsed);
  return frame === null ? null : frame.data;
}

export function ghostPhaseAt(ghost: GhostRecord, now: number): number {
  const data = ghostPositionAt(ghost, now);
  return data === null ? 0 : data.s;
}

export type GlowTier = 0 | 1 | 2;

const GLOW_FAR = 14;
const GLOW_NEAR = 7;

export function ghostGlowTier(distance: number): GlowTier {
  if (distance <= GLOW_NEAR) return 2;
  if (distance <= GLOW_FAR) return 1;
  return 0;
}
