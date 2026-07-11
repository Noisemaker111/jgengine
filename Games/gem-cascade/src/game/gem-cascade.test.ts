import { describe, expect, test } from "bun:test";

import { createCellGrid, withCells } from "@jgengine/core/puzzle/cellGrid";
import { seededRng } from "@jgengine/core/random/rng";

import {
  BOARD_SIZE,
  GEM_KINDS,
  clearCells,
  collapseAndRefill,
  createGem,
  findFirstMove,
  gemAt,
  generateBoard,
  hasLegalMove,
  hasMatch,
  matchesOf,
  resolveMatches,
  runLengthBonus,
  scoreCascade,
  swapped,
  uniqueCells,
  type Board,
  type Gem,
} from "./board";

function boardOf(rows: readonly (readonly number[])[]): Board {
  const height = rows.length;
  const width = rows[0]!.length;
  const entries: { x: number; y: number; value: Gem }[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      entries.push({ x, y, value: createGem(rows[y]![x]!) });
    }
  }
  return withCells(createCellGrid<Gem>(width, height), entries);
}

function kindsOf(board: Board): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < board.height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < board.width; x += 1) row.push(gemAt(board, x, y)!.kind);
    rows.push(row);
  }
  return rows;
}

function countFilled(board: Board): number {
  let n = 0;
  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) if (gemAt(board, x, y) !== null) n += 1;
  }
  return n;
}

describe("run detection", () => {
  test("finds a horizontal and a vertical run of three", () => {
    const board = boardOf([
      [0, 0, 0, 1],
      [2, 3, 4, 1],
      [5, 6, 7, 1],
    ]);
    const runs = matchesOf(board);
    expect(hasMatch(board)).toBe(true);
    expect(runs.length).toBe(2);
    const row = runs.find((r) => r.direction === "row");
    const col = runs.find((r) => r.direction === "column");
    expect(row?.value.kind).toBe(0);
    expect(row?.cells.length).toBe(3);
    expect(col?.value.kind).toBe(1);
    expect(col?.cells.length).toBe(3);
    expect(uniqueCells(runs).length).toBe(6);
  });

  test("a checkerboard has no runs", () => {
    const board = boardOf([
      [0, 1, 0],
      [1, 0, 1],
      [0, 1, 0],
    ]);
    expect(hasMatch(board)).toBe(false);
    expect(matchesOf(board).length).toBe(0);
  });

  test("a run of four is detected as a single length-four run", () => {
    const board = boardOf([
      [2, 2, 2, 2],
      [0, 1, 0, 1],
      [1, 0, 1, 0],
      [0, 1, 0, 1],
    ]);
    const runs = matchesOf(board);
    expect(runs.length).toBe(1);
    expect(runs[0]!.cells.length).toBe(4);
  });
});

describe("cascade resolution", () => {
  test("resolves a board with a match down to a stable, fully-filled board", () => {
    const board = boardOf([
      [0, 0, 0, 1, 2],
      [3, 4, 5, 1, 2],
      [3, 4, 5, 6, 0],
      [1, 2, 3, 4, 5],
      [2, 3, 4, 5, 6],
    ]);
    const result = resolveMatches(board, seededRng("cascade"), GEM_KINDS);
    expect(result.cascades).toBeGreaterThanOrEqual(1);
    expect(result.totalCleared).toBeGreaterThanOrEqual(3);
    expect(result.totalScore).toBeGreaterThan(0);
    expect(hasMatch(result.board)).toBe(false);
    expect(countFilled(result.board)).toBe(board.width * board.height);
  });

  test("a swap that creates a run is resolvable and scores points", () => {
    const board = boardOf([
      [0, 1, 0, 0],
      [2, 0, 3, 4],
      [5, 6, 7, 3],
      [1, 2, 4, 5],
    ]);
    const move = findFirstMove(board);
    expect(move).not.toBeNull();
    const swapExists = swapped(board, move!.from, move!.to);
    expect(hasMatch(swapExists)).toBe(true);
    const result = resolveMatches(swapExists, seededRng("swap"), GEM_KINDS);
    expect(result.totalScore).toBeGreaterThan(0);
    expect(hasMatch(result.board)).toBe(false);
  });

  test("chain multiplier escalates the score ×1, ×2, ×3", () => {
    const board = boardOf([
      [4, 4, 4, 0],
      [0, 1, 0, 1],
      [1, 0, 1, 0],
      [0, 1, 0, 1],
    ]);
    const runs = matchesOf(board);
    const s1 = scoreCascade(runs, 1);
    const s2 = scoreCascade(runs, 2);
    const s3 = scoreCascade(runs, 3);
    expect(s1.multiplier).toBe(1);
    expect(s2.multiplier).toBe(2);
    expect(s3.multiplier).toBe(3);
    expect(s2.points).toBe(s1.points * 2);
    expect(s3.points).toBe(s1.points * 3);
  });

  test("longer runs pay a length bonus", () => {
    expect(runLengthBonus(3)).toBe(0);
    expect(runLengthBonus(4)).toBe(20);
    expect(runLengthBonus(5)).toBe(40);
  });
});

