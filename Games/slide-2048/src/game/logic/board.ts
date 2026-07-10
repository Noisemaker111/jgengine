import { seededRng } from "@jgengine/core/random/rng";

export const SIZE = 4;
export const WIN_VALUE = 2048;
export const SPAWN_FOUR_PROBABILITY = 0.1;

export type Dir = "up" | "down" | "left" | "right";

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
  merged: boolean;
  isNew: boolean;
  anim: number;
}

export interface Cell {
  row: number;
  col: number;
}

export interface SlideResult {
  tiles: Tile[];
  moved: boolean;
  gained: number;
}

const VECTORS: Record<Dir, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function traversalRows(dir: Dir, size: number): number[] {
  const rows = range(size);
  return dir === "down" ? rows.reverse() : rows;
}

function traversalCols(dir: Dir, size: number): number[] {
  const cols = range(size);
  return dir === "right" ? cols.reverse() : cols;
}

function emptyGrid(size: number): (Tile | null)[][] {
  return Array.from({ length: size }, () => new Array<Tile | null>(size).fill(null));
}

export function valueGrid(tiles: readonly Tile[], size: number = SIZE): number[][] {
  const grid: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (const t of tiles) grid[t.row]![t.col] = t.value;
  return grid;
}

export function emptyCells(tiles: readonly Tile[], size: number = SIZE): Cell[] {
  const occupied = new Set<number>();
  for (const t of tiles) occupied.add(t.row * size + t.col);
  const cells: Cell[] = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!occupied.has(r * size + c)) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/**
 * Slide every tile toward `dir`. Equal tiles merge once per slide — a tile
 * produced by a merge cannot merge again this move. Pure: returns fresh tiles
 * with updated positions plus the score gained and whether anything moved.
 * Does not spawn — the caller spawns only when `moved` is true.
 */
export function slide(tiles: readonly Tile[], dir: Dir, gen: number, size: number = SIZE): SlideResult {
  const grid = emptyGrid(size);
  for (const t of tiles) grid[t.row]![t.col] = { ...t, merged: false, isNew: false };

  const mergedAt: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const { dr, dc } = VECTORS[dir];
  let moved = false;
  let gained = 0;

  for (const r of traversalRows(dir, size)) {
    for (const c of traversalCols(dir, size)) {
      const tile = grid[r]![c];
      if (tile === null) continue;

      let fr = r;
      let fc = c;
      for (;;) {
        const nr = fr + dr;
        const nc = fc + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
        if (grid[nr]![nc] !== null) break;
        fr = nr;
        fc = nc;
      }

      const tr = fr + dr;
      const tc = fc + dc;
      const inBounds = tr >= 0 && tr < size && tc >= 0 && tc < size;
      const target = inBounds ? grid[tr]![tc] : null;

      if (target !== null && target.value === tile.value && !mergedAt[tr]![tc]) {
        grid[r]![c] = null;
        grid[tr]![tc] = { ...tile, value: tile.value * 2, row: tr, col: tc, merged: true, isNew: false, anim: gen };
        mergedAt[tr]![tc] = true;
        gained += tile.value * 2;
        moved = true;
      } else if (fr !== r || fc !== c) {
        grid[r]![c] = null;
        grid[fr]![fc] = { ...tile, row: fr, col: fc };
        moved = true;
      }
    }
  }

  const out: Tile[] = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const t = grid[r]![c];
      if (t !== null) out.push(t);
    }
  }
  return { tiles: out, moved, gained };
}

/** Deterministic spawn: a fresh seeded stream per spawn index picks the cell then a 2 (90%) or 4 (10%). */
export function spawnTile(
  tiles: readonly Tile[],
  spawnCount: number,
  seed: string,
  nextId: number,
  gen: number,
  size: number = SIZE,
): Tile | null {
  const cells = emptyCells(tiles, size);
  if (cells.length === 0) return null;
  const rng = seededRng(`${seed}#${spawnCount}`);
  const cell = cells[Math.floor(rng() * cells.length)]!;
  const value = rng() < SPAWN_FOUR_PROBABILITY ? 4 : 2;
  return { id: nextId, value, row: cell.row, col: cell.col, merged: false, isNew: true, anim: gen };
}

export function canMove(tiles: readonly Tile[], size: number = SIZE): boolean {
  if (emptyCells(tiles, size).length > 0) return true;
  const grid = valueGrid(tiles, size);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const v = grid[r]![c];
      if (c + 1 < size && grid[r]![c + 1] === v) return true;
      if (r + 1 < size && grid[r + 1]![c] === v) return true;
    }
  }
  return false;
}

export function isGameOver(tiles: readonly Tile[], size: number = SIZE): boolean {
  return !canMove(tiles, size);
}

export function hasWon(tiles: readonly Tile[]): boolean {
  return tiles.some((t) => t.value >= WIN_VALUE);
}
