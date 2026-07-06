import { describe, expect, test } from "bun:test";
import {
  CHARACTER_MAX_LEVEL,
  resolveLevelProgress,
  xpRequiredForLevel,
} from "./curves";

describe("xpRequiredForLevel", () => {
  test("level 1 requires 100 xp", () => {
    expect(xpRequiredForLevel(1)).toBe(100);
  });

  test("strictly increases per level", () => {
    for (let level = 1; level < CHARACTER_MAX_LEVEL; level += 1) {
      expect(xpRequiredForLevel(level + 1)).toBeGreaterThan(xpRequiredForLevel(level));
    }
  });
});

describe("resolveLevelProgress", () => {
  test("keeps level when xp is below the threshold", () => {
    expect(resolveLevelProgress(1, 50)).toEqual({ level: 1, xp: 50, xpMax: 100, levelsGained: 0 });
  });

  test("levels up once and carries the remainder", () => {
    const progress = resolveLevelProgress(1, 130);
    expect(progress.level).toBe(2);
    expect(progress.xp).toBe(30);
    expect(progress.xpMax).toBe(xpRequiredForLevel(2));
    expect(progress.levelsGained).toBe(1);
  });

  test("chains multiple level-ups from one grant", () => {
    const total = xpRequiredForLevel(1) + xpRequiredForLevel(2) + 10;
    const progress = resolveLevelProgress(1, total);
    expect(progress.level).toBe(3);
    expect(progress.xp).toBe(10);
    expect(progress.levelsGained).toBe(2);
  });

  test("zeroes xp at the level cap", () => {
    const progress = resolveLevelProgress(CHARACTER_MAX_LEVEL - 1, 10_000_000);
    expect(progress.level).toBe(CHARACTER_MAX_LEVEL);
    expect(progress.xp).toBe(0);
  });
});
