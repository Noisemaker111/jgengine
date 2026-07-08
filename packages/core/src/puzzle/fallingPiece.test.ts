import { describe, expect, test } from "bun:test";

import { createCellGrid, cellAt } from "./cellGrid";
import {
  createLockDelay,
  dropDistance,
  gravityInterval,
  levelForLines,
  lineScore,
  mergePiece,
  pieceCells,
  pieceCollides,
  stepLockDelay,
  type ShapeTable,
} from "./fallingPiece";

type Shape = "square" | "bar";

const TABLE: ShapeTable<Shape> = {
  square: [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
  ],
  bar: [
    [[0, 0], [1, 0], [2, 0], [3, 0]],
    [[0, 0], [0, 1], [0, 2], [0, 3]],
  ],
};

describe("pieceCells", () => {
  test("offsets rotation cells by the piece position", () => {
    const cells = pieceCells(TABLE, { shape: "square", rotation: 0, x: 3, y: 2 });
    expect(cells).toEqual([[3, 2], [4, 2], [3, 3], [4, 3]]);
  });

  test("wraps rotation by the shape's own rotation count, not a fixed 4", () => {
    const cells = pieceCells(TABLE, { shape: "bar", rotation: 2, x: 0, y: 0 });
    expect(cells).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });
});

describe("pieceCollides", () => {
  test("allows a piece above the visible grid", () => {
    const grid = createCellGrid<string>(6, 6);
    expect(pieceCollides(grid, TABLE, { shape: "square", rotation: 0, x: 0, y: -3 })).toBe(false);
  });

  test("detects wall and floor collisions", () => {
    const grid = createCellGrid<string>(4, 4);
    expect(pieceCollides(grid, TABLE, { shape: "square", rotation: 0, x: -1, y: 0 })).toBe(true);
    expect(pieceCollides(grid, TABLE, { shape: "square", rotation: 0, x: 3, y: 0 })).toBe(true);
    expect(pieceCollides(grid, TABLE, { shape: "square", rotation: 0, x: 0, y: 3 })).toBe(true);
  });

  test("detects overlap with occupied cells", () => {
    const grid = createCellGrid<string>(4, 4);
    const stacked = mergePiece(grid, TABLE, { shape: "square", rotation: 0, x: 0, y: 2 }, "X");
    expect(pieceCollides(stacked, TABLE, { shape: "square", rotation: 0, x: 0, y: 2 })).toBe(true);
  });
});

describe("mergePiece", () => {
  test("stamps the piece's cells with the given value", () => {
    const grid = createCellGrid<string>(4, 4);
    const merged = mergePiece(grid, TABLE, { shape: "square", rotation: 0, x: 1, y: 1 }, "X");
    expect(cellAt(merged, 1, 1)).toBe("X");
    expect(cellAt(merged, 2, 2)).toBe("X");
    expect(cellAt(merged, 0, 0)).toBeNull();
  });
});

describe("dropDistance", () => {
  test("lands a piece on the floor", () => {
    const grid = createCellGrid<string>(4, 6);
    const distance = dropDistance(grid, TABLE, { shape: "square", rotation: 0, x: 0, y: 0 });
    expect(distance).toBe(4);
  });

  test("stops on top of stacked cells", () => {
    const grid = createCellGrid<string>(4, 6);
    const stacked = mergePiece(grid, TABLE, { shape: "square", rotation: 0, x: 0, y: 4 }, "X");
    const distance = dropDistance(stacked, TABLE, { shape: "square", rotation: 0, x: 0, y: 0 });
    expect(distance).toBe(2);
  });
});

describe("scoring and gravity", () => {
  test("classic line score scales with cleared count and level", () => {
    expect(lineScore(1, 0)).toBe(40);
    expect(lineScore(4, 0)).toBe(1200);
    expect(lineScore(4, 1)).toBe(2400);
    expect(lineScore(0, 5)).toBe(0);
  });

  test("level advances every ten lines by default", () => {
    expect(levelForLines(9)).toBe(0);
    expect(levelForLines(10)).toBe(1);
  });

  test("gravity accelerates with level and is floored at the minimum", () => {
    expect(gravityInterval(0)).toBeGreaterThan(gravityInterval(3));
    expect(gravityInterval(100)).toBeGreaterThanOrEqual(0.05);
  });
});

describe("lock delay", () => {
  test("a zero delay locks instantly once grounded", () => {
    const state = createLockDelay(0);
    const result = stepLockDelay(state, true, 0.016);
    expect(result.locked).toBe(true);
  });

  test("a positive delay waits before locking and resets on release", () => {
    const state = createLockDelay(0.5);
    const first = stepLockDelay(state, true, 0.3);
    expect(first.locked).toBe(false);
    const released = stepLockDelay(first.state, false, 0.1);
    expect(released.locked).toBe(false);
    expect(released.state.elapsed).toBe(0);
    const second = stepLockDelay(released.state, true, 0.3);
    expect(second.locked).toBe(false);
    const third = stepLockDelay(second.state, true, 0.3);
    expect(third.locked).toBe(true);
  });
});
