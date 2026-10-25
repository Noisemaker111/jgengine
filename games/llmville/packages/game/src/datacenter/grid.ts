export const CELL_SIZE = 1;
export const CLAIM_GAP_CELLS = 4;

export interface CellCoord {
  cx: number;
  cz: number;
}

export function cellKey(cell: CellCoord): string {
  return `${cell.cx},${cell.cz}`;
}

export function parseCellKey(key: string): CellCoord {
  const [cxRaw = "0", czRaw = "0"] = key.split(",");
  return { cx: Number(cxRaw), cz: Number(czRaw) };
}

export function worldToCell(x: number, z: number): CellCoord {
  return { cx: Math.floor(x / CELL_SIZE), cz: Math.floor(z / CELL_SIZE) };
}

export function cellToWorldCenter(cell: CellCoord): { x: number; z: number } {
  return { x: (cell.cx + 0.5) * CELL_SIZE, z: (cell.cz + 0.5) * CELL_SIZE };
}

export function cellBounds(cell: CellCoord): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: cell.cx * CELL_SIZE,
    maxX: (cell.cx + 1) * CELL_SIZE,
    minZ: cell.cz * CELL_SIZE,
    maxZ: (cell.cz + 1) * CELL_SIZE,
  };
}

export function chebyshevCellDistance(a: CellCoord, b: CellCoord): number {
  return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));
}

export function cellsForBounds(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): CellCoord[] {
  const minCx = Math.floor(bounds.minX / CELL_SIZE);
  const maxCx = Math.max(minCx, Math.ceil(bounds.maxX / CELL_SIZE) - 1);
  const minCz = Math.floor(bounds.minZ / CELL_SIZE);
  const maxCz = Math.max(minCz, Math.ceil(bounds.maxZ / CELL_SIZE) - 1);
  const cells: CellCoord[] = [];
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      cells.push({ cx, cz });
    }
  }
  return cells;
}
