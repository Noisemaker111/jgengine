import { describe, expect, test } from "bun:test";

import {
  createVisionCone,
  hasWallLineOfSight,
  pointInCone,
  segmentsIntersect,
  type VisionWall,
} from "@jgengine/core/sensor/visionCone";

describe("segmentsIntersect", () => {
  test("crossing segments intersect", () => {
    expect(segmentsIntersect([0, 0], [4, 4], [0, 4], [4, 0])).toBe(true);
  });

  test("non-crossing, non-parallel segments do not intersect", () => {
    expect(segmentsIntersect([0, 0], [1, 0], [5, 5], [6, 6])).toBe(false);
  });

  test("collinear overlapping segments count as intersecting", () => {
    expect(segmentsIntersect([0, 0], [0, 10], [0, 5], [0, 15])).toBe(true);
  });

  test("parallel disjoint segments do not intersect", () => {
    expect(segmentsIntersect([0, 0], [0, 4], [2, 0], [2, 4])).toBe(false);
  });
});

describe("hasWallLineOfSight", () => {
  const walls: readonly VisionWall[] = [{ from: [-5, 3], to: [5, 3] }];

  test("blocked when a wall crosses the sight line", () => {
    expect(hasWallLineOfSight([0, 0], [0, 6], walls)).toBe(false);
  });

  test("clear when no wall crosses the sight line", () => {
    expect(hasWallLineOfSight([0, 0], [0, 2], walls)).toBe(true);
  });
});

describe("pointInCone", () => {
  const config = { range: 10, angle: Math.PI / 2 };

  test("a point within range and angle is seen", () => {
    expect(pointInCone([0, 0], 0, config, [1, 5])).toBe(true);
  });

  test("a point beyond range is not seen", () => {
    expect(pointInCone([0, 0], 0, { range: 3, angle: Math.PI / 2 }, [1, 5])).toBe(false);
  });

  test("a point behind the observer is not seen", () => {
    expect(pointInCone([0, 0], 0, config, [0, -5])).toBe(false);
  });

  test("zero distance always counts as seen", () => {
    expect(pointInCone([0, 0], 1.234, { range: 10, angle: 0.1 }, [0, 0])).toBe(true);
  });

  test("angle test wraps correctly across the +-PI heading seam", () => {
    const narrow = { range: 10, angle: 0.5 };
    const targetA: readonly [number, number] = [Math.sin(-3.05) * 5, Math.cos(-3.05) * 5];
    expect(pointInCone([0, 0], 3.0, narrow, targetA)).toBe(true);
    const targetB: readonly [number, number] = [Math.sin(3.05) * 5, Math.cos(3.05) * 5];
    expect(pointInCone([0, 0], -3.0, narrow, targetB)).toBe(true);
  });
});

describe("createVisionCone", () => {
  const walls: readonly VisionWall[] = [{ from: [-5, 3], to: [5, 3] }];
  const cone = createVisionCone({ range: 10, angle: Math.PI / 2 }, walls);

  test("canSee combines the cone test with wall occlusion", () => {
    expect(cone.canSee([0, 0], 0, [0, 6])).toBe(false);
    expect(cone.canSee([0, 0], 0, [0, 2])).toBe(true);
  });

  test("visibleTargets filters a target list down to what's seen", () => {
    const seen = cone.visibleTargets([0, 0], 0, [
      { id: "near", at: [0, 2] },
      { id: "behind-wall", at: [0, 6] },
      { id: "far-away", at: [100, 100] },
    ]);
    expect(seen).toEqual(["near"]);
  });
});
