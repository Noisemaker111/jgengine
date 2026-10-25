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
