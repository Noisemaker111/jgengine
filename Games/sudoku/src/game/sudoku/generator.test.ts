import { describe, expect, test } from "bun:test";

import { DIFF_CONFIG, DIFFICULTIES, type Difficulty } from "./difficulty";
import { generatePuzzle } from "./generator";
import { UNITS } from "./grid";
import { countSolutions, logicalSolve, solve } from "./solver";

const SEEDS = ["alpha", "bravo", "charlie", "delta"];

function isCompleteValidGrid(grid: readonly number[]): boolean {
  if (grid.length !== 81 || grid.some((v) => v < 1 || v > 9)) return false;
  return UNITS.every((unit) => new Set(unit.map((c) => grid[c])).size === 9);
}

function countGivens(puzzle: readonly number[]): number {
  return puzzle.filter((v) => v !== 0).length;
}

describe("sudoku generator — unique solutions across seeds and difficulties", () => {
  for (const difficulty of DIFFICULTIES) {
    for (const seed of SEEDS) {
      test(`${difficulty} / ${seed}: exactly one solution, solver recovers it`, () => {
        const { puzzle, solution, givens } = generatePuzzle(difficulty, seed);

        expect(isCompleteValidGrid(solution)).toBe(true);
        // Every given agrees with the solution (the puzzle is a subset of it).
        for (let i = 0; i < 81; i += 1) {
          if (puzzle[i] !== 0) expect(puzzle[i]).toBe(solution[i]);
        }
        // Uniqueness: the dig-holes re-check guarantees a single solution.
        expect(countSolutions(puzzle, 2)).toBe(1);
        // The backtracking solver recovers exactly that solution.
        expect(solve(puzzle)).toEqual(solution);
        // Givens count matches the reported count and is a plausible sudoku.
        expect(countGivens(puzzle)).toBe(givens);
        expect(givens).toBeGreaterThanOrEqual(17);
        expect(givens).toBeLessThanOrEqual(64);
      });
    }
  }
});

describe("sudoku generator — deterministic under a fixed seed", () => {
  for (const difficulty of DIFFICULTIES) {
    test(`${difficulty} is byte-identical for the same seed`, () => {
      const a = generatePuzzle(difficulty, "repeat-seed");
      const b = generatePuzzle(difficulty, "repeat-seed");
      expect(a.puzzle).toEqual(b.puzzle);
      expect(a.solution).toEqual(b.solution);
    });
  }

  test("different seeds produce different puzzles", () => {
    const a = generatePuzzle("hard", "seed-1");
    const b = generatePuzzle("hard", "seed-2");
    expect(a.puzzle).not.toEqual(b.puzzle);
  });
});

describe("sudoku generator — technique gating", () => {
  for (const seed of SEEDS) {
    test(`easy / ${seed} is solvable by naked singles alone`, () => {
      const { puzzle } = generatePuzzle("easy", seed);
      expect(logicalSolve(puzzle, false).solved).toBe(true);
    });

    test(`medium / ${seed} is solvable by naked + hidden singles`, () => {
      const { puzzle } = generatePuzzle("medium", seed);
      expect(logicalSolve(puzzle, true).solved).toBe(true);
    });
  }

  test("harder tiers target fewer givens than easier ones", () => {
    const givensFor = (d: Difficulty) => DIFF_CONFIG[d].targetGivens;
    expect(givensFor("easy")).toBeGreaterThan(givensFor("medium"));
    expect(givensFor("medium")).toBeGreaterThan(givensFor("hard"));
    expect(givensFor("hard")).toBeGreaterThan(givensFor("expert"));
  });
});
