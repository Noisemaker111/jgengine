export type NonogramCell = "unknown" | "filled" | "empty";

export type NonogramClue = readonly number[];

export type NonogramSolution = readonly (readonly boolean[])[];

/** @internal */
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

/** @internal */
export function deriveClues(solution: NonogramSolution): { rows: number[][]; cols: number[][] } {
  const width = solution[0]?.length ?? 0;
  const rows = solution.map((row) => runLengths(row));
  const cols: number[][] = [];
  for (let c = 0; c < width; c += 1) cols.push(runLengths(solution.map((row) => row[c] ?? false)));
  return { rows, cols };
}

/** @internal */
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

export interface NonogramSolveResult {
  solved: boolean;
  board: NonogramCell[][];
}

/** @internal */
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
