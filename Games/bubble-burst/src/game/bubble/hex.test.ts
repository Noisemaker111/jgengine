import { describe, expect, test } from "bun:test";

import { cellKey, cellX, cellY, colsInRow, nearestCell, neighbors } from "./hex";

function keys(cells: { row: number; col: number }[]): string[] {
  return cells.map((c) => cellKey(c.row, c.col)).sort();
}

describe("hex", () => {
  test("row parity sets column counts", () => {
    expect(colsInRow(0)).toBe(8);
    expect(colsInRow(1)).toBe(7);
    expect(colsInRow(2)).toBe(8);
  });

  test("even-row neighbours shift diagonals left", () => {
    expect(keys(neighbors(2, 3))).toEqual(
      keys([
        { row: 2, col: 2 },
        { row: 2, col: 4 },
        { row: 1, col: 2 },
        { row: 1, col: 3 },
        { row: 3, col: 2 },
        { row: 3, col: 3 },
      ]),
    );
  });

  test("odd-row neighbours shift diagonals right", () => {
    expect(keys(neighbors(3, 3))).toEqual(
      keys([
        { row: 3, col: 2 },
        { row: 3, col: 4 },
        { row: 2, col: 3 },
        { row: 2, col: 4 },
        { row: 4, col: 3 },
        { row: 4, col: 4 },
      ]),
    );
  });

  test("corner neighbours drop out-of-bounds cells", () => {
    expect(keys(neighbors(0, 0))).toEqual(
      keys([
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ]),
    );
  });

  test("snaps a point back to its own even/odd cell", () => {
    for (const [row, col] of [
      [0, 0],
      [2, 3],
      [3, 4],
      [4, 7],
    ] as const) {
      const exact = nearestCell(cellX(row, col), cellY(row));
      expect([exact.row, exact.col]).toEqual([row, col]);
      const nudged = nearestCell(cellX(row, col) + 4, cellY(row) - 3);
      expect([nudged.row, nudged.col]).toEqual([row, col]);
    }
  });
});
