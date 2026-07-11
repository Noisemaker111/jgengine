import { describe, expect, test } from "bun:test";

import {
  canMove,
  emptyCells,
  hasWon,
  isGameOver,
  slide,
  valueGrid,
  type Tile,
} from "./board";

function fromGrid(grid: number[][]): Tile[] {
  const tiles: Tile[] = [];
  let id = 1;
  grid.forEach((rowArr, r) =>
    rowArr.forEach((v, c) => {
      if (v > 0) tiles.push({ id: id++, value: v, row: r, col: c, merged: false, isNew: false, anim: 0 });
    }),
  );
  return tiles;
}

const EMPTY_ROW = [0, 0, 0, 0];

describe("slide", () => {
  test("compacts and merges to the left", () => {
    const { tiles, moved, gained } = slide(fromGrid([[2, 2, 4, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]), "left", 1);
    expect(moved).toBe(true);
    expect(gained).toBe(4);
    expect(valueGrid(tiles)[0]).toEqual([4, 4, 0, 0]);
  });

  test("merges each pair only once per move (no double merge)", () => {
    const { tiles, gained } = slide(fromGrid([[2, 2, 2, 2], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]), "left", 1);
    expect(valueGrid(tiles)[0]).toEqual([4, 4, 0, 0]);
    expect(gained).toBe(8);
  });

  test("slides right against the far wall", () => {
    const { tiles } = slide(fromGrid([[0, 2, 0, 2], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]), "right", 1);
    expect(valueGrid(tiles)[0]).toEqual([0, 0, 0, 4]);
  });

  test("merges down a column", () => {
    const { tiles, gained } = slide(fromGrid([[4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), "down", 1);
    expect(valueGrid(tiles).map((row) => row[0])).toEqual([0, 0, 0, 8]);
    expect(gained).toBe(8);
  });

  test("keeps a settled tile ahead from merging a third equal tile", () => {
    const { tiles, gained } = slide(fromGrid([[2, 2, 2, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]), "left", 1);
    expect(valueGrid(tiles)[0]).toEqual([4, 2, 0, 0]);
    expect(gained).toBe(4);
  });

  test("reports no movement when nothing can slide or merge", () => {
    const { moved, gained } = slide(fromGrid([[2, 4, 8, 16], [16, 8, 4, 2], [2, 4, 8, 16], [16, 8, 4, 2]]), "left", 1);
    expect(moved).toBe(false);
    expect(gained).toBe(0);
  });

  test("flags merged survivors with the given animation generation", () => {
    const { tiles } = slide(fromGrid([[8, 8, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]), "left", 7);
    const survivor = tiles.find((t) => t.value === 16);
    expect(survivor?.merged).toBe(true);
    expect(survivor?.anim).toBe(7);
  });
});

describe("emptyCells / canMove / isGameOver", () => {
  test("counts open cells", () => {
    expect(emptyCells(fromGrid([[2, 0, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]))).toHaveLength(15);
  });

  test("game is over only on a full board with no adjacent equals", () => {
    const stuck = fromGrid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
    expect(canMove(stuck)).toBe(false);
    expect(isGameOver(stuck)).toBe(true);

    const mergeable = fromGrid([[2, 2, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
    expect(isGameOver(mergeable)).toBe(false);
  });

  test("a board with any empty cell is never game over", () => {
    expect(isGameOver(fromGrid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]]))).toBe(false);
  });
});

describe("hasWon", () => {
  test("true once any tile reaches 2048", () => {
    expect(hasWon(fromGrid([[2048, 0, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]))).toBe(true);
    expect(hasWon(fromGrid([[1024, 0, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]))).toBe(false);
  });
});
