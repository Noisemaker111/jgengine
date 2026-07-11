import { describe, expect, test } from "bun:test";

import { seededRng } from "@jgengine/core/random/rng";

import { chooseMove, evaluate, winningMove } from "./ai";
import { boardFromMoves, legalColumns, wouldWin, type Board, type Move, type Player } from "./board";

function play(cols: number[], first: Player = 1): Board {
  return boardFromMoves(
    cols.map((col) => ({ col, row: 0, player: 1 as Player }) as Move),
    first,
  );
}

describe("ai — immediate tactics", () => {
  test("winningMove finds a completing column for a horizontal three", () => {
    // p1 has cols 1,2,3 on row 0; it is p1's turn.
    const board = play([1, 5, 2, 6, 3, 5]);
    expect(board.current).toBe(1);
    const move = winningMove(board, 1);
    expect(move).not.toBeNull();
    expect(wouldWin(board, move!, 1)).toBe(true);
  });

  test("Hard completes its own winning four", () => {
    const board = play([1, 5, 2, 6, 3, 5]); // p1 three-in-a-row, p1 to move
    expect(board.current).toBe(1);
    const col = chooseMove(board, "hard", seededRng("finish"));
    expect(wouldWin(board, col, 1)).toBe(true);
  });

  test("Hard blocks an open three", () => {
    // p2 holds cols 1,2,3 on row 0 with col 0 already taken by p1 → the only
    // completing square is col 4. p1 (the AI here) is to move with no win of its own.
    const board = play([0, 1, 5, 2, 6, 3]);
    expect(board.current).toBe(1);
    expect(winningMove(board, 1)).toBeNull(); // AI has no immediate win
    expect(winningMove(board, 2)).toBe(4); // the single threat
    expect(chooseMove(board, "hard", seededRng("block"))).toBe(4);
  });

  test("every level takes an immediate win when offered", () => {
    const board = play([1, 5, 2, 6, 3, 5]);
    for (const level of ["easy", "medium", "hard"] as const) {
      const col = chooseMove(board, level, seededRng(`win-${level}`));
      expect(wouldWin(board, col, 1)).toBe(true);
    }
  });
});

describe("ai — determinism & legality", () => {
  test("the same seed yields the same Hard move", () => {
    const board = play([3, 3, 4, 2]);
    const a = chooseMove(board, "hard", seededRng("same"));
    const b = chooseMove(board, "hard", seededRng("same"));
    expect(a).toBe(b);
    expect(legalColumns(board)).toContain(a);
  });

  test("Easy is deterministic under a fixed seed", () => {
    const board = play([3, 2]); // p1 to move, no threats
    const a = chooseMove(board, "easy", seededRng("easy-seed"));
    const b = chooseMove(board, "easy", seededRng("easy-seed"));
    expect(a).toBe(b);
    expect(legalColumns(board)).toContain(a);
  });

  test("Medium returns a legal column and exercises the search", () => {
    const board = play([3, 2, 4]);
    const col = chooseMove(board, "medium", seededRng("mid"));
    expect(legalColumns(board)).toContain(col);
  });

  test("evaluation rewards central control", () => {
    const centered = play([3, 0]); // p1 in the center column
    const edge = play([0, 3]); // p1 on the edge
    expect(evaluate(centered.cells, 1)).toBeGreaterThan(evaluate(edge.cells, 1));
  });
});
