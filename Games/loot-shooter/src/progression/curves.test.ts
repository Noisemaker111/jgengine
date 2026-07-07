import { describe, expect, test } from "bun:test";
import { MAX_LEVEL, resolveLevelProgress, xpRequiredForLevel } from "./curves";

describe("xpRequiredForLevel", () => {
  test("level 1 requires 80 xp", () => {
    expect(xpRequiredForLevel(1)).toBe(80);
  });

  test("strictly increases per level", () => {
    for (let level = 1; level < MAX_LEVEL; level += 1) {
      expect(xpRequiredForLevel(level + 1)).toBeGreaterThan(xpRequiredForLevel(level));
    }
  });
});

describe("resolveLevelProgress", () => {
  test("keeps level when xp is below the threshold", () => {
    expect(resolveLevelProgress(1, 40)).toEqual({ level: 1, xp: 40, xpMax: 80, levelsGained: 0 });
  });

  test("levels up once and carries the remainder", () => {
    const progress = resolveLevelProgress(1, 100);
    expect(progress.level).toBe(2);
    expect(progress.xp).toBe(20);
    expect(progress.xpMax).toBe(xpRequiredForLevel(2));
    expect(progress.levelsGained).toBe(1);
  });

  test("chains multiple level-ups from one grant", () => {
    const total = xpRequiredForLevel(1) + xpRequiredForLevel(2) + 5;
    const progress = resolveLevelProgress(1, total);
    expect(progress.level).toBe(3);
    expect(progress.xp).toBe(5);
    expect(progress.levelsGained).toBe(2);
  });

  test("zeroes xp at the level cap", () => {
    const progress = resolveLevelProgress(MAX_LEVEL - 1, 10_000_000);
    expect(progress.level).toBe(MAX_LEVEL);
    expect(progress.xp).toBe(0);
  });
});
