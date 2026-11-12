import { describe, expect, test } from "bun:test";
import { simulateLap } from "./lapSim";
import type { PlanPoint } from "./streetMetrics";

function ring(radius: number, n: number): PlanPoint[] {
  return Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * radius, Math.sin((i / n) * Math.PI * 2) * radius] as PlanPoint);
}

describe("simulateLap", () => {
  test("a constant-radius ring runs at the grip limit all the way round", () => {
    const pts = ring(50, 360);
    const sim = simulateLap(pts, pts.map(() => 50));
    const v = Math.sqrt(1.7 * 9.81 * 50);
    const perimeter = 360 * 2 * 50 * Math.sin(Math.PI / 360);
    expect(sim.minSpeed).toBeCloseTo(v, 9);
    expect(sim.maxSpeed).toBeCloseTo(v, 9);
    expect(sim.time).toBeCloseTo(perimeter / v, 9);
    expect(sim.brakingZones).toHaveLength(0);
  });

  test("an all-straight loop is flat out at top speed", () => {
    const pts = ring(1000, 1000);
    const sim = simulateLap(pts, pts.map(() => Infinity), { topSpeed: 80 });
    expect(sim.time).toBeCloseTo(sim.length / 80, 9);
    expect(sim.fullThrottleShare).toBe(1);
    expect(sim.brakingZones).toHaveLength(0);
  });

  test("one slow corner: accelerate out, brake in, with the closed-form speed profile", () => {
    // ~2000 m loop, a 10 m-radius corner at point 0, straight everywhere else, top speed out of reach.
    const n = 2000;
    const pts = ring(2000 / (2 * Math.PI), n);
    const radii = pts.map((_, i) => (i === 0 ? 10 : Infinity));
    const sim = simulateLap(pts, radii, { topSpeed: 1000, accel: 9, brake: 30 });
    const ds = 2 * (2000 / (2 * Math.PI)) * Math.sin(Math.PI / n);
    const L = ds * n;
    const v0 = Math.sqrt(1.7 * 9.81 * 10);
    for (const k of [0, 1, 500, 1500, 1700, 1999]) {
      const s = k * ds;
      const expected = Math.min(Math.sqrt(v0 ** 2 + 2 * 9 * s), Math.sqrt(v0 ** 2 + 2 * 30 * (L - s)));
      expect(sim.speeds[k]!).toBeCloseTo(expected, 6);
    }
    expect(sim.brakingZones).toHaveLength(1);
    const zone = sim.brakingZones[0]!;
    expect(zone.end).toBe(0);
    expect(zone.to).toBeCloseTo(v0, 9);
    const peakAt = (30 * L) / (9 + 30);
    expect(Math.abs(zone.length - (L - peakAt))).toBeLessThan(2 * ds);
    expect(Math.abs(sim.fullThrottleShare - peakAt / L)).toBeLessThan(0.002);
  });
});
