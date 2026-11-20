import type { CellCoord } from "@llmville/game/datacenter/grid";

export const DATACENTER_CEILING_HEIGHT = 6;
export const DATACENTER_COLUMN_SPACING_CELLS = 16;
export const DATACENTER_FLOOR_TILE_CELLS = 4;

function columnLatticeIndex(n: number): number {
  return ((n % DATACENTER_COLUMN_SPACING_CELLS) + DATACENTER_COLUMN_SPACING_CELLS) % DATACENTER_COLUMN_SPACING_CELLS;
}

export function isStructuralColumnCell(cell: CellCoord): boolean {
  return columnLatticeIndex(cell.cx) === 0 && columnLatticeIndex(cell.cz) === 0;
}

/**
 * The Commons: the shared lounge around the column at (32, 32), where new labs arrive, furnished in `src/editor.scene.json`.
 * Every player can walk it; no lab claims, spawns or starts in it. Labs that held a cell here before it
 * existed keep it, and the lounge's furniture gives way to them.
 */
export const COMMONS_CELLS = { minCx: 21, maxCx: 44, minCz: 21, maxCz: 44 } as const;

export function isCommonsCell(cell: CellCoord): boolean {
  return cell.cx >= COMMONS_CELLS.minCx && cell.cx <= COMMONS_CELLS.maxCx && cell.cz >= COMMONS_CELLS.minCz && cell.cz <= COMMONS_CELLS.maxCz;
}
