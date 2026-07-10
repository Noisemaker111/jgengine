import { describe, expect, test } from "bun:test";
import type { StripSegment } from "./course";
import { resolveRepelLanding } from "./repel";

describe("repel trajectory", () => {
  test("lands on the opposite surface when it holds the bot's polarity", () => {
    const strips: StripSegment[] = [
      { surface: "floor", lane: 1, fromZ: 0, toZ: 10, polarity: "red" },
      { surface: "ceiling", lane: 1, fromZ: 0, toZ: 10, polarity: "blue" },
    ];
    const result = resolveRepelLanding(strips, "floor", 1, 5, "red");
    expect(result).toEqual({ landed: "opposite-surface", surface: "ceiling" });
  });

  test("falls when the opposite surface has no strip", () => {
    const strips: StripSegment[] = [{ surface: "floor", lane: 1, fromZ: 0, toZ: 10, polarity: "red" }];
    const result = resolveRepelLanding(strips, "floor", 1, 5, "red");
    expect(result).toEqual({ landed: "none" });
  });

  test("falls when the opposite surface strip also matches (would repel again)", () => {
    const strips: StripSegment[] = [
      { surface: "floor", lane: 1, fromZ: 0, toZ: 10, polarity: "red" },
      { surface: "ceiling", lane: 1, fromZ: 0, toZ: 10, polarity: "red" },
    ];
    const result = resolveRepelLanding(strips, "floor", 1, 5, "red");
    expect(result).toEqual({ landed: "none" });
  });

  test("works symmetrically from ceiling back to floor", () => {
    const strips: StripSegment[] = [
      { surface: "ceiling", lane: 2, fromZ: 0, toZ: 10, polarity: "blue" },
      { surface: "floor", lane: 2, fromZ: 0, toZ: 10, polarity: "red" },
    ];
    const result = resolveRepelLanding(strips, "ceiling", 2, 3, "blue");
    expect(result).toEqual({ landed: "opposite-surface", surface: "floor" });
  });
});
