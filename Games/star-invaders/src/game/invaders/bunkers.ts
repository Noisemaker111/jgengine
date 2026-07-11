import {
  BUNKER_BLOCK,
  BUNKER_COLS,
  BUNKER_COUNT,
  BUNKER_ROWS,
  BUNKER_W,
  BUNKER_Y,
  FIELD_W,
} from "./constants";
import type { Rect } from "./geometry";

export type BunkerCells = boolean[][];

const BUNKER_SHAPE: readonly string[] = [
  "00111111100",
  "01111111110",
  "11111111111",
  "11111111111",
  "11111111111",
  "11111111111",
  "11110001111",
  "11100000111",
];

const BUNKER_EDGE = 18;
const BUNKER_GAP = (FIELD_W - 2 * BUNKER_EDGE - BUNKER_COUNT * BUNKER_W) / (BUNKER_COUNT - 1);

export function bunkerLeftX(index: number): number {
  return BUNKER_EDGE + index * (BUNKER_W + BUNKER_GAP);
}

export function createBunkerCells(): BunkerCells {
  const cells: BunkerCells = [];
  for (let r = 0; r < BUNKER_ROWS; r += 1) {
    const row: boolean[] = [];
    const shape = BUNKER_SHAPE[r]!;
    for (let col = 0; col < BUNKER_COLS; col += 1) row.push(shape[col] === "1");
    cells.push(row);
  }
  return cells;
}

export function cellSolid(cells: BunkerCells, col: number, row: number): boolean {
  if (row < 0 || row >= BUNKER_ROWS || col < 0 || col >= BUNKER_COLS) return false;
  return cells[row]![col]!;
}

export function cellRect(leftX: number, col: number, row: number): Rect {
  return { x: leftX + col * BUNKER_BLOCK, y: BUNKER_Y + row * BUNKER_BLOCK, w: BUNKER_BLOCK, h: BUNKER_BLOCK };
}

export function cellAtPoint(leftX: number, worldX: number, worldY: number): { col: number; row: number } | null {
  const col = Math.floor((worldX - leftX) / BUNKER_BLOCK);
  const row = Math.floor((worldY - BUNKER_Y) / BUNKER_BLOCK);
  if (col < 0 || col >= BUNKER_COLS || row < 0 || row >= BUNKER_ROWS) return null;
  return { col, row };
}

export function blastPattern(radius: number): readonly (readonly [number, number])[] {
  const offsets: [number, number][] = [];
  for (let dr = -radius; dr <= radius; dr += 1) {
    for (let dc = -radius; dc <= radius; dc += 1) {
      if (Math.abs(dr) + Math.abs(dc) <= radius) offsets.push([dc, dr]);
    }
  }
  return offsets;
}

export const BLAST_SHOT = blastPattern(1);
export const BLAST_BOMB = blastPattern(2);

export function erodeBunker(
  cells: BunkerCells,
  col: number,
  row: number,
  pattern: readonly (readonly [number, number])[],
): number {
  let removed = 0;
  for (const [dc, dr] of pattern) {
    const c = col + dc;
    const r = row + dr;
    if (r < 0 || r >= BUNKER_ROWS || c < 0 || c >= BUNKER_COLS) continue;
    if (cells[r]![c]) {
      cells[r]![c] = false;
      removed += 1;
    }
  }
  return removed;
}

export function anyCellSolid(cells: BunkerCells): boolean {
  for (const row of cells) for (const cell of row) if (cell) return true;
  return false;
}
