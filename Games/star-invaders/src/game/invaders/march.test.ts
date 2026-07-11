import { describe, expect, test } from "bun:test";

import { COLS, MARCH_FLOOR, MARCH_SLOW, ROWS, STEP_X, STEP_Y } from "./constants";
import { aliveColumnRange, countAlive, marchInterval, stepFormation, type AliveGrid } from "./march";

function grid(fill: boolean): boolean[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => fill));
}

describe("formation column range", () => {
  test("full grid spans every column", () => {
    expect(aliveColumnRange(grid(true))).toEqual({ minCol: 0, maxCol: COLS - 1 });
  });

  test("empty grid has no range", () => {
    expect(aliveColumnRange(grid(false))).toBeNull();
  });

  test("range tracks the surviving edge columns", () => {
    const g = grid(true);
    for (let r = 0; r < ROWS; r += 1) {
      g[r]![0] = false;
      g[r]![COLS - 1] = false;
    }
    expect(aliveColumnRange(g)).toEqual({ minCol: 1, maxCol: COLS - 2 });
  });
});

describe("march / reverse / descend", () => {
  const range = { minCol: 0, maxCol: COLS - 1 };

  test("marches horizontally when clear of the wall", () => {
    const step = stepFormation({ originX: 26, dir: 1 }, range);
    expect(step.descended).toBe(false);
    expect(step.dropY).toBe(0);
    expect(step.dir).toBe(1);
    expect(step.originX).toBe(26 + STEP_X);
  });

  test("reverses and drops at the right wall without moving x", () => {
    const step = stepFormation({ originX: 42, dir: 1 }, range);
    expect(step.descended).toBe(true);
    expect(step.dir).toBe(-1);
    expect(step.dropY).toBe(STEP_Y);
    expect(step.originX).toBe(42);
  });

  test("reverses and drops at the left wall", () => {
    const step = stepFormation({ originX: 10, dir: -1 }, range);
    expect(step.descended).toBe(true);
    expect(step.dir).toBe(1);
    expect(step.dropY).toBe(STEP_Y);
    expect(step.originX).toBe(10);
  });
});

describe("tempo curve", () => {
  const total = ROWS * COLS;

  test("fewer aliens march faster than a full grid", () => {
    const full = marchInterval(total, total, 1);
    const few = marchInterval(3, total, 1);
    expect(few).toBeLessThan(full);
  });

  test("later waves march faster at the same population", () => {
    expect(marchInterval(total, total, 4)).toBeLessThan(marchInterval(total, total, 1));
  });

  test("a full first-wave grid sits near the slow ceiling", () => {
    expect(marchInterval(total, total, 1)).toBeCloseTo(MARCH_SLOW, 5);
  });

  test("interval never drops below the floor", () => {
    expect(marchInterval(1, total, 20)).toBeGreaterThanOrEqual(MARCH_FLOOR);
  });

  test("monotonically speeds up as the grid thins", () => {
    let prev = Infinity;
    for (const alive of [total, 40, 20, 10, 3, 1]) {
      const value = marchInterval(alive, total, 1);
      expect(value).toBeLessThanOrEqual(prev);
      prev = value;
    }
  });
});

describe("population count", () => {
  test("counts every live cell", () => {
    const g: AliveGrid = grid(true);
    expect(countAlive(g)).toBe(ROWS * COLS);
  });
});
