import { seededRng } from "@jgengine/core/random/rng";

export type StandardDifficulty = "beginner" | "intermediate" | "expert";
export type Difficulty = StandardDifficulty | "custom";
export type MarkState = "none" | "flag" | "question";
export type GameStatus = "ready" | "playing" | "won" | "lost";

export interface BoardConfig {
  cols: number;
  rows: number;
  mines: number;
}

export const DIFFICULTIES: Record<StandardDifficulty, BoardConfig> = {
  beginner: { cols: 9, rows: 9, mines: 10 },
  intermediate: { cols: 16, rows: 16, mines: 40 },
  expert: { cols: 30, rows: 16, mines: 99 },
};

export const CUSTOM_LIMITS = {
  cols: { min: 5, max: 40 },
  rows: { min: 5, max: 30 },
} as const;

export interface Cell {
  mine: boolean;
  revealed: boolean;
  mark: MarkState;
  adjacent: number;
}

export interface Board {
  cols: number;
  rows: number;
  mines: number;
  difficulty: Difficulty;
  seed: string;
  isDaily: boolean;
  cells: Cell[];
  status: GameStatus;
  struckIndex: number | null;
  elapsedMs: number;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function normalizeConfig(cols: number, rows: number, mines: number): BoardConfig {
  const c = clamp(cols, CUSTOM_LIMITS.cols.min, CUSTOM_LIMITS.cols.max);
  const r = clamp(rows, CUSTOM_LIMITS.rows.min, CUSTOM_LIMITS.rows.max);
  const maxMines = Math.max(1, c * r - 9);
  return { cols: c, rows: r, mines: clamp(mines, 1, maxMines) };
}

export function idx(cols: number, col: number, row: number): number {
  return row * cols + col;
}

export function colOf(cols: number, index: number): number {
  return index % cols;
}

export function rowOf(cols: number, index: number): number {
  return Math.floor(index / cols);
}

export function inBounds(cols: number, rows: number, col: number, row: number): boolean {
  return col >= 0 && col < cols && row >= 0 && row < rows;
}

export function neighbors(cols: number, rows: number, index: number): number[] {
  const c = colOf(cols, index);
  const r = rowOf(cols, index);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dc === 0 && dr === 0) continue;
      const nc = c + dc;
      const nr = r + dr;
      if (inBounds(cols, rows, nc, nr)) out.push(idx(cols, nc, nr));
    }
  }
  return out;
}

function shuffledIndices(total: number, rng: () => number): number[] {
  const order: number[] = [];
  for (let i = 0; i < total; i += 1) order.push(i);
  for (let i = total - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

function computeAdjacency(cells: Cell[], cols: number, rows: number): void {
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i]!.mine) {
      cells[i]!.adjacent = 0;
      continue;
    }
    let count = 0;
    for (const n of neighbors(cols, rows, i)) {
      if (cells[n]!.mine) count += 1;
    }
    cells[i]!.adjacent = count;
  }
}

export function createBoard(
  config: BoardConfig,
  seed: string,
  difficulty: Difficulty,
  isDaily = false,
): Board {
  const total = config.cols * config.rows;
  const cells: Cell[] = [];
  for (let i = 0; i < total; i += 1) {
    cells.push({ mine: false, revealed: false, mark: "none", adjacent: 0 });
  }
  const mineCount = Math.min(config.mines, Math.max(0, total - 9));
  const order = shuffledIndices(total, seededRng(seed));
  for (let i = 0; i < mineCount; i += 1) cells[order[i]!]!.mine = true;
  computeAdjacency(cells, config.cols, config.rows);
  return {
    cols: config.cols,
    rows: config.rows,
    mines: mineCount,
    difficulty,
    seed,
    isDaily,
    cells,
    status: "ready",
    struckIndex: null,
    elapsedMs: 0,
  };
}

function cloneBoard(board: Board): Board {
  return {
    ...board,
    cells: board.cells.map((cell) => ({ ...cell })),
  };
}

