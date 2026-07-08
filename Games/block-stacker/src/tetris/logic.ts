import { PIECE_ROTATIONS, type CellOffset, type PieceType } from "./pieces";

export type Cell = PieceType | null;

export interface Board {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly Cell[];
}

export interface ActivePiece {
  readonly type: PieceType;
  readonly rotation: number;
  readonly x: number;
  readonly y: number;
}

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

const LINE_BASE: readonly number[] = [0, 40, 100, 300, 1200];

export function createBoard(width = BOARD_WIDTH, height = BOARD_HEIGHT): Board {
  return { width, height, cells: new Array<Cell>(width * height).fill(null) };
}

export function cellAt(board: Board, x: number, y: number): Cell {
  if (x < 0 || x >= board.width || y < 0 || y >= board.height) return null;
  return board.cells[y * board.width + x] ?? null;
}

export function pieceCells(piece: ActivePiece): readonly CellOffset[] {
  const state = PIECE_ROTATIONS[piece.type][((piece.rotation % 4) + 4) % 4];
  return state.map(([ox, oy]) => [piece.x + ox, piece.y + oy] as CellOffset);
}

export function collides(board: Board, piece: ActivePiece): boolean {
  for (const [x, y] of pieceCells(piece)) {
    if (x < 0 || x >= board.width || y >= board.height) return true;
    if (y >= 0 && board.cells[y * board.width + x] !== null) return true;
  }
  return false;
}

export function merge(board: Board, piece: ActivePiece): Board {
  const cells = board.cells.slice();
  for (const [x, y] of pieceCells(piece)) {
    if (y >= 0 && y < board.height && x >= 0 && x < board.width) {
      cells[y * board.width + x] = piece.type;
    }
  }
  return { width: board.width, height: board.height, cells };
}

export function clearLines(board: Board): { board: Board; cleared: number } {
  const kept: Cell[][] = [];
  for (let y = 0; y < board.height; y += 1) {
    const row = board.cells.slice(y * board.width, y * board.width + board.width);
    if (row.some((cell) => cell === null)) kept.push(row);
  }
  const cleared = board.height - kept.length;
  const cells: Cell[] = [];
  for (let i = 0; i < cleared; i += 1) cells.push(...new Array<Cell>(board.width).fill(null));
  for (const row of kept) cells.push(...row);
  return { board: { width: board.width, height: board.height, cells }, cleared };
}

export function dropDistance(board: Board, piece: ActivePiece): number {
  let distance = 0;
  while (!collides(board, { ...piece, y: piece.y + distance + 1 })) distance += 1;
  return distance;
}

export function levelForLines(lines: number): number {
  return Math.floor(lines / 10);
}

export function lineScore(cleared: number, level: number): number {
  return (LINE_BASE[cleared] ?? 0) * (level + 1);
}

export function gravityInterval(level: number): number {
  return Math.max(0.05, 0.8 - level * 0.07);
}
