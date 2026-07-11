import type { Clue, Grid } from "./types";

export function runsOf(line: readonly boolean[]): number[] {
  const runs: number[] = [];
  let run = 0;
  for (const cell of line) {
    if (cell) {
      run += 1;
    } else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs;
}

export function rowCluesOf(solution: Grid): Clue[] {
  return solution.map((row) => runsOf(row));
}

export function colCluesOf(solution: Grid): Clue[] {
  const width = solution[0]?.length ?? 0;
  const clues: Clue[] = [];
  for (let c = 0; c < width; c += 1) {
    clues.push(runsOf(solution.map((row) => row[c] ?? false)));
  }
  return clues;
}

export function cluesEqual(a: Clue, b: Clue): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function clueSum(clue: Clue): number {
  let total = 0;
  for (const n of clue) total += n;
  return total;
}
