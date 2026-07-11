import { describe, expect, test } from "bun:test";

import { CELLS, isSolved, press } from "./board";
import {
  LEVEL_COUNT,
  generateCampaignBoard,
  generateRandomBoard,
  parForLevel,
  starsFor,
} from "./campaign";
import { isSolvable, optimalPressCount, solveLightsOut } from "./solver";

function applySolution(board: number, solution: number): number {
  let next = board;
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (((solution >> cell) & 1) === 1) next = press(next, cell);
  }
  return next;
}

describe("campaign", () => {
  test("par curve rises monotonically from 3", () => {
    expect(parForLevel(0)).toBe(3);
    let previous = 0;
    for (let level = 0; level < LEVEL_COUNT; level += 1) {
      const par = parForLevel(level);
      expect(par).toBeGreaterThanOrEqual(previous);
      previous = par;
    }
    expect(parForLevel(LEVEL_COUNT - 1)).toBeGreaterThan(parForLevel(0));
  });

  test("all 30 levels: non-trivial, honest par, solvable, deterministic, par >= optimal", () => {
    for (let level = 0; level < LEVEL_COUNT; level += 1) {
      const generated = generateCampaignBoard(level);
      expect(generated.board).not.toBe(0);
      expect(generated.par).toBe(parForLevel(level));
      expect(isSolvable(generated.board)).toBe(true);

      const optimal = optimalPressCount(generated.board);
      expect(optimal).not.toBeNull();
      expect(generated.par).toBeGreaterThanOrEqual(optimal ?? 0);

      expect(generateCampaignBoard(level).board).toBe(generated.board);
      expect(isSolved(applySolution(generated.board, solveLightsOut(generated.board) ?? 0))).toBe(true);
    }
  });

  test("random boards are seeded, solvable, non-trivial, with par equal to optimal", () => {
    for (const seed of ["alpha", "2026-07-11", "zzz", "42", "share-me"]) {
      const generated = generateRandomBoard(seed);
      expect(generated.board).not.toBe(0);
      expect(isSolvable(generated.board)).toBe(true);
      expect(generated.par).toBe(optimalPressCount(generated.board));
      expect(generateRandomBoard(seed).board).toBe(generated.board);
    }
  });

  test("star thresholds follow par / par+3 / any", () => {
    expect(starsFor(4, 5)).toBe(3);
    expect(starsFor(5, 5)).toBe(3);
    expect(starsFor(6, 5)).toBe(2);
    expect(starsFor(8, 5)).toBe(2);
    expect(starsFor(9, 5)).toBe(1);
    expect(starsFor(20, 5)).toBe(1);
  });
});
