import { describe, expect, test } from "bun:test";

import { cellKey } from "./hex";
import { findFloating, floodMatch, type Grid } from "./match";

function grid(cells: [number, number, number][]): Grid {
  const g: Grid = new Map();
  for (const [row, col, color] of cells) g.set(cellKey(row, col), { row, col, color });
  return g;
}

describe("floodMatch", () => {
  test("gathers a connected same-colour run", () => {
    const g = grid([
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
      [0, 3, 1],
    ]);
    expect(floodMatch(g, 0, 0)).toHaveLength(3);
  });

  test("crosses rows but stops at a colour boundary", () => {
    const g = grid([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 1],
    ]);
    expect(floodMatch(g, 0, 0)).toHaveLength(2);
  });

  test("a lone bubble is a group of one", () => {
    expect(floodMatch(grid([[2, 2, 3]]), 2, 2)).toHaveLength(1);
  });
});

describe("findFloating", () => {
  test("returns bubbles cut off from the ceiling", () => {
    const g = grid([
      [0, 0, 0],
      [1, 0, 0],
      [3, 4, 1],
      [3, 5, 1],
    ]);
    const floating = findFloating(g).map((c) => cellKey(c.row, c.col)).sort();
    expect(floating).toEqual([cellKey(3, 4), cellKey(3, 5)].sort());
  });

  test("keeps a ceiling-anchored column", () => {
    const g = grid([
      [0, 2, 0],
      [1, 2, 0],
      [2, 2, 0],
    ]);
    expect(findFloating(g)).toHaveLength(0);
  });
});
