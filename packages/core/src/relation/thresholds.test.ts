import { describe, expect, test } from "bun:test";
import {
  crossThresholds,
  tierAt,
  type ThresholdBoundary,
} from "@jgengine/core/relation/thresholds";

const BANDS: ThresholdBoundary[] = [
  { id: "friends", at: 35 },
  { id: "close", at: 70 },
  { id: "bonded", at: 95 },
];

describe("crossThresholds", () => {
  test("reports a single upward crossing", () => {
    const crossings = crossThresholds(BANDS, 30, 40);
    expect(crossings).toEqual([{ id: "friends", at: 35, direction: "up" }]);
  });

  test("reports a single downward crossing", () => {
    const crossings = crossThresholds(BANDS, 40, 10);
    expect(crossings).toEqual([{ id: "friends", at: 35, direction: "down" }]);
  });

  test("a large upward jump reports every boundary in ascending order", () => {
    const crossings = crossThresholds(BANDS, -5, 100);
    expect(crossings.map((c) => c.id)).toEqual(["friends", "close", "bonded"]);
    expect(crossings.every((c) => c.direction === "up")).toBe(true);
  });

  test("a large downward jump reports every boundary in descending order", () => {
    const crossings = crossThresholds(BANDS, 100, -5);
    expect(crossings.map((c) => c.id)).toEqual(["bonded", "close", "friends"]);
    expect(crossings.every((c) => c.direction === "down")).toBe(true);
  });

  test("exact-boundary landing counts as reached when inclusive (default)", () => {
    expect(crossThresholds(BANDS, 34, 35).map((c) => c.id)).toEqual(["friends"]);
    // Falling exactly onto the boundary keeps you above it, so no down crossing.
    expect(crossThresholds(BANDS, 40, 35)).toEqual([]);
  });

  test("exclusive mode treats the boundary as reached only past it", () => {
    expect(crossThresholds(BANDS, 34, 35, { inclusive: false })).toEqual([]);
    expect(crossThresholds(BANDS, 35, 36, { inclusive: false }).map((c) => c.id)).toEqual([
      "friends",
    ]);
  });

  test("a zero-width move reports nothing", () => {
    expect(crossThresholds(BANDS, 50, 50)).toEqual([]);
  });

  test("repeated movement fires each crossing exactly once per call", () => {
    const state = { value: 30 };
    const fired: string[] = [];
    const bump = (delta: number) => {
      const before = state.value;
      state.value += delta;
      for (const crossing of crossThresholds(BANDS, before, state.value)) fired.push(crossing.id);
    };
    bump(10); // 30 -> 40 crosses friends
    bump(10); // 40 -> 50 crosses nothing
    bump(40); // 50 -> 90 crosses close
    bump(10); // 90 -> 100 crosses bonded
    expect(fired).toEqual(["friends", "close", "bonded"]);
  });

  test("hysteresis suppresses flapping around a boundary", () => {
    // Rising: must reach at + hysteresis (35 + 5 = 40) to count.
    expect(crossThresholds(BANDS, 34, 38, { hysteresis: 5 })).toEqual([]);
    expect(crossThresholds(BANDS, 34, 41, { hysteresis: 5 }).map((c) => c.id)).toEqual(["friends"]);
    // Falling: must drop below at - hysteresis (30) to count.
    expect(crossThresholds(BANDS, 50, 32, { hysteresis: 5 })).toEqual([]);
    expect(crossThresholds(BANDS, 50, 29, { hysteresis: 5 }).map((c) => c.id)).toEqual(["friends"]);
  });

  test("unsorted boundaries still report in travel order", () => {
    const shuffled: ThresholdBoundary[] = [
      { id: "bonded", at: 95 },
      { id: "friends", at: 35 },
      { id: "close", at: 70 },
    ];
    expect(crossThresholds(shuffled, 0, 100).map((c) => c.id)).toEqual(["friends", "close", "bonded"]);
  });
});

describe("tierAt", () => {
  test("returns the highest band at or below the value", () => {
    expect(tierAt(BANDS, 10)).toBeNull();
    expect(tierAt(BANDS, 35)?.id).toBe("friends");
    expect(tierAt(BANDS, 69)?.id).toBe("friends");
    expect(tierAt(BANDS, 70)?.id).toBe("close");
    expect(tierAt(BANDS, 9999)?.id).toBe("bonded");
  });

  test("exclusive mode excludes exact boundary values", () => {
    expect(tierAt(BANDS, 35, { inclusive: false })).toBeNull();
    expect(tierAt(BANDS, 36, { inclusive: false })?.id).toBe("friends");
  });
});