function ensureSafeFirstClick(board: Board, index: number): void {
  const safe = new Set<number>([index, ...neighbors(board.cols, board.rows, index)]);
  const trapped: number[] = [];
  for (const i of safe) {
    if (board.cells[i]!.mine) trapped.push(i);
  }
  if (trapped.length === 0) return;
  const free: number[] = [];
  for (let i = 0; i < board.cells.length; i += 1) {
    if (!board.cells[i]!.mine && !safe.has(i)) free.push(i);
  }
  let f = 0;
  for (const from of trapped) {
    if (f >= free.length) break;
    board.cells[from]!.mine = false;
    board.cells[free[f]!]!.mine = true;
    f += 1;
  }
  computeAdjacency(board.cells, board.cols, board.rows);
}

function floodReveal(board: Board, start: number): void {
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop()!;
    const cell = board.cells[i]!;
    if (cell.revealed || cell.mine || cell.mark === "flag") continue;
    cell.revealed = true;
    if (cell.adjacent === 0) {
      for (const n of neighbors(board.cols, board.rows, i)) {
        const next = board.cells[n]!;
        if (!next.revealed && !next.mine && next.mark !== "flag") stack.push(n);
      }
    }
  }
}

function revealAllMines(board: Board): void {
  for (const cell of board.cells) {
    if (cell.mine) cell.revealed = true;
  }
}

function flagAllMines(board: Board): void {
  for (const cell of board.cells) {
    if (cell.mine) cell.mark = "flag";
  }
}

export function isSolved(board: Board): boolean {
  return board.cells.every((cell) => cell.mine || cell.revealed);
}

export function reveal(board: Board, index: number): Board {
  if (board.status === "won" || board.status === "lost") return board;
  const original = board.cells[index]!;
  if (original.revealed || original.mark === "flag") return board;
  const next = cloneBoard(board);
  if (next.status === "ready") {
    ensureSafeFirstClick(next, index);
    next.status = "playing";
  }
  const cell = next.cells[index]!;
  if (cell.mine) {
    next.status = "lost";
    next.struckIndex = index;
    revealAllMines(next);
    return next;
  }
  floodReveal(next, index);
  if (isSolved(next)) {
    next.status = "won";
    flagAllMines(next);
  }
  return next;
}

export function cycleMark(board: Board, index: number, allowQuestion: boolean): Board {
  if (board.status === "won" || board.status === "lost") return board;
  if (board.cells[index]!.revealed) return board;
  const next = cloneBoard(board);
  const cell = next.cells[index]!;
  if (cell.mark === "none") cell.mark = "flag";
  else if (cell.mark === "flag") cell.mark = allowQuestion ? "question" : "none";
  else cell.mark = "none";
  return next;
}

export function chord(board: Board, index: number): Board {
  if (board.status !== "playing") return board;
  const cell = board.cells[index]!;
  if (!cell.revealed || cell.adjacent === 0) return board;
  const around = neighbors(board.cols, board.rows, index);
  let flagged = 0;
  for (const n of around) {
    if (board.cells[n]!.mark === "flag") flagged += 1;
  }
  if (flagged !== cell.adjacent) return board;

  const next = cloneBoard(board);
  let struck: number | null = null;
  for (const n of around) {
    const target = next.cells[n]!;
    if (target.mark === "flag" || target.revealed) continue;
    if (target.mine) {
      struck = n;
      break;
    }
  }
  if (struck !== null) {
    next.status = "lost";
    next.struckIndex = struck;
    revealAllMines(next);
    return next;
  }
  for (const n of around) {
    const target = next.cells[n]!;
    if (target.mark === "flag" || target.revealed) continue;
    floodReveal(next, n);
  }
  if (isSolved(next)) {
    next.status = "won";
    flagAllMines(next);
  }
  return next;
}

export function flagCount(board: Board): number {
  let count = 0;
  for (const cell of board.cells) {
    if (cell.mark === "flag") count += 1;
  }
  return count;
}

export function minesRemaining(board: Board): number {
  return board.mines - flagCount(board);
}

export function elapsedSeconds(board: Board): number {
  return Math.min(999, Math.floor(board.elapsedMs / 1000));
}

export function isStandard(difficulty: Difficulty): difficulty is StandardDifficulty {
  return difficulty === "beginner" || difficulty === "intermediate" || difficulty === "expert";
}
