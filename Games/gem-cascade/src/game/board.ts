import {
  cellAt,
  collapseColumns,
  createCellGrid,
  findRuns,
  withCells,
  type CellGrid,
  type CellRun,
} from "@jgengine/core/puzzle/cellGrid";

import { GEM_COUNT } from "./gems";

export const BOARD_SIZE = 8;
export const GEM_KINDS = GEM_COUNT;

export interface Gem {
  readonly id: number;
  readonly kind: number;
}

export type Board = CellGrid<Gem>;

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface Move {
  readonly from: Cell;
  readonly to: Cell;
}

let gemSerial = 0;

export function createGem(kind: number): Gem {
  gemSerial += 1;
  return { id: gemSerial, kind };
}

const sameKind = (a: Gem, b: Gem): boolean => a.kind === b.kind;

export function gemAt(board: Board, x: number, y: number): Gem | null {
  return cellAt(board, x, y);
}

/** Every horizontal + vertical run of 3 or more equal-kind gems. */
export function matchesOf(board: Board): CellRun<Gem>[] {
  return findRuns(board, 3, sameKind);
}

export function hasMatch(board: Board): boolean {
  return matchesOf(board).length > 0;
}

export function areAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function swapped(board: Board, a: Cell, b: Cell): Board {
  const ga = cellAt(board, a.x, a.y);
  const gb = cellAt(board, b.x, b.y);
  return withCells(board, [
    { x: a.x, y: a.y, value: gb },
    { x: b.x, y: b.y, value: ga },
  ]);
}

/** Blank out the matched cells (match-3 clears cells, never whole rows). */
export function clearCells(board: Board, cells: readonly Cell[]): Board {
  return withCells(
    board,
    cells.map((c) => ({ x: c.x, y: c.y, value: null as Gem | null })),
  );
}

/** Gravity + refill: survivors fall, fresh gems drop into the vacated top cells. */
export function collapseAndRefill(board: Board, rng: () => number, kinds = GEM_KINDS): Board {
  const collapsed = collapseColumns(board);
  const refill: { x: number; y: number; value: Gem }[] = [];
  for (let x = 0; x < collapsed.width; x += 1) {
    for (let y = 0; y < collapsed.height; y += 1) {
      if (cellAt(collapsed, x, y) === null) {
        refill.push({ x, y, value: createGem(Math.floor(rng() * kinds)) });
      }
    }
  }
  return withCells(collapsed, refill);
}

export function uniqueCells(runs: readonly CellRun<Gem>[]): Cell[] {
  const seen = new Set<string>();
  const cells: Cell[] = [];
  for (const run of runs) {
    for (const c of run.cells) {
      const key = `${c.x},${c.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push({ x: c.x, y: c.y });
    }
  }
  return cells;
}

/** First swap (right or down) that produces a run — the hint, and the legal-move probe. */
export function findFirstMove(board: Board): Move | null {
  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      if (x + 1 < board.width) {
        const move: Move = { from: { x, y }, to: { x: x + 1, y } };
        if (hasMatch(swapped(board, move.from, move.to))) return move;
      }
      if (y + 1 < board.height) {
        const move: Move = { from: { x, y }, to: { x, y: y + 1 } };
        if (hasMatch(swapped(board, move.from, move.to))) return move;
      }
    }
  }
  return null;
}

export function hasLegalMove(board: Board): boolean {
  return findFirstMove(board) !== null;
}

function pickKind(kinds: number, banned: ReadonlySet<number>, rng: () => number): number {
  let k = Math.floor(rng() * kinds);
  for (let i = 0; i < kinds && banned.has(k); i += 1) k = (k + 1) % kinds;
  return k;
}

function boardFromKinds(kinds: readonly number[], size: number): Board {
  const entries: { x: number; y: number; value: Gem }[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      entries.push({ x, y, value: createGem(kinds[y * size + x]!) });
    }
  }
  return withCells(createCellGrid<Gem>(size, size), entries);
}

/**
 * A fresh board that is guaranteed to contain no pre-made run and at least one
 * legal move. The fill bans any kind that would complete a run of three with
 * the two cells to the left or above, so no attempt ever starts with a match;
 * it retries only until one has a playable move (attempt 0 nearly always does).
 */
export function generateBoard(rng: () => number, size = BOARD_SIZE, kinds = GEM_KINDS): Board {
  let last: Board | null = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const grid = new Array<number>(size * size);
    const at = (x: number, y: number): number | null =>
      x < 0 || y < 0 || x >= size || y >= size ? null : (grid[y * size + x] ?? null);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const banned = new Set<number>();
        const l1 = at(x - 1, y);
        if (l1 !== null && l1 === at(x - 2, y)) banned.add(l1);
        const u1 = at(x, y - 1);
        if (u1 !== null && u1 === at(x, y - 2)) banned.add(u1);
        grid[y * size + x] = pickKind(kinds, banned, rng);
      }
    }
    const board = boardFromKinds(grid, size);
    last = board;
    if (!hasMatch(board) && hasLegalMove(board)) return board;
  }
  return last ?? boardFromKinds(new Array<number>(size * size).fill(0), size);
}

/** Rearrange the same gem multiset into a match-free, still-playable board. */
export function reshuffle(board: Board, rng: () => number, kinds = GEM_KINDS): Board {
  const kindList: number[] = [];
  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const g = cellAt(board, x, y);
      if (g !== null) kindList.push(g.kind);
    }
  }
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const shuffled = kindList.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    const next = boardFromKinds(shuffled, board.width);
    if (!hasMatch(next) && hasLegalMove(next)) return next;
  }
  return generateBoard(rng, board.width, kinds);
}

export const BASE_GEM_POINTS = 10;

/** Bonus for runs longer than three (four → +20, five → +40, …). */
export function runLengthBonus(length: number): number {
  return length <= 3 ? 0 : (length - 3) * 20;
}

export interface CascadeScore {
  readonly cleared: number;
  readonly points: number;
  readonly multiplier: number;
}

/** Score one cascade step: base per gem + long-run bonus, all times the chain multiplier (×1, ×2, ×3…). */
export function scoreCascade(runs: readonly CellRun<Gem>[], cascade: number): CascadeScore {
  const cleared = uniqueCells(runs).length;
  let base = cleared * BASE_GEM_POINTS;
  for (const run of runs) base += runLengthBonus(run.cells.length);
  const multiplier = Math.max(1, cascade);
  return { cleared, points: base * multiplier, multiplier };
}

export interface ResolveResult {
  readonly board: Board;
  readonly cascades: number;
  readonly totalCleared: number;
  readonly totalScore: number;
}

/**
 * Resolve every chained cascade from a board that already contains a match,
 * returning the settled (match-free) board plus totals. Pure — the store shares
 * these same step functions across its animated phases.
 */
export function resolveMatches(board: Board, rng: () => number, kinds = GEM_KINDS): ResolveResult {
  let current = board;
  let cascades = 0;
  let totalCleared = 0;
  let totalScore = 0;
  for (let guard = 0; guard < 10000; guard += 1) {
    const runs = matchesOf(current);
    if (runs.length === 0) break;
    cascades += 1;
    const score = scoreCascade(runs, cascades);
    totalCleared += score.cleared;
    totalScore += score.points;
    current = clearCells(current, uniqueCells(runs));
    current = collapseAndRefill(current, rng, kinds);
  }
  return { board: current, cascades, totalCleared, totalScore };
}
