import {
  cellAt as gridCellAt,
  clearRows,
  createCellGrid,
  fullRows,
  type CellGrid,
} from "@jgengine/core/puzzle/cellGrid";
import {
  dropDistance as pieceDropDistance,
  gravityInterval as pieceGravityInterval,
  levelForLines as pieceLevelForLines,
  lineScore as pieceLineScore,
  mergePiece,
  pieceCells as fallingPieceCells,
  pieceCollides,
  type ShapeTable,
} from "@jgengine/core/puzzle/fallingPiece";

import { PIECE_ROTATIONS, type CellOffset, type PieceType } from "./pieces";

export type Cell = PieceType | null;

export type Board = CellGrid<PieceType>;

export interface ActivePiece {
  readonly type: PieceType;
  readonly rotation: number;
  readonly x: number;
  readonly y: number;
}

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

const SHAPE_TABLE: ShapeTable<PieceType> = PIECE_ROTATIONS;

function asFallingPiece(piece: ActivePiece) {
  return { shape: piece.type, rotation: piece.rotation, x: piece.x, y: piece.y };
}

export function createBoard(width = BOARD_WIDTH, height = BOARD_HEIGHT): Board {
  return createCellGrid<PieceType>(width, height);
}

export function cellAt(board: Board, x: number, y: number): Cell {
  return gridCellAt(board, x, y);
}

export function pieceCells(piece: ActivePiece): readonly CellOffset[] {
  return fallingPieceCells(SHAPE_TABLE, asFallingPiece(piece));
}

export function collides(board: Board, piece: ActivePiece): boolean {
  return pieceCollides(board, SHAPE_TABLE, asFallingPiece(piece));
}

export function merge(board: Board, piece: ActivePiece): Board {
  return mergePiece(board, SHAPE_TABLE, asFallingPiece(piece), piece.type);
}

export function clearLines(board: Board): { board: Board; cleared: number } {
  const rows = fullRows(board);
  return { board: clearRows(board, rows), cleared: rows.length };
}

export function dropDistance(board: Board, piece: ActivePiece): number {
  return pieceDropDistance(board, SHAPE_TABLE, asFallingPiece(piece));
}

export function levelForLines(lines: number): number {
  return pieceLevelForLines(lines);
}

export function lineScore(cleared: number, level: number): number {
  return pieceLineScore(cleared, level);
}

export function gravityInterval(level: number): number {
  return pieceGravityInterval(level);
}
