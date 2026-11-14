import { describe, expect, test } from "bun:test";

import { onPatio } from "./yard";
import { YARD, YARD_NAV } from "./yardInstance";
import { routeTo, yardRoute, type RouteCache } from "./yardNav";

function nearCrossing(x: number, z: number): boolean {
  return YARD.crossings.some((c) => Math.hypot(c.x - x, c.z - z) <= c.radius + 1.5);
}

/** Every point along a polyline, sampled each half metre. */
function walk(points: readonly (readonly [number, number])[], start: readonly [number, number]): [number, number][] {
  const out: [number, number][] = [];
  let prev = start;
  for (const p of points) {
    const steps = Math.max(1, Math.ceil(Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 0.5));
    for (let i = 1; i <= steps; i += 1) out.push([prev[0] + ((p[0] - prev[0]) * i) / steps, prev[1] + ((p[1] - prev[1]) * i) / steps]);
    prev = p;
  }
  return out;
}

describe("ant routes across the yard", () => {
  test("a march from the red nest to the far bank crosses the hose only at a crossing", () => {
    const from = [0, 30] as const;
    const route = yardRoute(YARD_NAV, from, [0, -10]);
    expect(route).not.toBeNull();
    const samples = walk(route!, from);
    // Every sample that touches the hose band is at one of the two crossings.
    const hose = YARD.hose!;
    const touching = samples.filter(([x, z]) => hose.points.some((p, i) => {
      const q = hose.points[i + 1];
      if (q === undefined) return false;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (p.x + dx * t), z - (p.z + dz * t)) <= hose.halfWidth * 0.6;
    }));
    expect(touching.length).toBeGreaterThan(0);
    for (const [x, z] of touching) expect(nearCrossing(x, z)).toBe(true);
  });

  test("a column walks around a patio stone instead of over it", () => {
    const slab = YARD.patios[0]!;
    const from = [slab.x, slab.z + slab.halfZ + 4] as const;
    const to = [slab.x, slab.z - slab.halfZ - 4] as const;
    const route = yardRoute(YARD_NAV, from, to)!;
    expect(walk(route, from).filter(([x, z]) => onPatio(YARD, x, z))).toHaveLength(0);
  });

  test("routeTo walks a cached route waypoint by waypoint and replans when the goal moves", () => {
    const cache = new Map<string, RouteCache>();
    const first = routeTo(YARD_NAV, cache, "a", [0, 30], 0, -10);
    expect(cache.get("a")!.points.length).toBeGreaterThan(1);
    expect(first).not.toEqual([0, -10]);
    routeTo(YARD_NAV, cache, "a", [0, 30], 0, 34);
    expect(cache.get("a")!.points).toEqual([[0, 34]]);
  });
});
