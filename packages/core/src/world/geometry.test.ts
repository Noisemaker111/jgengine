import { describe, expect, test } from "bun:test";

import {
  aabbContains,
  aabbOverlap,
  clampToAabb,
  clampToEllipse,
  ellipseNormal,
  footprintAabb,
  pointInAabb,
  pointInEllipse,
  resolveMove,
  snapToGrid,
  type Aabb,
  type Ellipse,
} from "./geometry";

describe("geometry", () => {
  test("snapToGrid rounds to nearest cell and is inert for non-positive size", () => {
    expect(snapToGrid([1.2, 2.7], 1)).toEqual([1, 3]);
    expect(snapToGrid([3, 5], 2)).toEqual([4, 6]);
    expect(snapToGrid([1.2, 2.7], 0)).toEqual([1.2, 2.7]);
  });

  test("footprintAabb swaps extents on odd quarter turns", () => {
    expect(footprintAabb([0, 0], { w: 4, d: 2 })).toEqual({ minX: -2, maxX: 2, minZ: -1, maxZ: 1 });
    expect(footprintAabb([0, 0], { w: 4, d: 2 }, 1)).toEqual({ minX: -1, maxX: 1, minZ: -2, maxZ: 2 });
    expect(footprintAabb([0, 0], { w: 4, d: 2 }, 2)).toEqual({ minX: -2, maxX: 2, minZ: -1, maxZ: 1 });
  });

  test("overlap is exclusive of shared edges so adjacency is allowed", () => {
    const a: Aabb = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };
    expect(aabbOverlap(a, { minX: 1, maxX: 3, minZ: 1, maxZ: 3 })).toBe(true);
    expect(aabbOverlap(a, { minX: 2, maxX: 4, minZ: 0, maxZ: 2 })).toBe(false);
  });

  test("contains and pointInAabb", () => {
    const outer: Aabb = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    expect(aabbContains(outer, { minX: 1, maxX: 9, minZ: 1, maxZ: 9 })).toBe(true);
    expect(aabbContains(outer, { minX: -1, maxX: 9, minZ: 1, maxZ: 9 })).toBe(false);
    expect(pointInAabb([5, 5], outer)).toBe(true);
    expect(pointInAabb([11, 5], outer)).toBe(false);
    expect(clampToAabb([11, -3], outer)).toEqual([10, 0]);
  });

  test("resolveMove slides along a blocker instead of passing through", () => {
    const blocker: Aabb = { minX: 1, maxX: 3, minZ: -1, maxZ: 1 };
    const resolved = resolveMove([0, 0], [5, 0], [blocker]);
    expect(resolved[0]).toBe(1);
    expect(resolved[1]).toBe(0);
  });

  test("resolveMove keeps the perpendicular axis moving while blocked", () => {
    const blocker: Aabb = { minX: 1, maxX: 3, minZ: -1, maxZ: 1 };
    const resolved = resolveMove([0, 0], [5, 2], [blocker]);
    expect(resolved[0]).toBe(1);
    expect(resolved[1]).toBe(2);
  });

  test("resolveMove respects radius and bounds", () => {
    const bounds: Aabb = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    const resolved = resolveMove([5, 5], [10, 0], [], { bounds, radius: 0.5 });
    expect(resolved[0]).toBe(9.5);
  });
});

describe("ellipse", () => {
  const arena: Ellipse = { center: [0, 0], radiusX: 4, radiusY: 2 };

  test("containment respects the semi-axes", () => {
    expect(pointInEllipse([3.9, 0], arena)).toBe(true);
    expect(pointInEllipse([0, 1.9], arena)).toBe(true);
    expect(pointInEllipse([3, 1.5], arena)).toBe(false);
  });

  test("clampToEllipse snaps outside points onto the boundary and leaves inside points", () => {
    const inside: [number, number] = [1, 0];
    expect(clampToEllipse(inside, arena)).toBe(inside);
    const clamped = clampToEllipse([8, 0], arena);
    expect(pointInEllipse(clamped, arena)).toBe(true);
    expect(clamped[0]).toBeCloseTo(4);
  });

  test("normal points outward and favours the tighter axis", () => {
    expect(ellipseNormal([4, 0], arena)).toEqual([1, 0]);
    const n = ellipseNormal([2, 1], arena);
    expect(Math.hypot(n[0], n[1])).toBeCloseTo(1);
  });
});
