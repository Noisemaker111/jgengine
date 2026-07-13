/** A cell in a nonogram line: not yet determined, painted, or ruled out. */
export type NonogramCell = "unknown" | "filled" | "empty";

/** A line clue — the lengths of its consecutive filled runs, in order. */
export type NonogramClue = readonly number[];

/** A solved grid, row-major; `true` is a filled cell. */
export type NonogramSolution = readonly (readonly boolean[])[];

/** Run lengths of the filled cells in a boolean line — the clue a solved line yields. */
export function runLengths(line: readonly boolean[]): number[] {
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

/** Row and column clues derived from a solution grid — the puzzle a solved board poses. */
export function deriveClues(solution: NonogramSolution): { rows: number[][]; cols: number[][] } {
  const width = solution[0]?.length ?? 0;
  const rows = solution.map((row) => runLengths(row));
  const cols: number[][] = [];
  for (let c = 0; c < width; c += 1) cols.push(runLengths(solution.map((row) => row[c] ?? false)));
  return { rows, cols };
}

/**
 * Constraint-propagate one line against its `clue`: intersect every clue-consistent arrangement, forcing a
 * cell `filled` when it is filled in all of them and `empty` when empty in all, leaving the rest `unknown`.
 * Returns the tightened line, or `null` on contradiction (no arrangement fits the current cells) — the
 * per-line deduction step at the heart of every nonogram/picross solver.
 */
export function solveLine(line: readonly NonogramCell[], clue: NonogramClue): NonogramCell[] | null {
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
      for (let k = pos; k < n; k += 1) if (line[k] === "filled") return;
      record();
      return;
    }
    const len = clue[clueIndex]!;
    for (let start = pos; start + len <= n; start += 1) {
      let gapHasFilled = false;
      for (let k = pos; k < start; k += 1)
        if (line[k] === "filled") {
          gapHasFilled = true;
          break;
        }
      let runOk = true;
      for (let k = start; k < start + len; k += 1)
        if (line[k] === "empty") {
          runOk = false;
          break;
        }
      const separatorOk = start + len >= n || line[start + len] !== "filled";
      if (!gapHasFilled && runOk && separatorOk) {
        for (let k = start; k < start + len; k += 1) current[k] = true;
        place(start + len + 1, clueIndex + 1);
        for (let k = start; k < start + len; k += 1) current[k] = false;
      }
      if (line[start] === "filled") break;
    }
  };

  place(0, 0);
  if (arrangements === 0) return null;

  const out = line.slice();
  for (let k = 0; k < n; k += 1) {
    if (everFilled[k] && !everEmpty[k]) out[k] = "filled";
    else if (everEmpty[k] && !everFilled[k]) out[k] = "empty";
  }
  return out;
}

/** Outcome of {@link solveNonogram}: the deduced board and whether propagation fully determined it. */
export interface NonogramSolveResult {
  /** True when every cell is decided by line propagation alone (the puzzle is uniquely line-solvable). */
  solved: boolean;
  /** The board after propagation stalls — `unknown` cells remain when solving needs guessing. */
  board: NonogramCell[][];
}

/**
 * Solve a nonogram from its row and column clues by iterated line propagation until the board stops
 * changing. `solved` is true iff the board is fully determined without guessing — the standard test for
 * whether a nonogram is fair. Returns `solved: false` with a partial board on contradiction or ambiguity.
 */
export function solveNonogram(rows: readonly NonogramClue[], cols: readonly NonogramClue[]): NonogramSolveResult {
  const height = rows.length;
  const width = cols.length;
  const board: NonogramCell[][] = Array.from({ length: height }, () =>
    new Array<NonogramCell>(width).fill("unknown"),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < height; r += 1) {
      const solved = solveLine(board[r]!, rows[r]!);
      if (solved === null) return { solved: false, board };
      for (let c = 0; c < width; c += 1)
        if (solved[c] !== board[r]![c]) {
          board[r]![c] = solved[c]!;
          changed = true;
        }
    }
    for (let c = 0; c < width; c += 1) {
      const column: NonogramCell[] = board.map((row) => row[c]!);
      const solved = solveLine(column, cols[c]!);
      if (solved === null) return { solved: false, board };
      for (let r = 0; r < height; r += 1)
        if (solved[r] !== board[r]![c]) {
          board[r]![c] = solved[r]!;
          changed = true;
        }
    }
  }

  const solved = board.every((row) => row.every((cell) => cell !== "unknown"));
  return { solved, board };
}
