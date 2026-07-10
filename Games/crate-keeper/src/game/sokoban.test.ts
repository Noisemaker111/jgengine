import { describe, expect, test } from "bun:test";

import { LEVELS, parOf } from "./levels";
import { starTier, twoStarThreshold } from "./progression";
import { applyMove, initBoard, isSolved, parseLevel, type Dir } from "./sokoban";

describe("crate-keeper levels", () => {
  test("all 20 levels exist with unique ids", () => {
    expect(LEVELS.length).toBe(20);
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(20);
  });

  for (const level of LEVELS) {
    describe(`${level.id} ${level.name}`, () => {
      const parsed = parseLevel(level.grid);

      test("crate count matches goal count and fits in 12x12", () => {
        expect(parsed.crateStarts.length).toBe(parsed.goalCount);
        expect(parsed.crateStarts.length).toBeGreaterThan(0);
        expect(parsed.playerStart).toBeGreaterThanOrEqual(0);
        expect(parsed.width).toBeLessThanOrEqual(12);
        expect(parsed.height).toBeLessThanOrEqual(12);
      });

      test("recorded solution solves it, and every move is real (honest par)", () => {
        const board = initBoard(parsed);
        expect(isSolved(board)).toBe(false);
        for (const ch of level.solution) {
          const result = applyMove(board, ch as Dir);
          expect(result.moved).toBe(true);
        }
        expect(isSolved(board)).toBe(true);
        expect(parOf(level)).toBe(level.solution.length);
      });

      test("par-length play scores 3 stars", () => {
        const par = parOf(level);
        expect(starTier(par, par)).toBe(3);
        expect(starTier(par + 1, par)).toBeLessThan(3);
        expect(twoStarThreshold(par)).toBeGreaterThanOrEqual(par);
      });
    });
  }

  test("difficulty ramps: crate count is non-decreasing across the campaign", () => {
    const crateCounts = LEVELS.map((level) => parseLevel(level.grid).crateStarts.length);
    for (let i = 1; i < crateCounts.length; i += 1) {
      expect(crateCounts[i]).toBeGreaterThanOrEqual(crateCounts[i - 1]);
    }
  });
});
