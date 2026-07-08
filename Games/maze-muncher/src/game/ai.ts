import { type Cell, type GhostDef, isWalkableWorld } from "./maze";

export type Mode = "scatter" | "chase" | "frightened" | "eaten";

export interface Dir {
  dc: number;
  dr: number;
}

const SCHEDULE: readonly (readonly [number, Mode])[] = [
  [7, "scatter"],
  [27, "chase"],
  [34, "scatter"],
];

export function scheduledMode(elapsed: number): Mode {
  for (const [until, mode] of SCHEDULE) {
    if (elapsed < until) return mode;
  }
  return "chase";
}

export function farthestCorner(from: Cell, corners: readonly Cell[]): Cell {
  let best = corners[0]!;
  let bestDist = -1;
  for (const corner of corners) {
    const dist = (corner.c - from.c) ** 2 + (corner.r - from.r) ** 2;
    if (dist > bestDist) {
      bestDist = dist;
      best = corner;
    }
  }
  return best;
}

export function chaseTargetCell(def: GhostDef, muncher: Cell, dir: Dir, distTiles: number): Cell {
  if (def.leash) {
    return distTiles > 8 ? muncher : def.scatter;
  }
  if (def.ahead > 0) {
    return { c: muncher.c + dir.dc * def.ahead, r: muncher.r + dir.dr * def.ahead };
  }
  return muncher;
}

export function slideMove(ox: number, oz: number, nx: number, nz: number): [number, number] {
  if (isWalkableWorld(nx, nz)) return [nx, nz];
  if (isWalkableWorld(nx, oz)) return [nx, oz];
  if (isWalkableWorld(ox, nz)) return [ox, nz];
  return [ox, oz];
}

export const GHOST_BASE_SPEED = 3.6;
const GHOST_SPEED_STEP = 0.3;
const GHOST_MAX_SPEED = 5.4;

export function ghostSpeedForLevel(level: number): number {
  return Math.min(GHOST_BASE_SPEED + (level - 1) * GHOST_SPEED_STEP, GHOST_MAX_SPEED);
}

const FRIGHT_BASE_SECONDS = 7;
const FRIGHT_MIN_SECONDS = 3;

export function frightSecondsForLevel(level: number): number {
  return Math.max(FRIGHT_MIN_SECONDS, FRIGHT_BASE_SECONDS - (level - 1));
}

export const GHOST_BASE_SCORE = 200;
const GHOST_MAX_CHAIN_SCORE = 1600;

export function ghostChainScore(chain: number): number {
  return Math.min(GHOST_BASE_SCORE * 2 ** Math.max(0, chain - 1), GHOST_MAX_CHAIN_SCORE);
}
