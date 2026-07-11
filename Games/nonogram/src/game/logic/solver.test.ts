import { describe, expect, test } from "bun:test";
import { PUZZLES, puzzlesInGroup, SIZE_GROUPS } from "../puzzles/catalog";
import { clueSum, cluesEqual, runsOf } from "./clues";
import { EMPTY, FILLED, lineSolve, solveLine, UNKNOWN } from "./solver";

describe("runsOf", () => {
  test("counts consecutive runs", () => {
    expect(runsOf([true, true, false, true])).toEqual([2, 1]);
    expect(runsOf([false, false, false])).toEqual([]);
    expect(runsOf([true, true, true])).toEqual([3]);
    expect(runsOf([true, false, true, false, true])).toEqual([1, 1, 1]);
  });
});

describe("solveLine", () => {
  test("fully determines a saturated line", () => {
    const res = solveLine([UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN], [5]);
    expect(res).toEqual([FILLED, FILLED, FILLED, FILLED, FILLED]);
  });
  test("crosses out an empty-clue line", () => {
    const res = solveLine([UNKNOWN, UNKNOWN, UNKNOWN], []);
    expect(res).toEqual([EMPTY, EMPTY, EMPTY]);
  });
  test("overlap deduction on a partial run", () => {
    // clue [3] in width 4 forces the middle two cells filled.
    const res = solveLine([UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN], [3]);
    expect(res?.[1]).toBe(FILLED);
    expect(res?.[2]).toBe(FILLED);
    expect(res?.[0]).toBe(UNKNOWN);
  });
  test("returns null on contradiction", () => {
    expect(solveLine([EMPTY, EMPTY], [1])).toBeNull();
  });
});

describe("puzzle catalog", () => {
  test("has 20 puzzles across three size groups", () => {
    expect(PUZZLES.length).toBe(20);
    expect(SIZE_GROUPS.map((g) => puzzlesInGroup(g).length)).toEqual([6, 8, 6]);
  });

  test("ids are unique and named", () => {
    const ids = new Set(PUZZLES.map((p) => p.id));
    expect(ids.size).toBe(20);
    for (const p of PUZZLES) expect(p.name.length).toBeGreaterThan(0);
  });

  for (const puzzle of PUZZLES) {
    describe(`${puzzle.name} (${puzzle.group})`, () => {
      test("art is a square grid of the declared size", () => {
        expect(puzzle.solution.length).toBe(puzzle.size);
        for (const row of puzzle.solution) expect(row.length).toBe(puzzle.size);
        expect(puzzle.rowClues.length).toBe(puzzle.size);
        expect(puzzle.colClues.length).toBe(puzzle.size);
      });

      test("is a recognizable picture, not blank or full", () => {
        const filled = puzzle.solution.flat().filter(Boolean).length;
        const total = puzzle.size * puzzle.size;
        expect(filled).toBeGreaterThan(total * 0.15);
        expect(filled).toBeLessThan(total * 0.95);
      });

      test("clues are consistent with the art", () => {
        let rowTotal = 0;
        let colTotal = 0;
        for (const clue of puzzle.rowClues) rowTotal += clueSum(clue);
        for (const clue of puzzle.colClues) colTotal += clueSum(clue);
        const filled = puzzle.solution.flat().filter(Boolean).length;
        expect(rowTotal).toBe(filled);
        expect(colTotal).toBe(filled);
      });

      test("is LINE-SOLVABLE by constraint propagation alone (no guessing)", () => {
        const result = lineSolve(puzzle.solution);
        expect(result.solved).toBe(true);
        for (let r = 0; r < puzzle.size; r += 1)
          for (let c = 0; c < puzzle.size; c += 1) {
            const expected = puzzle.solution[r][c] ? FILLED : EMPTY;
            expect(result.board[r][c]).toBe(expected);
          }
      });

      test("derived clues round-trip against the solved board", () => {
        const result = lineSolve(puzzle.solution);
        for (let r = 0; r < puzzle.size; r += 1) {
          const rowMask = result.board[r].map((cell) => cell === FILLED);
          expect(cluesEqual(runsOf(rowMask), puzzle.rowClues[r])).toBe(true);
        }
      });
    });
  }
});
