import { describe, expect, test } from "bun:test";

import { SpatialGrid } from "./spatialGrid";

const BOUNDS = { min: [-50, 0, -50] as const, max: [50, 0, 50] as const };

function grid(cellSize = 2): SpatialGrid {
  return new SpatialGrid({ bounds: BOUNDS, cellSize, capacity: 4096 });
}

function brute(xs: Float32Array, zs: Float32Array, n: number, x: number, z: number, r: number): Set<number> {
  const hits = new Set<number>();
  const r2 = r * r;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - x;
    const dz = zs[i]! - z;
    if (dx * dx + dz * dz <= r2) hits.add(i);
  }
  return hits;
}

describe("SpatialGrid capacity guard", () => {
  test("a tiny cellSize over huge bounds throws instead of hanging on allocation", () => {
    expect(
      () =>
        new SpatialGrid({
          bounds: { min: [-100000, 0, -100000], max: [100000, 0, 100000] },
          cellSize: 0.01,
          capacity: 16,
        }),
    ).toThrow(/grid too large/);
  });
});

describe("SpatialGrid.queryCircle", () => {
  test("returns exactly the entities within the radius (no false negatives)", () => {
    const g = grid(2);
    const n = 600;
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    let s = 12345;
    const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i += 1) {
      xs[i] = (rng() - 0.5) * 90;
      zs[i] = (rng() - 0.5) * 90;
    }
    g.rebuild(n, xs, zs);
    const out = new Int32Array(n);
    for (const [qx, qz, r] of [
      [0, 0, 5],
      [20, -15, 8],
      [-40, 40, 12],
    ] as const) {
      const count = g.queryCircle(qx, qz, r, out);
      const got = new Set<number>();
      for (let k = 0; k < count; k += 1) got.add(out[k]!);
      expect(got).toEqual(brute(xs, zs, n, qx, qz, r));
    }
  });

  test("respects a small cell size larger than the query", () => {
    const g = grid(1);
    const xs = new Float32Array([0, 3, 0.5, -10]);
    const zs = new Float32Array([0, 0, 0.5, 10]);
    g.rebuild(4, xs, zs);
    const out = new Int32Array(4);
    const count = g.queryCircle(0, 0, 1, out);
    const got = new Set<number>();
    for (let k = 0; k < count; k += 1) got.add(out[k]!);
    expect(got).toEqual(new Set([0, 2]));
  });
});

describe("SpatialGrid.forEachPair", () => {
  test("rejects invalid distances before enumerating pairs", () => {
    const g = grid(2);
    g.rebuild(2, new Float32Array([0, 1]), new Float32Array([0, 0]));
    for (const distance of [-1, NaN, Infinity, -Infinity]) {
      const pairs: string[] = [];
      expect(() => g.forEachPair(distance, (a, b) => pairs.push(`${a}-${b}`))).toThrow(RangeError);
      expect(pairs).toEqual([]);
    }
  });

  test("finds pairs farther apart than one cell", () => {
    const g = grid(2);
    g.rebuild(3, new Float32Array([0, 4.1, 12]), new Float32Array([0, 0, 0]));
    const pairs: string[] = [];
    g.forEachPair(5, (a, b) => pairs.push(`${a}-${b}`));
    expect(pairs).toEqual(["0-1"]);
  });

  test("includes coincident movers and exact-distance pairs once", () => {
    const g = grid(2);
    g.rebuild(3, new Float32Array([0, 0, 3]), new Float32Array([0, 0, 4]));
    for (const [distance, expected] of [
      [0, ["0-1"]],
      [5, ["0-1", "0-2", "1-2"]],
    ] as const) {
      const pairs: string[] = [];
      g.forEachPair(distance, (a, b) => pairs.push(`${a}-${b}`));
      expect(pairs).toEqual([...expected]);
    }
  });

  test("covers diagonal, boundary, and clamped out-of-bounds pairs", () => {
    const g = grid(2);
    const xs = new Float32Array([0, 4, -49, -45, -54, 49, 53]);
    const zs = new Float32Array([0, 4, -49, -45, -49, 49, 49]);
    g.rebuild(xs.length, xs, zs);
    const pairs: string[] = [];
    g.forEachPair(6, (a, b) => pairs.push(`${a}-${b}`));
    expect(pairs.sort()).toEqual(["0-1", "2-3", "2-4", "5-6"]);
  });

  test("enumerates every close pair once and no far pairs", () => {
    const g = grid(2);
    const xs = new Float32Array([0, 0.5, 5, 5.4, 20]);
    const zs = new Float32Array([0, 0.3, 5, 5.1, -20]);
    g.rebuild(5, xs, zs);
    const pairs: string[] = [];
    g.forEachPair(1, (a, b) => {
      pairs.push(`${a}-${b}`);
    });
    expect(pairs.sort()).toEqual(["0-1", "2-3"]);
  });

  test("candidate pairs match a brute-force sweep across distance and cell-size ratios", () => {
    const g = grid(3);
    const n = 400;
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    let s = 999;
    const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i += 1) {
      xs[i] = (rng() - 0.5) * 80;
      zs[i] = (rng() - 0.5) * 80;
    }
    g.rebuild(n, xs, zs);
    for (const distance of [0, 2, 3, 7, 15, 150]) {
      const found: string[] = [];
      g.forEachPair(distance, (a, b) => {
        found.push(`${a}-${b}`);
      });
      const expected = new Set<string>();
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const dx = xs[i]! - xs[j]!;
          const dz = zs[i]! - zs[j]!;
          if (dx * dx + dz * dz <= distance * distance) expected.add(`${i}-${j}`);
        }
      }
      expect(new Set(found)).toEqual(expected);
      expect(found.length).toBe(expected.size);
    }
  });
});
