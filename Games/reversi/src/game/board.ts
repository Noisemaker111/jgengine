export type Player = 1 | 2;
export type Disc = 0 | 1 | 2;
export type Board = readonly Disc[];

export const SIZE = 8;
export const CELLS = SIZE * SIZE;
export const DARK: Player = 1;
export const LIGHT: Player = 2;

const DIRS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

export function opponent(p: Player): Player {
  return p === DARK ? LIGHT : DARK;
}

export function rc(index: number): readonly [number, number] {
  return [Math.floor(index / SIZE), index % SIZE];
}

export function idx(row: number, col: number): number {
  return row * SIZE + col;
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

export function createBoard(): Disc[] {
  const b: Disc[] = new Array<Disc>(CELLS).fill(0);
  b[idx(3, 3)] = LIGHT;
  b[idx(3, 4)] = DARK;
  b[idx(4, 3)] = DARK;
  b[idx(4, 4)] = LIGHT;
  return b;
}

export interface Flip {
  readonly index: number;
  readonly step: number;
}

export function flipsAt(board: Board, player: Player, index: number): Flip[] {
  if (board[index] !== 0) return [];
  const foe = opponent(player);
  const [r, c] = rc(index);
  const out: Flip[] = [];
  for (const [dr, dc] of DIRS) {
    const line: number[] = [];
    let rr = r + dr;
    let cc = c + dc;
    while (inBounds(rr, cc) && board[idx(rr, cc)] === foe) {
      line.push(idx(rr, cc));
      rr += dr;
      cc += dc;
    }
    if (line.length > 0 && inBounds(rr, cc) && board[idx(rr, cc)] === player) {
      for (let i = 0; i < line.length; i++) out.push({ index: line[i], step: i + 1 });
    }
  }
  return out;
}

export function isLegal(board: Board, player: Player, index: number): boolean {
  return board[index] === 0 && flipsAt(board, player, index).length > 0;
}

export function legalMoves(board: Board, player: Player): number[] {
  const moves: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    if (board[i] === 0 && flipsAt(board, player, i).length > 0) moves.push(i);
  }
  return moves;
}

export function hasMove(board: Board, player: Player): boolean {
  for (let i = 0; i < CELLS; i++) {
    if (board[i] === 0 && flipsAt(board, player, i).length > 0) return true;
  }
  return false;
}

export interface MoveResult {
  readonly board: Disc[];
  readonly flips: Flip[];
}

export function applyMove(board: Board, player: Player, index: number): MoveResult {
  const flips = flipsAt(board, player, index);
  const next = board.slice() as Disc[];
  next[index] = player;
  for (const f of flips) next[f.index] = player;
  return { board: next, flips };
}

export interface Counts {
  readonly dark: number;
  readonly light: number;
  readonly empty: number;
}

export function counts(board: Board): Counts {
  let dark = 0;
  let light = 0;
  let empty = 0;
  for (let i = 0; i < CELLS; i++) {
    const v = board[i];
    if (v === DARK) dark++;
    else if (v === LIGHT) light++;
    else empty++;
  }
  return { dark, light, empty };
}

export function discsOf(board: Board, player: Player): number {
  const c = counts(board);
  return player === DARK ? c.dark : c.light;
}

export function isGameOver(board: Board): boolean {
  return !hasMove(board, DARK) && !hasMove(board, LIGHT);
}

export function winnerOf(board: Board): Player | 0 {
  const c = counts(board);
  if (c.dark > c.light) return DARK;
  if (c.light > c.dark) return LIGHT;
  return 0;
}
