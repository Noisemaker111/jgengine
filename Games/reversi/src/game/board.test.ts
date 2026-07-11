import { describe, expect, test } from "bun:test";

import {
  CELLS,
  DARK,
  LIGHT,
  applyMove,
  counts,
  createBoard,
  flipsAt,
  hasMove,
  idx,
  isGameOver,
  legalMoves,
  winnerOf,
} from "./board";
import type { Disc } from "./board";

describe("reversi board — setup", () => {
  const board = createBoard();
  test("standard central setup", () => {
    const c = counts(board);
    expect(c.dark).toBe(2);
    expect(c.light).toBe(2);
    expect(c.empty).toBe(60);
    expect(board[idx(3, 3)]).toBe(LIGHT);
    expect(board[idx(3, 4)]).toBe(DARK);
    expect(board[idx(4, 3)]).toBe(DARK);
    expect(board[idx(4, 4)]).toBe(LIGHT);
  });
});

describe("reversi board — move generation", () => {
  const board = createBoard();
  test("dark opening has exactly the four canonical moves", () => {
    const moves = legalMoves(board, DARK).sort((a, b) => a - b);
    expect(moves).toEqual([idx(2, 3), idx(3, 2), idx(4, 5), idx(5, 4)]);
  });
  test("light opening also has four moves, mirrored", () => {
    expect(legalMoves(board, LIGHT).length).toBe(4);
  });
  test("a move must flip at least one disc", () => {
    for (const m of legalMoves(board, DARK)) expect(flipsAt(board, DARK, m).length).toBeGreaterThan(0);
    expect(flipsAt(board, DARK, idx(0, 0))).toEqual([]);
  });
});

describe("reversi board — ray flips", () => {
  test("single-ray flip captures the bracketed disc", () => {
    const board = createBoard();
    const move = idx(2, 3);
    const flips = flipsAt(board, DARK, move);
    expect(flips.map((f) => f.index)).toEqual([idx(3, 3)]);
    expect(flips[0].step).toBe(1);
    const { board: next, flips: applied } = applyMove(board, DARK, move);
    expect(next[move]).toBe(DARK);
    expect(next[idx(3, 3)]).toBe(DARK);
    expect(applied.length).toBe(1);
    const c = counts(next);
    expect(c.dark).toBe(4);
    expect(c.light).toBe(1);
  });

  test("flips resolve along multiple rays and record ray step distance", () => {
    // Center empty at (3,3); DARK sits N and E at distance 2 with LIGHT in between.
    const b = new Array<Disc>(CELLS).fill(0);
    const center = idx(3, 3);
    b[idx(1, 3)] = DARK;
    b[idx(2, 3)] = LIGHT;
    b[idx(3, 5)] = DARK;
    b[idx(3, 4)] = LIGHT;
    const flips = flipsAt(b, DARK, center);
    const flipped = new Set(flips.map((f) => f.index));
    expect(flipped.has(idx(2, 3))).toBe(true);
    expect(flipped.has(idx(3, 4))).toBe(true);
    expect(flips.every((f) => f.step === 1)).toBe(true);
    const { board: next } = applyMove(b, DARK, center);
    expect(next[idx(2, 3)]).toBe(DARK);
    expect(next[idx(3, 4)]).toBe(DARK);
  });

  test("no bracketing own disc means no flip", () => {
    const b = new Array<Disc>(CELLS).fill(0);
    b[idx(3, 3)] = LIGHT; // lone opponent, nothing behind it
    expect(flipsAt(b, DARK, idx(3, 2))).toEqual([]);
  });
});

describe("reversi board — pass and game-end", () => {
  test("pass condition: one side has no move, the other does", () => {
    // All light except a lone DARK at (0,1) and an empty at (0,0).
    const b = new Array<Disc>(CELLS).fill(LIGHT);
    b[idx(0, 0)] = 0;
    b[idx(0, 1)] = DARK;
    expect(hasMove(b, DARK)).toBe(false); // no DARK anchor behind any line
    expect(hasMove(b, LIGHT)).toBe(true); // LIGHT plays (0,0), flips (0,1)
    expect(isGameOver(b)).toBe(false);
  });

  test("game over when neither side can move", () => {
    const b = new Array<Disc>(CELLS).fill(LIGHT);
    b[idx(0, 0)] = 0; // an empty remains but nobody can flip into it
    expect(hasMove(b, DARK)).toBe(false);
    expect(hasMove(b, LIGHT)).toBe(false);
    expect(isGameOver(b)).toBe(true);
    expect(winnerOf(b)).toBe(LIGHT);
  });

  test("full board is terminal and scored by majority", () => {
    const b = new Array<Disc>(CELLS).fill(DARK);
    b[0] = LIGHT;
    expect(isGameOver(b)).toBe(true);
    expect(winnerOf(b)).toBe(DARK);
  });
});
