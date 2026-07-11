import { describe, expect, test } from "bun:test";

import { COLS, HOME_ROW, HOME_TOLERANCE, OFF_MAX, OFF_MIN, START_ROW } from "./constants";
import {
  bodyCoversCentre,
  footprintsOverlap,
  isBayAligned,
  isOffField,
  isRiverRow,
  isRoadRow,
  isSafeRow,
  nearestBay,
  resolveHop,
  snapCol,
} from "./grid";

describe("hop grid + bounds", () => {
  test("forward and lateral hops move one cell", () => {
    expect(resolveHop({ col: 6, row: 0 }, "up")).toEqual({ col: 6, row: 1 });
    expect(resolveHop({ col: 6, row: 2 }, "down")).toEqual({ col: 6, row: 1 });
    expect(resolveHop({ col: 6, row: 3 }, "left")).toEqual({ col: 5, row: 3 });
    expect(resolveHop({ col: 6, row: 3 }, "right")).toEqual({ col: 7, row: 3 });
  });

  test("edges block the hop (returns null)", () => {
    expect(resolveHop({ col: 6, row: START_ROW }, "down")).toBeNull();
    expect(resolveHop({ col: 6, row: HOME_ROW }, "up")).toBeNull();
    expect(resolveHop({ col: 0, row: 3 }, "left")).toBeNull();
    expect(resolveHop({ col: COLS - 1, row: 3 }, "right")).toBeNull();
  });

  test("lateral hops preserve a fractional (riding) column", () => {
    expect(resolveHop({ col: 4.3, row: 8 }, "right")).toEqual({ col: 5.3, row: 8 });
    expect(resolveHop({ col: 0.4, row: 8 }, "left")).toBeNull();
  });

  test("row classification", () => {
    expect(isRoadRow(3)).toBe(true);
    expect(isRoadRow(6)).toBe(false);
    expect(isRiverRow(9)).toBe(true);
    expect(isRiverRow(5)).toBe(false);
    expect(isSafeRow(0)).toBe(true);
    expect(isSafeRow(6)).toBe(true);
    expect(isSafeRow(3)).toBe(false);
  });

  test("snapCol clamps and rounds into the field", () => {
    expect(snapCol(4.4)).toBe(4);
    expect(snapCol(-2)).toBe(0);
    expect(snapCol(99)).toBe(COLS - 1);
  });

  test("off-field detection for riders", () => {
    expect(isOffField(6)).toBe(false);
    expect(isOffField(OFF_MIN - 0.1)).toBe(true);
    expect(isOffField(OFF_MAX + 0.1)).toBe(true);
  });

  test("bay alignment tolerance", () => {
    expect(nearestBay(3.1).col).toBe(3);
    expect(isBayAligned(3.0)).toBe(true);
    expect(isBayAligned(3 + HOME_TOLERANCE - 0.01)).toBe(true);
    expect(isBayAligned(1.6)).toBe(false);
  });

  test("footprint overlap and centre coverage primitives", () => {
    expect(footprintsOverlap(5, 4, 2)).toBe(true);
    expect(footprintsOverlap(5, 8, 2)).toBe(false);
    expect(bodyCoversCentre(5, 4, 3)).toBe(true);
    expect(bodyCoversCentre(5, 8, 3)).toBe(false);
  });
});
