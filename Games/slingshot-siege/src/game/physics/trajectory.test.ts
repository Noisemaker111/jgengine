import { describe, expect, test } from "bun:test";
import { clampPull, launchVelocity, pullFraction, sampleTrajectory, type Vec3 } from "./trajectory";

const ANCHOR: Vec3 = [0, 1.2, 0];

describe("clampPull", () => {
  test("keeps a pull within the max radius unchanged", () => {
    const pulled: Vec3 = [-1, 0.6, 0];
    expect(clampPull(ANCHOR, pulled, 2.6)).toEqual(pulled);
  });

  test("clamps a pull beyond the max radius onto the sphere", () => {
    const pulled: Vec3 = [-10, 1.2, 0];
    const clamped = clampPull(ANCHOR, pulled, 2.6);
    const dx = clamped[0] - ANCHOR[0];
    const dy = clamped[1] - ANCHOR[1];
    const dz = clamped[2] - ANCHOR[2];
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(2.6, 5);
  });
});

describe("pullFraction", () => {
  test("is 0 at the anchor and 1 at max pull", () => {
    expect(pullFraction(ANCHOR, ANCHOR, 2.6)).toBe(0);
    expect(pullFraction(ANCHOR, [-2.6, 1.2, 0], 2.6)).toBeCloseTo(1, 5);
  });

  test("clamps beyond max pull to 1", () => {
    expect(pullFraction(ANCHOR, [-50, 1.2, 0], 2.6)).toBeCloseTo(1, 5);
  });
});

describe("launchVelocity", () => {
  test("fires opposite the pull direction", () => {
    const velocity = launchVelocity({
      anchor: ANCHOR,
      pulledPoint: [-2, 0.6, 0],
      maxPull: 2.6,
      powerScale: 9,
      maxSpeed: 24,
    });
    expect(velocity[0]).toBeGreaterThan(0);
    expect(velocity[1]).toBeGreaterThan(0);
    expect(velocity[2]).toBe(0);
  });

  test("returns zero velocity when there is no pull", () => {
    expect(launchVelocity({ anchor: ANCHOR, pulledPoint: ANCHOR, maxPull: 2.6, powerScale: 9, maxSpeed: 24 })).toEqual([
      0, 0, 0,
    ]);
  });

  test("clamps speed at maxSpeed for a full pull", () => {
    const velocity = launchVelocity({
      anchor: ANCHOR,
      pulledPoint: [-2.6, 1.2, 0],
      maxPull: 2.6,
      powerScale: 100,
      maxSpeed: 24,
    });
    expect(Math.hypot(...velocity)).toBeCloseTo(24, 5);
  });
});

describe("sampleTrajectory", () => {
  test("falls under gravity and terminates near the floor", () => {
    const points = sampleTrajectory([0, 1, 0], [10, 8, 0], -18, 200, 1 / 60, -2);
    expect(points.length).toBeGreaterThan(2);
    const apex = points.reduce((best, p) => (p[1] > best[1] ? p : best));
    expect(apex[1]).toBeGreaterThan(1);
    const last = points[points.length - 1]!;
    expect(last[1]).toBeLessThan(apex[1]);
    expect(last[0]).toBeGreaterThan(0);
  });

  test("a straight-up launch returns to the same x/z", () => {
    const points = sampleTrajectory([3, 1, 0], [0, 5, 0], -18, 200, 1 / 60, -10);
    for (const point of points) {
      expect(point[0]).toBeCloseTo(3, 5);
      expect(point[2]).toBeCloseTo(0, 5);
    }
  });
});
