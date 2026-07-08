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
