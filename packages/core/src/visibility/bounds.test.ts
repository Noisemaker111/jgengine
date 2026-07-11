import { describe, expect, test } from "bun:test";
import type { BoundsSpec, Vec3 } from "@jgengine/core/visibility/bounds";
import {
  resolveBounds,
  createRenderBounds,
  createBoundsCache,
  boundsIntersect,
  aabbIntersects,
  expandRenderBounds,
} from "@jgengine/core/visibility/bounds";

const origin: Vec3 = [0, 0, 0];

describe("resolveBounds", () => {
  test("sphere resolves to a symmetric AABB and radius", () => {
    const spec: BoundsSpec = { kind: "sphere", radius: 2 };
    const b = resolveBounds(spec, origin);
    expect(b.centerX).toBe(0);
    expect(b.radius).toBe(2);
    expect(b.minX).toBe(-2);
    expect(b.maxX).toBe(2);
    expect(b.minY).toBe(-2);
    expect(b.maxY).toBe(2);
    expect(b.minZ).toBe(-2);
    expect(b.maxZ).toBe(2);
  });

  test("sphere honors offset", () => {
    const spec: BoundsSpec = { kind: "sphere", radius: 2, offset: [1, 0, 0] };
    const b = resolveBounds(spec, origin);
    expect(b.centerX).toBe(1);
    expect(b.minX).toBe(-1);
    expect(b.maxX).toBe(3);
  });

  test("aabb resolves per-axis half extents and derives radius", () => {
    const spec: BoundsSpec = { kind: "aabb", half: [1, 2, 3] };
    const b = resolveBounds(spec, origin);
    expect(b.minX).toBe(-1);
    expect(b.maxX).toBe(1);
    expect(b.minY).toBe(-2);
    expect(b.maxY).toBe(2);
    expect(b.minZ).toBe(-3);
    expect(b.maxZ).toBe(3);
    expect(b.radius).toBeCloseTo(Math.sqrt(1 + 4 + 9));
  });

  test("aabb honors offset", () => {
    const spec: BoundsSpec = { kind: "aabb", half: [1, 1, 1], offset: [0, 5, 0] };
    const b = resolveBounds(spec, origin);
    expect(b.centerY).toBe(5);
    expect(b.minY).toBe(4);
    expect(b.maxY).toBe(6);
  });

  test("rect uses halfWidth/halfDepth and defaults halfHeight to 0", () => {
    const spec: BoundsSpec = { kind: "rect", halfWidth: 2, halfDepth: 3 };
    const b = resolveBounds(spec, origin);
    expect(b.minX).toBe(-2);
    expect(b.maxX).toBe(2);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(0);
    expect(b.minZ).toBe(-3);
    expect(b.maxZ).toBe(3);
    expect(b.radius).toBeCloseTo(Math.sqrt(4 + 0 + 9));
  });

  test("rect respects an explicit halfHeight and offset", () => {
    const spec: BoundsSpec = { kind: "rect", halfWidth: 1, halfDepth: 1, halfHeight: 4, offset: [0, 10, 0] };
    const b = resolveBounds(spec, origin);
    expect(b.centerY).toBe(10);
    expect(b.minY).toBe(6);
    expect(b.maxY).toBe(14);
  });

  test("point collapses to a zero-size volume at the position", () => {
    const spec: BoundsSpec = { kind: "point" };
    const b = resolveBounds(spec, [5, 6, 7]);
    expect(b.centerX).toBe(5);
    expect(b.centerY).toBe(6);
    expect(b.centerZ).toBe(7);
    expect(b.radius).toBe(0);
    expect(b.minX).toBe(5);
    expect(b.maxX).toBe(5);
  });

  test("writes into a supplied `out` without allocating a new object", () => {
    const out = createRenderBounds();
    const result = resolveBounds({ kind: "sphere", radius: 1 }, origin, out);
    expect(result).toBe(out);
  });
});

describe("createBoundsCache", () => {
  const spec: BoundsSpec = { kind: "sphere", radius: 1 };

  test("recomputes only when the version advances", () => {
    const cache = createBoundsCache();
    cache.get("a", 1, spec, origin);
    expect(cache.recomputes()).toBe(1);
    cache.get("a", 1, spec, origin);
    expect(cache.recomputes()).toBe(1);
    cache.get("a", 2, spec, origin);
    expect(cache.recomputes()).toBe(2);
  });

  test("a spec change with a new version produces new bounds", () => {
    const cache = createBoundsCache();
    cache.get("a", 1, { kind: "sphere", radius: 1 }, origin);
    const before = cache.peek("a");
    expect(before?.radius).toBe(1);
    const after = cache.get("a", 2, { kind: "sphere", radius: 5 }, origin);
    expect(after.radius).toBe(5);
    expect(cache.recomputes()).toBe(2);
  });

  test("invalidate forces a recompute on the next get even at the same version", () => {
    const cache = createBoundsCache();
    cache.get("a", 1, spec, origin);
    expect(cache.recomputes()).toBe(1);
    cache.invalidate("a");
    cache.get("a", 1, spec, origin);
    expect(cache.recomputes()).toBe(2);
  });

  test("peek returns undefined for an unknown id", () => {
    const cache = createBoundsCache();
    expect(cache.peek("missing")).toBeUndefined();
  });

  test("delete, clear, and size track cache membership", () => {
    const cache = createBoundsCache();
    cache.get("a", 1, spec, origin);
    cache.get("b", 1, spec, origin);
    expect(cache.size()).toBe(2);
    cache.delete("a");
    expect(cache.size()).toBe(1);
    expect(cache.peek("a")).toBeUndefined();
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

describe("aabbIntersects / boundsIntersect", () => {
  test("overlapping AABBs intersect", () => {
    expect(aabbIntersects(0, 0, 0, 2, 2, 2, 1, 1, 1, 3, 3, 3)).toBe(true);
  });

  test("disjoint AABBs do not intersect", () => {
    expect(aabbIntersects(0, 0, 0, 1, 1, 1, 10, 10, 10, 11, 11, 11)).toBe(false);
  });

  test("boundsIntersect true for overlapping spheres", () => {
    const a = resolveBounds({ kind: "sphere", radius: 2 }, [0, 0, 0]);
    const b = resolveBounds({ kind: "sphere", radius: 2 }, [1, 0, 0]);
    expect(boundsIntersect(a, b)).toBe(true);
  });

  test("boundsIntersect false for far-apart spheres", () => {
    const a = resolveBounds({ kind: "sphere", radius: 1 }, [0, 0, 0]);
    const b = resolveBounds({ kind: "sphere", radius: 1 }, [100, 0, 0]);
    expect(boundsIntersect(a, b)).toBe(false);
  });
});

describe("expandRenderBounds", () => {
  test("grows the AABB and radius by the margin on every side", () => {
    const b = resolveBounds({ kind: "sphere", radius: 2 }, [0, 0, 0]);
    const expanded = expandRenderBounds(b, 1);
    expect(expanded.radius).toBe(3);
    expect(expanded.minX).toBe(-3);
    expect(expanded.maxX).toBe(3);
    expect(expanded.minY).toBe(-3);
    expect(expanded.maxY).toBe(3);
    expect(expanded.minZ).toBe(-3);
    expect(expanded.maxZ).toBe(3);
    expect(expanded.centerX).toBe(b.centerX);
  });
});
