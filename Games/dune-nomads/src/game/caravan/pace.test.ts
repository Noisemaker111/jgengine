import { describe, expect, test } from "bun:test";

import {
  PACE_MULTIPLIER_MAX,
  PACE_MULTIPLIER_MIN,
  computePaceMultiplier,
  gaitGlyphFor,
  headingVector,
  slopeAlongHeading,
  windAlignment,
} from "./pace";

describe("headingVector", () => {
  test("heading 0 points toward +Z", () => {
    const [x, z] = headingVector(0);
    expect(x).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(1, 5);
  });

  test("heading PI/2 points toward +X", () => {
    const [x, z] = headingVector(Math.PI / 2);
    expect(x).toBeCloseTo(1, 5);
    expect(z).toBeCloseTo(0, 5);
  });
});

describe("windAlignment", () => {
  test("tailwind gives +1", () => {
    expect(windAlignment(0, [0, 5])).toBeCloseTo(1, 5);
  });

  test("headwind gives -1", () => {
    expect(windAlignment(0, [0, -5])).toBeCloseTo(-1, 5);
  });

  test("crosswind gives ~0", () => {
    expect(windAlignment(0, [5, 0])).toBeCloseTo(0, 5);
  });

  test("zero wind gives 0", () => {
    expect(windAlignment(0, [0, 0])).toBe(0);
  });
});

describe("slopeAlongHeading", () => {
  const rampField = { sampleHeight: (_x: number, z: number) => z, sampleNormal: () => [0, 1, 0] as const };

  test("positive slope climbing toward +Z", () => {
    expect(slopeAlongHeading(rampField, 0, 0, 0)).toBeCloseTo(1, 5);
  });

  test("negative slope descending toward -Z", () => {
    expect(slopeAlongHeading(rampField, 0, 0, Math.PI)).toBeCloseTo(-1, 5);
  });

  test("flat field has zero slope", () => {
    const flat = { sampleHeight: () => 3, sampleNormal: () => [0, 1, 0] as const };
    expect(slopeAlongHeading(flat, 10, 10, 1.2)).toBe(0);
  });
});

describe("computePaceMultiplier", () => {
  test("flat ground, no wind is baseline 1", () => {
    const pace = computePaceMultiplier({ slope: 0, windVector: [0, 0], headingRad: 0 });
    expect(pace.multiplier).toBeCloseTo(1, 5);
  });

  test("descending with a tailwind is faster than baseline", () => {
    const pace = computePaceMultiplier({ slope: -0.6, windVector: [0, 10], headingRad: 0 });
    expect(pace.multiplier).toBeGreaterThan(1.3);
    expect(pace.multiplier).toBeLessThanOrEqual(PACE_MULTIPLIER_MAX);
  });

  test("climbing into a headwind is slower than baseline", () => {
    const pace = computePaceMultiplier({ slope: 0.6, windVector: [0, -10], headingRad: 0 });
    expect(pace.multiplier).toBeLessThan(0.7);
    expect(pace.multiplier).toBeGreaterThanOrEqual(PACE_MULTIPLIER_MIN);
  });

  test("extreme climb clamps at the floor, extreme descent clamps at the ceiling", () => {
    const worst = computePaceMultiplier({ slope: 5, windVector: [0, -20], headingRad: 0 });
    const best = computePaceMultiplier({ slope: -5, windVector: [0, 20], headingRad: 0 });
    expect(worst.multiplier).toBeGreaterThanOrEqual(PACE_MULTIPLIER_MIN);
    expect(best.multiplier).toBeLessThanOrEqual(PACE_MULTIPLIER_MAX);
    expect(best.multiplier).toBeGreaterThan(worst.multiplier);
  });

  test("slope and wind combine multiplicatively, not additively", () => {
    const slopeOnly = computePaceMultiplier({ slope: -0.4, windVector: [0, 0], headingRad: 0 });
    const windOnly = computePaceMultiplier({ slope: 0, windVector: [0, 10], headingRad: 0 });
    const both = computePaceMultiplier({ slope: -0.4, windVector: [0, 10], headingRad: 0 });
    expect(both.multiplier).toBeCloseTo(slopeOnly.multiplier * windOnly.multiplier, 5);
  });
});

describe("gaitGlyphFor", () => {
  test.each([
    [0.3, "trudging"],
    [0.9, "steady"],
    [1.4, "brisk"],
    [2.1, "flying"],
  ] as const)("multiplier %f maps to %s", (multiplier, expected) => {
    expect(gaitGlyphFor(multiplier)).toBe(expected);
  });
});
