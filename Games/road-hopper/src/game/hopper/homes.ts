import { BAY_COLS } from "./constants";
import { isBayAligned, nearestBay } from "./grid";

export interface HomeBay {
  readonly col: number;
  filled: boolean;
  fly: boolean;
}

export function createHomes(): HomeBay[] {
  return BAY_COLS.map((col) => ({ col, filled: false, fly: false }));
}

export function emptyBayIndices(homes: readonly HomeBay[]): number[] {
  const out: number[] = [];
  homes.forEach((bay, i) => {
    if (!bay.filled) out.push(i);
  });
  return out;
}

export function allFilled(homes: readonly HomeBay[]): boolean {
  return homes.every((bay) => bay.filled);
}

export type HomeLanding =
  | { readonly kind: "miss" }
  | { readonly kind: "occupied"; readonly index: number }
  | { readonly kind: "fill"; readonly index: number; readonly col: number; readonly fly: boolean };

/** Classify a hop onto the home row: miss (hedge), occupied (duplicate = death), or a clean fill. */
export function resolveHomeLanding(homes: readonly HomeBay[], col: number): HomeLanding {
  if (!isBayAligned(col)) return { kind: "miss" };
  const target = nearestBay(col);
  const bay = homes[target.index]!;
  if (bay.filled) return { kind: "occupied", index: target.index };
  return { kind: "fill", index: target.index, col: bay.col, fly: bay.fly };
}

/** Deterministically choose an empty bay for the bonus fly, or null when every bay is filled. */
export function pickEmptyBay(homes: readonly HomeBay[], rng: () => number): number | null {
  const empty = emptyBayIndices(homes);
  if (empty.length === 0) return null;
  const index = Math.min(empty.length - 1, Math.floor(rng() * empty.length));
  return empty[index] ?? null;
}
