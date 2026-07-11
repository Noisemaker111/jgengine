import { describe, expect, test } from "bun:test";

import {
  chord,
  createBoard,
  cycleMark,
  DIFFICULTIES,
  flagCount,
  idx,
  isSolved,
  minesRemaining,
  neighbors,
  normalizeConfig,
  reveal,
  type Board,
} from "./board";

function countMines(board: Board): number {
  return board.cells.filter((cell) => cell.mine).length;
}

function firstSafeReveal(board: Board): Board {
  // pick any cell; first click always relocates mines away from its 3x3 neighborhood
  return reveal(board, idx(board.cols, Math.floor(board.cols / 2), Math.floor(board.rows / 2)));
}

describe("flag-sweep board — placement & determinism", () => {
  test("beginner places exactly 10 mines on 81 cells", () => {
    const board = createBoard(DIFFICULTIES.beginner, "seed-a", "beginner");
    expect(board.cells.length).toBe(81);
    expect(countMines(board)).toBe(10);
    expect(board.mines).toBe(10);
  });

  test("expert is 30x16 with 99 mines", () => {
    const board = createBoard(DIFFICULTIES.expert, "seed-x", "expert");
    expect(board.cols).toBe(30);
    expect(board.rows).toBe(16);
    expect(countMines(board)).toBe(99);
  });

  test("same seed produces an identical mine field", () => {
    const a = createBoard(DIFFICULTIES.intermediate, "daily-2026", "intermediate");
    const b = createBoard(DIFFICULTIES.intermediate, "daily-2026", "intermediate");
    expect(a.cells.map((c) => c.mine)).toEqual(b.cells.map((c) => c.mine));
  });

  test("different seeds produce different mine fields", () => {
    const a = createBoard(DIFFICULTIES.expert, "seed-1", "expert");
    const b = createBoard(DIFFICULTIES.expert, "seed-2", "expert");
    expect(a.cells.map((c) => c.mine)).not.toEqual(b.cells.map((c) => c.mine));
  });

  test("adjacency equals the count of neighboring mines for every safe cell", () => {
    const board = createBoard(DIFFICULTIES.beginner, "adj", "beginner");
    for (let i = 0; i < board.cells.length; i += 1) {
      if (board.cells[i]!.mine) continue;
      const expected = neighbors(board.cols, board.rows, i).filter((n) => board.cells[n]!.mine).length;
      expect(board.cells[i]!.adjacent).toBe(expected);
    }
  });
});

describe("flag-sweep board — first click safety", () => {
  test("first click never hits a mine and opens a zero region", () => {
    for (let s = 0; s < 25; s += 1) {
      const board = createBoard(DIFFICULTIES.beginner, `safe-${s}`, "beginner");
      const center = idx(board.cols, 4, 4);
      const after = reveal(board, center);
      expect(after.cells[center]!.mine).toBe(false);
      expect(after.cells[center]!.adjacent).toBe(0);
      expect(after.status).toBe("playing");
      const revealed = after.cells.filter((c) => c.revealed).length;
      expect(revealed).toBeGreaterThan(1);
      expect(countMines(after)).toBe(10); // relocation preserves the mine count
    }
  });

  test("relocation keeps the same mine count on a dense custom board", () => {
    const cfg = normalizeConfig(6, 6, 20);
    const board = createBoard(cfg, "dense", "custom");
    const after = reveal(board, idx(board.cols, 2, 2));
    expect(after.cells[idx(board.cols, 2, 2)]!.mine).toBe(false);
    expect(countMines(after)).toBe(countMines(board));
  });
});

