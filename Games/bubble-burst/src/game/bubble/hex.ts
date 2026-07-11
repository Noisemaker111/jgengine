import { COLS, D, MAX_ROWS, R, ROW_H } from "./constants";

export interface Cell {
  readonly row: number;
  readonly col: number;
}

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function colsInRow(row: number): number {
  return row % 2 === 0 ? COLS : COLS - 1;
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < MAX_ROWS && col >= 0 && col < colsInRow(row);
}

export function cellX(row: number, col: number): number {
  return R + col * D + (row % 2 === 1 ? R : 0);
}

export function cellY(row: number): number {
  return R + row * ROW_H;
}

/**
 * The six hex neighbours of a cell in an odd-row-shifted offset lattice.
 * Even rows sit flush-left; odd rows shift right by one radius, so the
 * diagonal column offsets flip with row parity.
 */
export function neighbors(row: number, col: number): Cell[] {
  const even = row % 2 === 0;
  const raw: Cell[] = [
    { row, col: col - 1 },
    { row, col: col + 1 },
    { row: row - 1, col: even ? col - 1 : col },
    { row: row - 1, col: even ? col : col + 1 },
    { row: row + 1, col: even ? col - 1 : col },
    { row: row + 1, col: even ? col : col + 1 },
  ];
  return raw.filter((c) => inBounds(c.row, c.col));
}

export function nearestCell(x: number, y: number): Cell {
  const approxRow = Math.round((y - R) / ROW_H);
  let best: Cell = { row: 0, col: 0 };
  let bestDist = Infinity;
  for (let r = approxRow - 1; r <= approxRow + 1; r += 1) {
    if (r < 0 || r >= MAX_ROWS) continue;
    const cols = colsInRow(r);
    for (let c = 0; c < cols; c += 1) {
      const dx = x - cellX(r, c);
      const dy = y - cellY(r);
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = { row: r, col: c };
      }
    }
  }
  return best;
}

export function nearestEmptyCell(grid: ReadonlyMap<string, unknown>, x: number, y: number): Cell | null {
  const approxRow = Math.round((y - R) / ROW_H);
  let best: Cell | null = null;
  let bestDist = Infinity;
  for (let r = approxRow - 1; r <= approxRow + 2; r += 1) {
    if (r < 0 || r >= MAX_ROWS) continue;
    const cols = colsInRow(r);
    for (let c = 0; c < cols; c += 1) {
      if (grid.has(cellKey(r, c))) continue;
      const dx = x - cellX(r, c);
      const dy = y - cellY(r);
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = { row: r, col: c };
      }
    }
  }
  return best;
}
