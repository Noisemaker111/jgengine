import { describe, expect, test } from "bun:test";

import type { Vec2 } from "./geometry";
import { buildPolylineIndex } from "./polylineIndex";

/** Brute force over every segment — the answer the index must reproduce exactly. */
function scan(points: readonly Vec2[], x: number, z: number, limit: number): { distance: number; point: Vec2 } | null {
  let best: { distance: number; point: Vec2 } | null = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const segLenSq = abx * abx + abz * abz;
    const t = segLenSq <= 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / segLenSq));
    const px = a[0] + abx * t;
    const pz = a[1] + abz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance > limit) continue;
    if (best === null || distance < best.distance) best = { distance, point: [px, pz] };
  }
  return best;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomPolyline(random: () => number, points: number, span: number): Vec2[] {
  const out: Vec2[] = [];
  let x = (random() - 0.5) * span;
  let z = (random() - 0.5) * span;
  for (let i = 0; i < points; i += 1) {
    x += (random() - 0.5) * span * 0.3;
    z += (random() - 0.5) * span * 0.3;
    out.push([x, z]);
  }
  return out;
}

describe("buildPolylineIndex", () => {
  test("returns the same nearest point a full segment scan does, for every bound", () => {
    const random = seeded(20261023);
    for (let shape = 0; shape < 12; shape += 1) {
      const points = randomPolyline(random, 3 + (shape % 6) * 7, 400);
      const index = buildPolylineIndex(points);
      for (const limit of [Number.POSITIVE_INFINITY, 200, 40, 5, 0.5, 0]) {
        for (let query = 0; query < 200; query += 1) {
          const x = (random() - 0.5) * 900;
          const z = (random() - 0.5) * 900;
          const expected = scan(points, x, z, limit);
          const actual = index.nearest(x, z, limit);
          if (expected === null) {
            expect(actual).toBeNull();
            continue;
          }
          expect(actual).not.toBeNull();
          expect(actual!.distance).toBe(expected.distance);
          expect(actual!.point).toEqual(expected.point);
        }
      }
    }
  });

  test("finds a stretch that runs past a cell without an endpoint near the query", () => {
    const points: Vec2[] = [
      [-500, 0],
      [500, 0],
    ];
    const index = buildPolylineIndex(points);
    const hit = index.nearest(0, 12, 20);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(12, 9);
    expect(hit!.point[0]).toBeCloseTo(0, 9);
  });

  test("a far query examines no segment and a near query only the local ones", () => {
    const points: Vec2[] = [];
    for (let i = 0; i <= 400; i += 1) points.push([i * 10, i % 2 === 0 ? 0 : 20]);
    const index = buildPolylineIndex(points);
    expect(index.nearest(-5000, -5000, 10)).toBeNull();
    expect(index.examined()).toBe(0);
    const near = index.nearest(points[200]![0], 4, 10);
    expect(near).not.toBeNull();
    expect(index.examined()).toBeLessThan(20);
  });

  test("a degenerate polyline has nothing to hit", () => {
    const empty = buildPolylineIndex([]);
    expect(empty.nearest(0, 0, 100)).toBeNull();
    const single = buildPolylineIndex([[3, 3]]);
    expect(single.nearest(3, 3, 100)).toBeNull();
  });

  test("a repeated point segment does not divide by zero", () => {
    const index = buildPolylineIndex([
      [0, 0],
      [0, 0],
      [10, 0],
    ]);
    const hit = index.nearest(0, 2, 10);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(2, 9);
  });
});