describe("no-move detection", () => {
  test("a diagonal-striped board has no legal move", () => {
    // cell(x,y) = (x+y) % GEM_KINDS: every row and column strictly increments,
    // so any single swap can only ever form a pair — never a run of three.
    const size = 6;
    const rows: number[][] = [];
    for (let y = 0; y < size; y += 1) {
      const row: number[] = [];
      for (let x = 0; x < size; x += 1) row.push((x + y) % GEM_KINDS);
      rows.push(row);
    }
    const board = boardOf(rows);
    expect(hasMatch(board)).toBe(false);
    expect(hasLegalMove(board)).toBe(false);
    expect(findFirstMove(board)).toBeNull();
  });

  test("a board with a legal move returns a move that creates a match", () => {
    const board = boardOf([
      [0, 1, 0, 0],
      [2, 0, 3, 4],
      [5, 6, 7, 3],
      [1, 2, 4, 5],
    ]);
    expect(hasLegalMove(board)).toBe(true);
    const move = findFirstMove(board);
    expect(move).not.toBeNull();
    expect(hasMatch(swapped(board, move!.from, move!.to))).toBe(true);
  });
});

describe("board generation invariants", () => {
  const seeds = ["alpha", "bravo", "charlie", "gem-cascade:endless:1", "gem-cascade:timed:7", "42"];

  test("generated boards are full-size, match-free, and always have a legal move", () => {
    for (const seed of seeds) {
      const board = generateBoard(seededRng(seed));
      expect(board.width).toBe(BOARD_SIZE);
      expect(board.height).toBe(BOARD_SIZE);
      expect(hasMatch(board)).toBe(false);
      expect(hasLegalMove(board)).toBe(true);
      expect(countFilled(board)).toBe(BOARD_SIZE * BOARD_SIZE);
      for (let y = 0; y < board.height; y += 1) {
        for (let x = 0; x < board.width; x += 1) {
          const gem = gemAt(board, x, y)!;
          expect(gem.kind).toBeGreaterThanOrEqual(0);
          expect(gem.kind).toBeLessThan(GEM_KINDS);
        }
      }
    }
  });

  test("the same seed generates the same board", () => {
    expect(kindsOf(generateBoard(seededRng("repeat")))).toEqual(kindsOf(generateBoard(seededRng("repeat"))));
  });
});

describe("gravity and refill", () => {
  test("survivors fall to the bottom and vacated cells refill with no gaps", () => {
    const board = boardOf([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
    const cleared = clearCells(board, [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]);
    const refilled = collapseAndRefill(cleared, seededRng("gravity"), GEM_KINDS);
    expect(countFilled(refilled)).toBe(board.width * board.height);
    expect(gemAt(refilled, 0, 2)!.kind).toBe(4);
    expect(gemAt(refilled, 1, 0)!.kind).toBe(1);
    expect(gemAt(refilled, 1, 1)!.kind).toBe(3);
    expect(gemAt(refilled, 1, 2)!.kind).toBe(5);
  });
});
