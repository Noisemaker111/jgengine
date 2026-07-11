import { cellKey, neighbors, type Cell } from "./hex";

export interface PlacedBubble {
  readonly row: number;
  readonly col: number;
  readonly color: number;
}

export type Grid = Map<string, PlacedBubble>;

/** Connected same-colour group reachable from (row, col), including the origin. */
export function floodMatch(grid: Grid, row: number, col: number): Cell[] {
  const origin = grid.get(cellKey(row, col));
  if (origin === undefined) return [];
  const color = origin.color;
  const seen = new Set<string>([cellKey(row, col)]);
  const stack: Cell[] = [{ row, col }];
  const out: Cell[] = [];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    out.push(cur);
    for (const n of neighbors(cur.row, cur.col)) {
      const k = cellKey(n.row, n.col);
      if (seen.has(k)) continue;
      const b = grid.get(k);
      if (b !== undefined && b.color === color) {
        seen.add(k);
        stack.push(n);
      }
    }
  }
  return out;
}

/** Bubbles no longer connected to the ceiling (row 0) — they drop. */
export function findFloating(grid: Grid): Cell[] {
  const anchored = new Set<string>();
  const stack: Cell[] = [];
  for (const b of grid.values()) {
    if (b.row === 0) {
      const k = cellKey(0, b.col);
      if (!anchored.has(k)) {
        anchored.add(k);
        stack.push({ row: 0, col: b.col });
      }
    }
  }
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const n of neighbors(cur.row, cur.col)) {
      const k = cellKey(n.row, n.col);
      if (anchored.has(k)) continue;
      if (grid.has(k)) {
        anchored.add(k);
        stack.push(n);
      }
    }
  }
  const floating: Cell[] = [];
  for (const b of grid.values()) {
    if (!anchored.has(cellKey(b.row, b.col))) floating.push({ row: b.row, col: b.col });
  }
  return floating;
}
