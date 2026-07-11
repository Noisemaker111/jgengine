import { CELLS, UNITS, candidateList, candidatesMask } from "./grid";

interface EmptyCell {
  index: number;
  cands: number[];
}

/** Pick the empty cell with the fewest candidates (MRV) to keep the search shallow. */
function mrvCell(grid: readonly number[]): EmptyCell | null {
  let best = -1;
  let bestCands: number[] | null = null;
  for (let i = 0; i < CELLS; i += 1) {
    if (grid[i] !== 0) continue;
    const cands = candidateList(grid, i);
    if (bestCands === null || cands.length < bestCands.length) {
      best = i;
      bestCands = cands;
      if (cands.length <= 1) break;
    }
  }
  return best === -1 ? null : { index: best, cands: bestCands as number[] };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Count solutions of `puzzle` up to `limit` (stops early). 1 proves uniqueness. */
export function countSolutions(puzzle: readonly number[], limit = 2): number {
  const grid = puzzle.slice();
  let count = 0;
  const rec = (): void => {
    if (count >= limit) return;
    const cell = mrvCell(grid);
    if (cell === null) {
      count += 1;
      return;
    }
    if (cell.cands.length === 0) return;
    for (const d of cell.cands) {
      grid[cell.index] = d;
      rec();
      grid[cell.index] = 0;
      if (count >= limit) return;
    }
  };
  rec();
  return count;
}

/** Deterministic full solve; returns the first solution or null if unsolvable. */
export function solve(puzzle: readonly number[]): number[] | null {
  const grid = puzzle.slice();
  const rec = (): boolean => {
    const cell = mrvCell(grid);
    if (cell === null) return true;
    if (cell.cands.length === 0) return false;
    for (const d of cell.cands) {
      grid[cell.index] = d;
      if (rec()) return true;
      grid[cell.index] = 0;
    }
    return false;
  };
  return rec() ? grid : null;
}

/** A complete, valid grid produced by seeded randomized backtracking. */
export function generateSolvedGrid(rng: () => number): number[] {
  const grid = new Array<number>(CELLS).fill(0);
  const rec = (): boolean => {
    const cell = mrvCell(grid);
    if (cell === null) return true;
    if (cell.cands.length === 0) return false;
    for (const d of shuffle(cell.cands.slice(), rng)) {
      grid[cell.index] = d;
      if (rec()) return true;
      grid[cell.index] = 0;
    }
    return false;
  };
  rec();
  return grid;
}

/**
 * Solve using only human "single" techniques: naked singles always, hidden
 * singles when `allowHidden`. Used to grade a puzzle's technique tier without
 * any guessing. Returns whether it fully resolved plus the partial grid.
 */
export function logicalSolve(puzzle: readonly number[], allowHidden: boolean): { solved: boolean; grid: number[] } {
  const grid = puzzle.slice();
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < CELLS; i += 1) {
      if (grid[i] !== 0) continue;
      const cands = candidateList(grid, i);
      if (cands.length === 0) return { solved: false, grid };
      if (cands.length === 1) {
        grid[i] = cands[0];
        progress = true;
      }
    }
    if (progress) continue;
    if (allowHidden) {
      for (const unit of UNITS) {
        for (let d = 1; d <= 9; d += 1) {
          let present = false;
          for (const c of unit) {
            if (grid[c] === d) {
              present = true;
              break;
            }
          }
          if (present) continue;
          let spot = -1;
          let count = 0;
          for (const c of unit) {
            if (grid[c] === 0 && candidatesMask(grid, c) & (1 << d)) {
              spot = c;
              count += 1;
              if (count > 1) break;
            }
          }
          if (count === 1) {
            grid[spot] = d;
            progress = true;
          }
        }
      }
    }
  }
  return { solved: grid.every((v) => v !== 0), grid };
}
