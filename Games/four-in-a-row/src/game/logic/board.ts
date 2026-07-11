export const COLS = 7;
export const ROWS = 6;
export const CONNECT = 4;

export type Player = 1 | 2;
export type Cell = 0 | Player;
export type Status = "playing" | "won" | "draw";

export interface Move {
  col: number;
  row: number;
  player: Player;
}

export interface Board {
  /** Row-major, index = row * COLS + col. Row 0 is the bottom of the grid. */
  cells: Cell[];
  /** Filled count per column (0..ROWS); the next disc lands at row === heights[col]. */
  heights: number[];
  current: Player;
  status: Status;
  winner: Player | null;
  /** Cell indices of the four (or more) in a row that ended the game. */
  winningLine: number[] | null;
  moves: Move[];
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], // horizontal
  [0, 1], // vertical
  [1, 1], // diagonal ↗
  [1, -1], // diagonal ↘
];

export function other(player: Player): Player {
  return player === 1 ? 2 : 1;
}

export function index(col: number, row: number): number {
  return row * COLS + col;
}

export function colOf(i: number): number {
  return i % COLS;
}

export function rowOf(i: number): number {
  return Math.floor(i / COLS);
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

export function createBoard(first: Player = 1): Board {
  return {
    cells: new Array<Cell>(COLS * ROWS).fill(0),
    heights: new Array<number>(COLS).fill(0),
    current: first,
    status: "playing",
    winner: null,
    winningLine: null,
    moves: [],
  };
}

export function legalColumns(board: Board): number[] {
  const out: number[] = [];
  for (let col = 0; col < COLS; col += 1) if (board.heights[col]! < ROWS) out.push(col);
  return out;
}

export function isColumnPlayable(board: Board, col: number): boolean {
  return col >= 0 && col < COLS && board.heights[col]! < ROWS;
}

export function landingRow(board: Board, col: number): number | null {
  if (col < 0 || col >= COLS) return null;
  const row = board.heights[col]!;
  return row < ROWS ? row : null;
}

/** The connected run of `player` discs through (col, row) along one axis, if it reaches CONNECT. */
function runThrough(cells: Cell[], col: number, row: number, player: Player, dc: number, dr: number): number[] | null {
  const line = [index(col, row)];
  for (const sign of [1, -1]) {
    let c = col + dc * sign;
    let r = row + dr * sign;
    while (inBounds(c, r) && cells[index(c, r)] === player) {
      line.push(index(c, r));
      c += dc * sign;
      r += dr * sign;
    }
  }
  return line.length >= CONNECT ? line : null;
}

/** Winning line created by a `player` disc sitting at (col, row), or null. */
export function winningLineFrom(cells: Cell[], col: number, row: number, player: Player): number[] | null {
  for (const [dc, dr] of DIRECTIONS) {
    const line = runThrough(cells, col, row, player, dc, dr);
    if (line !== null) return line;
  }
  return null;
}

/** Scan the whole grid for any four in a row (used by AI terminal checks and tests). */
export function findWinner(cells: Cell[]): { player: Player; line: number[] } | null {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = cells[index(col, row)]!;
      if (cell === 0) continue;
      const line = winningLineFrom(cells, col, row, cell);
      if (line !== null) return { player: cell, line };
    }
  }
  return null;
}

/** Would dropping `player` into `col` complete a four? (Turn-agnostic — used for win and block detection.) */
export function wouldWin(board: Board, col: number, player: Player): boolean {
  const row = landingRow(board, col);
  if (row === null) return false;
  const probe = board.cells.slice();
  probe[index(col, row)] = player;
  return winningLineFrom(probe, col, row, player) !== null;
}

/** Drop the current player's disc into `col`. Returns the next board, or null if illegal. */
export function drop(board: Board, col: number): Board | null {
  if (board.status !== "playing") return null;
  const row = landingRow(board, col);
  if (row === null) return null;

  const mover = board.current;
  const cells = board.cells.slice();
  const i = index(col, row);
  cells[i] = mover;
  const heights = board.heights.slice();
  heights[col] = row + 1;
  const moves = board.moves.concat({ col, row, player: mover });

  const line = winningLineFrom(cells, col, row, mover);
  if (line !== null) {
    return { cells, heights, current: mover, status: "won", winner: mover, winningLine: line, moves };
  }
  if (moves.length === COLS * ROWS) {
    return { cells, heights, current: mover, status: "draw", winner: null, winningLine: null, moves };
  }
  return { cells, heights, current: other(mover), status: "playing", winner: null, winningLine: null, moves };
}

/** Replay a move list from an empty board — the source of truth for undo. */
export function boardFromMoves(moves: readonly Move[], first: Player): Board {
  let board = createBoard(first);
  for (const move of moves) {
    const next = drop(board, move.col);
    if (next === null) break;
    board = next;
  }
  return board;
}

export function isDraw(board: Board): boolean {
  return board.status === "draw";
}
