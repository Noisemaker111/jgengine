import { describe, expect, test } from "bun:test";
import type { Vec3 } from "@jgengine/core/visibility/bounds";
import { distanceSquared, distance, culledByDistance } from "@jgengine/core/visibility/distance";

describe("distanceSquared / distance", () => {
  test("distanceSquared sums squared per-axis deltas", () => {
    expect(distanceSquared(0, 0, 0, 3, 4, 0)).toBe(25);
  });

  test("distance is the square root of distanceSquared", () => {
    const a: Vec3 = [0, 0, 0];
    const b: Vec3 = [3, 4, 0];
    expect(distance(a, b)).toBe(5);
  });

  test("distance between a point and itself is zero", () => {
    const p: Vec3 = [1, 2, 3];
    expect(distance(p, p)).toBe(0);
  });
});

describe("culledByDistance", () => {
  test("an object inside the min/max band is not culled", () => {
    const culled = culledByDistance(0, 0, 0, 0, 0, 50, 10, 100);
    expect(culled).toBe(false);
  });

  test("an object closer than minDistance is culled", () => {
    const culled = culledByDistance(0, 0, 0, 0, 0, 5, 10, 100);
    expect(culled).toBe(true);
  });

  test("an object farther than maxDistance is culled", () => {
    const culled = culledByDistance(0, 0, 0, 0, 0, 150, 10, 100);
    expect(culled).toBe(true);
  });

  test("radius pulls the near surface outward, culling an otherwise-inside object", () => {
    expect(culledByDistance(0, 0, 0, 0, 0, 12, 10, 100)).toBe(false);
    expect(culledByDistance(0, 0, 0, 0, 0, 12, 10, 100, 5)).toBe(true);
  });

  test("radius pulls the far surface outward, un-culling an otherwise-outside object", () => {
    expect(culledByDistance(0, 0, 0, 0, 0, 103, 10, 100)).toBe(true);
    expect(culledByDistance(0, 0, 0, 0, 0, 103, 10, 100, 5)).toBe(false);
  });

  test("hysteresis widens the max band for objects near the boundary", () => {
    expect(culledByDistance(0, 0, 0, 0, 0, 105, 10, 100)).toBe(true);
    expect(culledByDistance(0, 0, 0, 0, 0, 105, 10, 100, 0, 10)).toBe(false);
  });

  test("an Infinity maxDistance never culls on the far side", () => {
    const culled = culledByDistance(0, 0, 0, 0, 0, 1e9, 10, Number.POSITIVE_INFINITY);
    expect(culled).toBe(false);
  });
});
