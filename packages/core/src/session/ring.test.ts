import { describe, expect, test } from "bun:test";

import { createRing, ringSampleAt, type RingConfig } from "./ring";

const config: RingConfig = {
  center: [0, 0],
  phases: [
    { startTime: 60, shrinkDuration: 30, fromRadius: 100, toRadius: 50, damagePerSecond: 1 },
    { startTime: 120, shrinkDuration: 30, fromRadius: 50, toRadius: 20, damagePerSecond: 2, center: [10, 0] },
  ],
};

describe("shrinking ring", () => {
  test("before the first phase the ring is full and harmless", () => {
    const sample = ringSampleAt(config, 0);
    expect(sample.radius).toBe(100);
    expect(sample.damagePerSecond).toBe(0);
    expect(sample.phase).toBe(-1);
    expect(sample.shrinking).toBe(false);
  });

  test("radius interpolates linearly during a shrink window", () => {
    expect(ringSampleAt(config, 60).radius).toBeCloseTo(100, 5);
    expect(ringSampleAt(config, 75).radius).toBeCloseTo(75, 5);
    expect(ringSampleAt(config, 90).radius).toBeCloseTo(50, 5);
    expect(ringSampleAt(config, 75).shrinking).toBe(true);
    expect(ringSampleAt(config, 90).shrinking).toBe(false);
  });

  test("the ring holds at the target radius between phases", () => {
    const sample = ringSampleAt(config, 110);
    expect(sample.radius).toBe(50);
    expect(sample.damagePerSecond).toBe(1);
  });

  test("center drifts toward the next phase center as it shrinks", () => {
    expect(ringSampleAt(config, 120).center).toEqual([0, 0]);
    expect(ringSampleAt(config, 135).center[0]).toBeCloseTo(5, 5);
    expect(ringSampleAt(config, 150).center).toEqual([10, 0]);
    expect(ringSampleAt(config, 135).radius).toBeCloseTo(35, 5);
  });

  test("isOutside / distanceOutside measure against the live radius", () => {
    const ring = createRing(config);
    expect(ring.isOutside(90, [60, 0])).toBe(true);
    expect(ring.isOutside(90, [10, 0])).toBe(false);
    expect(ring.distanceOutside(90, [60, 0])).toBeCloseTo(10, 5);
    expect(ring.distanceOutside(90, [10, 0])).toBe(0);
  });

  test("damageOutside applies dot to entities beyond the ring only", () => {
    const ring = createRing(config);
    const hits = ring.damageOutside(90, 2, [
      { id: "a", position: [60, 0] },
      { id: "b", position: [10, 0] },
    ]);
    expect(hits).toEqual([{ id: "a", damage: 2, distanceOutside: 10 }]);
  });

  test("no damage before the ring is armed", () => {
    const ring = createRing(config);
    expect(ring.damageOutside(0, 2, [{ id: "a", position: [500, 0] }])).toEqual([]);
  });
});
