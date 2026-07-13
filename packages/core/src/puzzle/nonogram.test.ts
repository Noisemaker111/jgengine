import { describe, expect, test } from "bun:test";

import {
  deriveClues,
  runLengths,
  solveLine,
  solveNonogram,
  type NonogramCell,
  type NonogramSolution,
} from "./nonogram";

describe("clue derivation", () => {
  test("runLengths reads consecutive filled runs", () => {
    expect(runLengths([true, true, false, true])).toEqual([2, 1]);
    expect(runLengths([false, false])).toEqual([]);
  });

  test("deriveClues produces row and column clues", () => {
    const solution: NonogramSolution = [
      [true, false],
      [true, true],
    ];
    expect(deriveClues(solution)).toEqual({ rows: [[1], [2]], cols: [[2], [1]] });
  });
});

describe("solveLine", () => {
  test("forces the overlap of a long run", () => {
    const line: NonogramCell[] = new Array(5).fill("unknown");
    const solved = solveLine(line, [4])!;
    expect(solved).toEqual(["unknown", "filled", "filled", "filled", "unknown"]);
  });

  test("fills a fully determined line and marks the gaps empty", () => {
    const line: NonogramCell[] = new Array(3).fill("unknown");
    expect(solveLine(line, [3])).toEqual(["filled", "filled", "filled"]);
    expect(solveLine(line, [1, 1])).toEqual(["filled", "empty", "filled"]);
  });

  test("returns null on contradiction", () => {
    expect(solveLine(["empty", "empty"], [1])).toBeNull();
  });
});

describe("solveNonogram", () => {
  test("solves a line-solvable puzzle from its clues", () => {
    const solution: NonogramSolution = [
      [true, true, false],
      [false, true, true],
      [true, false, true],
    ];
    const { rows, cols } = deriveClues(solution);
    const result = solveNonogram(rows, cols);
    expect(result.solved).toBe(true);
    const painted = result.board.map((row) => row.map((cell) => cell === "filled"));
    expect(painted).toEqual(solution as boolean[][]);
  });

  test("reports unsolved when propagation cannot fully determine the board", () => {
    // The classic 2x2 checkerboard ambiguity: clues admit two solutions.
    const result = solveNonogram([[1], [1]], [[1], [1]]);
    expect(result.solved).toBe(false);
  });
});
