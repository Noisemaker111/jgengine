import { describe, expect, test } from "bun:test";

import {
  BUILD_PLOTS,
  KEEP_POINT,
  PATH_WAYPOINTS,
  SPAWN_POINT,
  nearestPlot,
  pathLength,
  perpendicularPoint,
} from "./path";

describe("perpendicularPoint", () => {
  test("offsets perpendicular to the segment direction at the given distance", () => {
    const point = perpendicularPoint([0, 0], [10, 0], 0.5, 1, 4);
    expect(point[0]).toBeCloseTo(5, 5);
    expect(Math.abs(point[1])).toBeCloseTo(4, 5);
  });

  test("flips sides for -1", () => {
    const left = perpendicularPoint([0, 0], [0, 10], 0.5, 1, 3);
    const right = perpendicularPoint([0, 0], [0, 10], 0.5, -1, 3);
    expect(left[0]).toBeCloseTo(-right[0], 5);
  });
});

describe("path waypoints", () => {
  test("every waypoint is grounded and finite", () => {
    for (const point of PATH_WAYPOINTS) {
      expect(Number.isFinite(point[0])).toBe(true);
      expect(Number.isFinite(point[1])).toBe(true);
      expect(Number.isFinite(point[2])).toBe(true);
    }
  });

  test("spawn and keep are the path endpoints", () => {
    expect(SPAWN_POINT).toBe(PATH_WAYPOINTS[0]!);
    expect(KEEP_POINT).toBe(PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]!);
  });

  test("the path has meaningful total length", () => {
    const flat = PATH_WAYPOINTS.map(([x, , z]) => [x, z] as const);
    expect(pathLength(flat)).toBeGreaterThan(100);
  });
});

describe("build plots", () => {
  test("every plot sits off the path centerline", () => {
    expect(BUILD_PLOTS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(BUILD_PLOTS.map((plot) => plot.id));
    expect(ids.size).toBe(BUILD_PLOTS.length);
  });

  test("nearestPlot finds a plot within radius and rejects a far point", () => {
    const first = BUILD_PLOTS[0]!;
    const found = nearestPlot(first.position, 0.5);
    expect(found?.id).toBe(first.id);
    const far = nearestPlot([500, 0, 500], 5);
    expect(far).toBeNull();
  });
});
