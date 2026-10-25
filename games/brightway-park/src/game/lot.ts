import { GRID, PARK_HALF } from "./catalog";
import type { BuildableDef } from "./objects/catalog";

/** The lot: 29 x 29 cells of 4 m, cell [0, 0]'s corner at (-58, -58), the fence just outside. */
export const LOT = { cols: 29, rows: 29, cell: GRID, origin: [-(PARK_HALF - 2), -(PARK_HALF - 2)] as const };

/** Cells a side of a structure covers on the lot. */
export function sizeOf(def: BuildableDef): number {
  return Math.max(1, Math.round(def.footprint / GRID));
}
