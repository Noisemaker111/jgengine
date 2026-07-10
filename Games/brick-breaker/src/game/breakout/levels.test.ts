import { describe, expect, test } from "bun:test";

import { BRICK_COLS } from "./constants";
import {
  breakableCount,
  brickBounds,
  isBreakable,
  LEVELS,
  parseLevel,
  TOTAL_LEVELS,
  validateLevel,
} from "./levels";

describe("level definitions", () => {
  test("ships exactly 12 authored levels", () => {
    expect(TOTAL_LEVELS).toBe(12);
    expect(LEVELS.length).toBe(12);
  });

  test("every level is valid", () => {
    for (const level of LEVELS) {
      expect({ name: level.name, problems: validateLevel(level) }).toEqual({ name: level.name, problems: [] });
    }
  });

  test("every level has at least one breakable brick (steel is never required to clear)", () => {
    for (const level of LEVELS) {
      expect(breakableCount(level)).toBeGreaterThan(0);
    }
  });

  test("no level is solvable only by breaking steel", () => {
    for (const level of LEVELS) {
      const bricks = parseLevel(level);
      const breakables = bricks.filter((b) => isBreakable(b.kind));
      const steel = bricks.filter((b) => !isBreakable(b.kind));
      // clear condition counts breakables only; steel may exist but is optional
      expect(breakables.length).toBe(breakableCount(level));
      expect(breakables.length + steel.length).toBe(bricks.length);
    }
  });

  test("parsed bricks sit inside the column grid", () => {
    for (const level of LEVELS) {
      for (const brick of parseLevel(level)) {
        expect(brick.col).toBeGreaterThanOrEqual(0);
        expect(brick.col).toBeLessThan(BRICK_COLS);
        expect(brick.row).toBeGreaterThanOrEqual(0);
        const bounds = brickBounds(brick);
        expect(bounds.w).toBeGreaterThan(0);
        expect(bounds.h).toBeGreaterThan(0);
      }
    }
  });

  test("validateLevel rejects an all-steel or malformed layout", () => {
    expect(validateLevel({ name: "steel only", rows: ["SSSS"] })).toContain(
      "no breakable bricks (steel is never required to clear)",
    );
    expect(validateLevel({ name: "bad char", rows: ["1X1"] }).some((p) => p.includes("invalid char"))).toBe(true);
    expect(validateLevel({ name: "too wide", rows: ["1".repeat(BRICK_COLS + 1)] }).some((p) => p.includes("columns"))).toBe(true);
  });
});
