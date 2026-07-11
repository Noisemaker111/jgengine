import { describe, expect, test } from "bun:test";

import { CELLS, GRID, PRESS_MASKS, indexOf, isSolved, popcount, press } from "./board";

describe("lights-out toggle math", () => {
  test("corner press toggles exactly 3 cells", () => {
    for (const corner of [indexOf(0, 0), indexOf(0, GRID - 1), indexOf(GRID - 1, 0), indexOf(GRID - 1, GRID - 1)]) {
      expect(popcount(PRESS_MASKS[corner])).toBe(3);
    }
  });

  test("edge press toggles exactly 4 cells", () => {
    for (const edge of [indexOf(0, 2), indexOf(2, 0), indexOf(2, GRID - 1), indexOf(GRID - 1, 2)]) {
      expect(popcount(PRESS_MASKS[edge])).toBe(4);
    }
  });

  test("interior press toggles exactly 5 cells", () => {
    expect(popcount(PRESS_MASKS[indexOf(2, 2)])).toBe(5);
    expect(popcount(PRESS_MASKS[indexOf(1, 3)])).toBe(5);
  });

  test("top-left corner toggles itself plus its two orthogonal neighbors", () => {
    expect(PRESS_MASKS[indexOf(0, 0)]).toBe((1 << indexOf(0, 0)) | (1 << indexOf(0, 1)) | (1 << indexOf(1, 0)));
  });

  test("pressing any cell twice restores the board", () => {
    for (let cell = 0; cell < CELLS; cell += 1) expect(press(press(0, cell), cell)).toBe(0);
  });

  test("a single interior press lights the board, pressing again clears it", () => {
    const board = press(0, indexOf(2, 2));
    expect(isSolved(board)).toBe(false);
    expect(litOf(board)).toBe(5);
    expect(isSolved(press(board, indexOf(2, 2)))).toBe(true);
  });
});

function litOf(board: number): number {
  return popcount(board);
}
