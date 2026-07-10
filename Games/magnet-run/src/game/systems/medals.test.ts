import { describe, expect, test } from "bun:test";
import { DEFAULT_MEDAL_THRESHOLDS, medalForTime } from "./medals";

describe("medal timing", () => {
  test("under the gold threshold is gold", () => {
    expect(medalForTime(DEFAULT_MEDAL_THRESHOLDS.gold - 1)).toBe("gold");
  });
  test("exactly on a threshold counts for that tier", () => {
    expect(medalForTime(DEFAULT_MEDAL_THRESHOLDS.gold)).toBe("gold");
    expect(medalForTime(DEFAULT_MEDAL_THRESHOLDS.silver)).toBe("silver");
    expect(medalForTime(DEFAULT_MEDAL_THRESHOLDS.bronze)).toBe("bronze");
  });
  test("between gold and silver is silver", () => {
    expect(medalForTime(DEFAULT_MEDAL_THRESHOLDS.gold + 1)).toBe("silver");
  });
  test("beyond bronze is none", () => {
    expect(medalForTime(DEFAULT_MEDAL_THRESHOLDS.bronze + 1)).toBe("none");
  });
});
