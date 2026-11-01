import { describe, expect, test } from "bun:test";

import { windField } from "./wind";
import { windGustSynthesis, windProfileFactor, WIND_SURFACE_ROUGHNESS } from "./windEffects";

const DIALS = [0, 0.2, 1, 2, 4];

function gustVariance(strength: number): number {
  const field = windField({ direction: [1, 0], speed: 10, seed: "dial", effects: { surface: "grass", gusts: { strength } } });
  let sum = 0;
  let sq = 0;
  const n = 4000;
  for (let i = 0; i < n; i += 1) {
    const u = field.atHeight(0, 0, 10, i * 0.5)[0];
    sum += u;
    sq += u * u;
  }
  return sq / n - (sum / n) ** 2;
}

describe("wind effects", () => {
  test("profile strength: mean wind at 50 m and at 2 m is finite, bounded and monotone over 0..4", () => {
    const high = DIALS.map((s) => windField({ speed: 10, effects: { surface: "city", profile: { strength: s } } }).atHeight(0, 0, 50, 0)[0]);
    const low = DIALS.map((s) => windField({ speed: 10, effects: { surface: "grass", profile: { strength: s } } }).atHeight(0, 0, 2, 0)[0]);
    expect(high[0]).toBe(10);
    expect(low[0]).toBe(10);
    for (let k = 1; k < DIALS.length; k += 1) {
      expect(Number.isFinite(high[k] ?? Number.NaN)).toBe(true);
      expect(high[k] ?? 0).toBeGreaterThan(high[k - 1] ?? 0);
      expect(low[k] ?? 0).toBeLessThan(low[k - 1] ?? 0);
      expect(low[k] ?? 0).toBeGreaterThan(0);
    }
    expect(high[4] ?? 0).toBeLessThan(10 * windProfileFactor(1e5, WIND_SURFACE_ROUGHNESS.city, 10, 4));
  });

  test("gust strength: variance is finite, bounded and monotone over 0..4, and zero when off", () => {
    const variance = DIALS.map(gustVariance);
    expect(variance[0]).toBeCloseTo(0, 9);
    for (let k = 1; k < DIALS.length; k += 1) {
      expect(Number.isFinite(variance[k] ?? Number.NaN)).toBe(true);
      expect(variance[k] ?? 0).toBeGreaterThan(variance[k - 1] ?? 0);
    }
    // σ ≤ strength · I_v · U · Σ amplitudes: a hard bound however long it runs.
    const synthesis = windGustSynthesis(32, "dial");
    const bound = 4 * 0.19 * 10 * synthesis.amplitudes.reduce((a, b) => a + b, 0);
    expect(Math.sqrt(variance[4] ?? 0)).toBeLessThan(bound);
  });

  test("a field without effects keeps today's sampling, and atHeight ignores height", () => {
    const plain = windField({ direction: [1, 1], speed: 3, gust: 1, turbulence: 0.5, seed: "today" });
    expect(plain.atHeight(4, 5, 80, 2)).toEqual(plain.atPoint(4, 5, 2));
    expect(plain.strengthAt(4, 5, 2)).toBeCloseTo(Math.hypot(...plain.atPoint(4, 5, 2)), 12);
  });

  test("gusts travel downwind: the pattern at x one second later matches x + U", () => {
    const field = windField({ direction: [1, 0], speed: 8, seed: "taylor", effects: { gusts: {} } });
    expect(field.atHeight(8, 0, 10, 1)[0]).toBeCloseTo(field.atHeight(0, 0, 10, 0)[0], 9);
  });

  test("rejects a negative strength", () => {
    expect(() => windField({ effects: { gusts: { strength: -1 } } })).toThrow();
  });
});