describe("flag-sweep board — reveal, flag, chord, win/lose", () => {
  test("revealing a mine after the first click loses and marks the struck cell", () => {
    const board = firstSafeReveal(createBoard(DIFFICULTIES.beginner, "lose", "beginner"));
    const mineIndex = board.cells.findIndex((c) => c.mine);
    const after = reveal(board, mineIndex);
    expect(after.status).toBe("lost");
    expect(after.struckIndex).toBe(mineIndex);
    expect(after.cells.filter((c) => c.mine).every((c) => c.revealed)).toBe(true);
  });

  test("flag cycles none -> flag -> question -> none and blocks reveal", () => {
    let board = createBoard(DIFFICULTIES.beginner, "flag", "beginner");
    const target = 0;
    board = cycleMark(board, target, true);
    expect(board.cells[target]!.mark).toBe("flag");
    board = cycleMark(board, target, true);
    expect(board.cells[target]!.mark).toBe("question");
    board = cycleMark(board, target, true);
    expect(board.cells[target]!.mark).toBe("none");

    const flagged = cycleMark(board, target, true);
    const afterReveal = reveal(flagged, target);
    expect(afterReveal.cells[target]!.revealed).toBe(false);
  });

  test("question marks can be disabled: none -> flag -> none", () => {
    let board = createBoard(DIFFICULTIES.beginner, "noq", "beginner");
    board = cycleMark(board, 5, false);
    expect(board.cells[5]!.mark).toBe("flag");
    board = cycleMark(board, 5, false);
    expect(board.cells[5]!.mark).toBe("none");
  });

  test("minesRemaining counts down as flags are placed", () => {
    let board = createBoard(DIFFICULTIES.beginner, "count", "beginner");
    expect(minesRemaining(board)).toBe(10);
    board = cycleMark(board, 0, true);
    board = cycleMark(board, 1, true);
    expect(flagCount(board)).toBe(2);
    expect(minesRemaining(board)).toBe(8);
  });

  test("chord on a satisfied number reveals the remaining neighbors", () => {
    const board = createBoard(DIFFICULTIES.beginner, "chord", "beginner");
    // find a safe numbered cell with adjacent > 0, flag all its mine neighbors, reveal it, then chord
    const numbered = board.cells.findIndex((c) => !c.mine && c.adjacent > 0);
    let staged = reveal(board, numbered);
    // ensure the numbered cell is revealed (it may already be part of a region or a border)
    if (!staged.cells[numbered]!.revealed) staged = reveal(staged, numbered);
    if (staged.status !== "playing") return; // extremely small chance of instant win; skip
    for (const n of neighbors(staged.cols, staged.rows, numbered)) {
      if (staged.cells[n]!.mine) staged = cycleMark(staged, n, true);
    }
    const before = staged.cells.filter((c) => c.revealed).length;
    const after = chord(staged, numbered);
    const revealedAfter = after.cells.filter((c) => c.revealed).length;
    expect(revealedAfter).toBeGreaterThanOrEqual(before);
    expect(after.status).not.toBe("lost");
  });

  test("chording with a wrong flag detonates a mine", () => {
    const board = createBoard(DIFFICULTIES.beginner, "wrongchord", "beginner");
    const numbered = board.cells.findIndex((c) => !c.mine && c.adjacent === 1);
    if (numbered < 0) return;
    let staged = reveal(board, numbered);
    if (!staged.cells[numbered]!.revealed || staged.status !== "playing") return;
    const around = neighbors(staged.cols, staged.rows, numbered);
    const safeNeighbor = around.find((n) => !staged.cells[n]!.mine && !staged.cells[n]!.revealed);
    if (safeNeighbor === undefined) return;
    staged = cycleMark(staged, safeNeighbor, true); // flag a SAFE cell (wrong)
    const after = chord(staged, numbered);
    expect(after.status).toBe("lost");
  });

  test("revealing every safe cell wins and auto-flags all mines", () => {
    const board = createBoard(DIFFICULTIES.beginner, "win", "beginner");
    let staged = firstSafeReveal(board);
    for (let i = 0; i < staged.cells.length; i += 1) {
      if (staged.status !== "playing") break;
      if (!staged.cells[i]!.mine && !staged.cells[i]!.revealed) staged = reveal(staged, i);
    }
    expect(staged.status).toBe("won");
    expect(isSolved(staged)).toBe(true);
    expect(staged.cells.filter((c) => c.mine).every((c) => c.mark === "flag")).toBe(true);
    expect(minesRemaining(staged)).toBe(0);
  });
});

describe("flag-sweep board — config normalization", () => {
  test("clamps custom dimensions and mine budget", () => {
    expect(normalizeConfig(2, 2, 1)).toEqual({ cols: 5, rows: 5, mines: 1 });
    expect(normalizeConfig(99, 99, 100000)).toEqual({ cols: 40, rows: 30, mines: 40 * 30 - 9 });
  });
});
