import { describe, expect, test } from "bun:test";
import { computeLevelScore, levelCleared, starsForScore } from "./scoring";

describe("levelCleared", () => {
  test("requires every target destroyed", () => {
    expect(levelCleared({ targetsDestroyed: 2, targetsTotal: 3, shotsUsed: 1, shotsMax: 3 })).toBe(false);
    expect(levelCleared({ targetsDestroyed: 3, targetsTotal: 3, shotsUsed: 3, shotsMax: 3 })).toBe(true);
  });

  test("an empty level is never cleared", () => {
    expect(levelCleared({ targetsDestroyed: 0, targetsTotal: 0, shotsUsed: 0, shotsMax: 3 })).toBe(false);
  });
});

describe("computeLevelScore", () => {
  test("scores 0 when the level was not cleared", () => {
    expect(computeLevelScore({ targetsDestroyed: 1, targetsTotal: 3, shotsUsed: 3, shotsMax: 3 })).toBe(0);
  });

  test("rewards unused shots on a clear", () => {
    const tight = computeLevelScore({ targetsDestroyed: 3, targetsTotal: 3, shotsUsed: 3, shotsMax: 3 });
    const efficient = computeLevelScore({ targetsDestroyed: 3, targetsTotal: 3, shotsUsed: 1, shotsMax: 3 });
    expect(efficient).toBeGreaterThan(tight);
    expect(tight).toBe(3 * 100);
    expect(efficient).toBe(3 * 100 + 2 * 50);
  });
});

describe("starsForScore", () => {
  test("0 score is 0 stars, a perfect clear is 3", () => {
    expect(starsForScore(0, 3, 3)).toBe(0);
    expect(starsForScore(3 * 100 + 2 * 50, 3, 3)).toBe(3);
  });

  test("a clear with all shots spent still earns at least 1 star", () => {
    expect(starsForScore(3 * 100, 3, 3)).toBeGreaterThanOrEqual(1);
  });
});
