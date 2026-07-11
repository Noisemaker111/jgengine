import { describe, expect, test } from "bun:test";

import { seededRng } from "@jgengine/core/random/rng";

import { CELLS, isSolved, press } from "./board";
import { isSolvable, nullSpace, optimalPressCount, solveLightsOut } from "./solver";

function applySolution(board: number, solution: number): number {
  let next = board;
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (((solution >> cell) & 1) === 1) next = press(next, cell);
  }
  return next;
}

describe("GF(2) solver", () => {
  test("null space has dimension 2 with two non-empty quiet patterns", () => {
    const nulls = nullSpace();
    expect(nulls.length).toBe(2);
    for (const quiet of nulls) expect(quiet).not.toBe(0);
  });

  test("quiet patterns are truly quiet (pressing all their cells changes nothing)", () => {
    for (const quiet of nullSpace()) expect(applySolution(0, quiet)).toBe(0);
  });

  test("solves 250 seeded random solvable boards", () => {
    for (let seed = 0; seed < 250; seed += 1) {
      const rng = seededRng(`solve:${seed}`);
      let board = 0;
      const presses = 1 + Math.floor(rng() * 24);
      for (let i = 0; i < presses; i += 1) board = press(board, Math.floor(rng() * CELLS));
      const solution = solveLightsOut(board);
      expect(solution).not.toBeNull();
      expect(isSolved(applySolution(board, solution ?? 0))).toBe(true);
    }
  });

  test("optimal press count never exceeds a known valid solution", () => {
    const rng = seededRng("optimal");
    const cells = new Set<number>();
    for (let i = 0; i < 14; i += 1) {
      const cell = Math.floor(rng() * CELLS);
      if (cells.has(cell)) cells.delete(cell);
      else cells.add(cell);
    }
    let board = 0;
    for (const cell of cells) board = press(board, cell);
    const optimal = optimalPressCount(board);
    expect(optimal).not.toBeNull();
    expect(optimal ?? Infinity).toBeLessThanOrEqual(cells.size);
  });

  test("detects an unsolvable board (single light not orthogonal to a quiet pattern)", () => {
    const quiet = nullSpace()[0];
    let cell = 0;
    while (((quiet >> cell) & 1) === 0) cell += 1;
    const board = 1 << cell;
    expect(isSolvable(board)).toBe(false);
    expect(solveLightsOut(board)).toBeNull();
    expect(optimalPressCount(board)).toBeNull();
  });

  test("solvable classification agrees with solution clearing the board", () => {
    const rng = seededRng("classify");
    let solvedCount = 0;
    let unsolvableCount = 0;
    for (let i = 0; i < 400; i += 1) {
      const board = Math.floor(rng() * (1 << 25)) & ((1 << CELLS) - 1);
      const solution = solveLightsOut(board);
      if (solution === null) {
        expect(isSolvable(board)).toBe(false);
        unsolvableCount += 1;
      } else {
        expect(isSolved(applySolution(board, solution))).toBe(true);
        solvedCount += 1;
      }
    }
    expect(solvedCount).toBeGreaterThan(0);
    expect(unsolvableCount).toBeGreaterThan(0);
  });
});
