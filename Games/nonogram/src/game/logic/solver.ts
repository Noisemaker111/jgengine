import { colCluesOf, rowCluesOf } from "./clues";
import type { Clue, Grid } from "./types";

export const UNKNOWN = 0;
export const FILLED = 1;
export const EMPTY = 2;
export type LineCell = typeof UNKNOWN | typeof FILLED | typeof EMPTY;

// Intersect every clue-consistent arrangement of one line: a cell is forced
// FILLED if it is filled in all arrangements, EMPTY if empty in all, else left
// as the caller's current value. Returns null on contradiction (no arrangement).
export function solveLine(line: readonly LineCell[], clue: Clue): LineCell[] | null {
  const n = line.length;
  const everFilled = new Array<boolean>(n).fill(false);
  const everEmpty = new Array<boolean>(n).fill(false);
  const current = new Array<boolean>(n).fill(false);
  let arrangements = 0;

  const record = (): void => {
    arrangements += 1;
    for (let k = 0; k < n; k += 1) {
      if (current[k]) everFilled[k] = true;
      else everEmpty[k] = true;
    }
  };

  const place = (pos: number, clueIndex: number): void => {
    if (clueIndex === clue.length) {
      for (let k = pos; k < n; k += 1) if (line[k] === FILLED) return;
      record();
      return;
    }
    const len = clue[clueIndex];
    for (let start = pos; start + len <= n; start += 1) {
      let gapHasFilled = false;
      for (let k = pos; k < start; k += 1)
        if (line[k] === FILLED) {
          gapHasFilled = true;
          break;
        }
      let runOk = true;
      for (let k = start; k < start + len; k += 1)
        if (line[k] === EMPTY) {
          runOk = false;
          break;
        }
      const separatorOk = start + len >= n || line[start + len] !== FILLED;
      if (!gapHasFilled && runOk && separatorOk) {
        for (let k = start; k < start + len; k += 1) current[k] = true;
        place(start + len + 1, clueIndex + 1);
        for (let k = start; k < start + len; k += 1) current[k] = false;
      }
      if (line[start] === FILLED) break;
    }
  };

  place(0, 0);
  if (arrangements === 0) return null;

  const out = line.slice();
  for (let k = 0; k < n; k += 1) {
    if (everFilled[k] && !everEmpty[k]) out[k] = FILLED;
    else if (everEmpty[k] && !everFilled[k]) out[k] = EMPTY;
  }
  return out;
}

export interface LineSolveResult {
  readonly solved: boolean;
  readonly board: LineCell[][];
}

// A puzzle is line-solvable iff iterated per-row/column constraint propagation
// alone reaches a fully-determined board (no guessing).
export function lineSolve(solution: Grid): LineSolveResult {
  const height = solution.length;
  const width = solution[0]?.length ?? 0;
  const rowClues = rowCluesOf(solution);
  const colClues = colCluesOf(solution);
  const board: LineCell[][] = Array.from({ length: height }, () =>
    new Array<LineCell>(width).fill(UNKNOWN),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < height; r += 1) {
      const solved = solveLine(board[r], rowClues[r]);
      if (solved === null) return { solved: false, board };
      for (let c = 0; c < width; c += 1)
        if (solved[c] !== board[r][c]) {
          board[r][c] = solved[c];
          changed = true;
        }
    }
    for (let c = 0; c < width; c += 1) {
      const column: LineCell[] = board.map((row) => row[c]);
      const solved = solveLine(column, colClues[c]);
      if (solved === null) return { solved: false, board };
      for (let r = 0; r < height; r += 1)
        if (solved[r] !== board[r][c]) {
          board[r][c] = solved[r];
          changed = true;
        }
    }
  }

  const solved = board.every((row) => row.every((cell) => cell !== UNKNOWN));
  return { solved, board };
}
