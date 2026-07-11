import { seededRng } from "@jgengine/core/random/rng";

import { type Difficulty } from "./difficulty";
import { generatePuzzle } from "./generator";
import { CELLS, PEERS, UNITS, candidateList, colOf, indexOf, rowOf, toggleNoteBit } from "./grid";

export type BoardStatus = "playing" | "won";

export interface Board {
  difficulty: Difficulty;
  seed: string;
  isDaily: boolean;
  given: number[];
  solution: number[];
  values: number[];
  notes: number[];
  selected: number | null;
  status: BoardStatus;
  started: boolean;
  elapsedMs: number;
  hintsUsed: number;
}

export function createBoard(difficulty: Difficulty, seed: string, isDaily = false): Board {
  const generated = generatePuzzle(difficulty, seed);
  return {
    difficulty,
    seed,
    isDaily,
    given: generated.puzzle,
    solution: generated.solution,
    values: generated.puzzle.slice(),
    notes: new Array<number>(CELLS).fill(0),
    selected: null,
    status: "playing",
    started: false,
    elapsedMs: 0,
    hintsUsed: 0,
  };
}

export function isGiven(board: Board, i: number): boolean {
  return board.given[i] !== 0;
}

function clone(board: Board): Board {
  return { ...board, values: board.values.slice(), notes: board.notes.slice() };
}

function settleWin(board: Board): Board {
  for (let i = 0; i < CELLS; i += 1) {
    if (board.values[i] !== board.solution[i]) return board;
  }
  return board.status === "won" ? board : { ...board, status: "won" };
}

export function selectCell(board: Board, i: number): Board {
  if (i < 0 || i >= CELLS || board.selected === i) return board;
  return { ...board, selected: i };
}

export function moveSelection(board: Board, dRow: number, dCol: number): Board {
  const cur = board.selected ?? 40;
  const r = Math.max(0, Math.min(8, rowOf(cur) + dRow));
  const c = Math.max(0, Math.min(8, colOf(cur) + dCol));
  return selectCell(board, indexOf(r, c));
}

/** Place `digit` at `i`; re-placing the same digit clears it. Auto-removes that digit from peer notes. */
export function placeDigit(board: Board, i: number, digit: number): Board {
  if (board.status !== "playing" || i < 0 || i >= CELLS || isGiven(board, i) || digit < 1 || digit > 9) return board;
  const next = clone(board);
  next.started = true;
  if (next.values[i] === digit) {
    next.values[i] = 0;
    return next;
  }
  next.values[i] = digit;
  next.notes[i] = 0;
  const bit = 1 << digit;
  for (const p of PEERS[i]) next.notes[p] = next.notes[p] & ~bit;
  return settleWin(next);
}

export function toggleNote(board: Board, i: number, digit: number): Board {
  if (board.status !== "playing" || isGiven(board, i) || board.values[i] !== 0 || digit < 1 || digit > 9) return board;
  const next = clone(board);
  next.started = true;
  next.notes[i] = toggleNoteBit(next.notes[i], digit);
  return next;
}

export function eraseCell(board: Board, i: number): Board {
  if (board.status !== "playing" || isGiven(board, i) || (board.values[i] === 0 && board.notes[i] === 0)) return board;
  const next = clone(board);
  next.started = true;
  next.values[i] = 0;
  next.notes[i] = 0;
  return next;
}

export function hintCell(board: Board, i: number): Board {
  if (board.status !== "playing" || i < 0 || i >= CELLS || isGiven(board, i) || board.values[i] === board.solution[i]) {
    return board;
  }
  const next = clone(board);
  next.started = true;
  const d = next.solution[i];
  next.values[i] = d;
  next.notes[i] = 0;
  next.hintsUsed += 1;
  const bit = 1 << d;
  for (const p of PEERS[i]) next.notes[p] = next.notes[p] & ~bit;
  return settleWin(next);
}

/** A deterministic empty cell for a hint when nothing suitable is selected. */
export function pickRandomEmpty(board: Board): number | null {
  const empties: number[] = [];
  for (let i = 0; i < CELLS; i += 1) if (board.values[i] === 0) empties.push(i);
  if (empties.length === 0) return null;
  const rng = seededRng(`${board.seed}:hint:${board.hintsUsed}`);
  return empties[Math.floor(rng() * empties.length)];
}

/** Indices duplicated within any row, column, or box (only filled cells). */
export function conflictCells(board: Board): Set<number> {
  const bad = new Set<number>();
  for (const unit of UNITS) {
    const byDigit = new Map<number, number[]>();
    for (const c of unit) {
      const v = board.values[c];
      if (v === 0) continue;
      const arr = byDigit.get(v);
      if (arr) arr.push(c);
      else byDigit.set(v, [c]);
    }
    for (const cells of byDigit.values()) {
      if (cells.length > 1) for (const c of cells) bad.add(c);
    }
  }
  return bad;
}

/** Filled, non-given cells whose value disagrees with the solution. */
export function errorCells(board: Board): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < CELLS; i += 1) {
    const v = board.values[i];
    if (v !== 0 && !isGiven(board, i) && v !== board.solution[i]) s.add(i);
  }
  return s;
}

export function candidateDigits(board: Board, i: number): number[] {
  return candidateList(board.values, i);
}

/** Count of each digit already placed on the board (index 1..9). */
export function digitCounts(board: Board): number[] {
  const counts = new Array<number>(10).fill(0);
  for (let i = 0; i < CELLS; i += 1) {
    const v = board.values[i];
    if (v !== 0) counts[v] += 1;
  }
  return counts;
}

export function filledCount(board: Board): number {
  let n = 0;
  for (let i = 0; i < CELLS; i += 1) if (board.values[i] !== 0) n += 1;
  return n;
}

export function elapsedSeconds(board: Board): number {
  return Math.floor(board.elapsedMs / 1000);
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
