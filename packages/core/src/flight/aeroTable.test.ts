import { describe, expect, test } from "bun:test";

import { sampleAeroTable, sumAeroTerms, surfaceAngle, type AeroState, type AeroTable } from "./aeroTable";
import { derivativeMoments, type DerivativeMoments } from "./derivatives";
import { polarCoefficients } from "./polar";

const STILL: AeroState = { alpha: 0, beta: 0, mach: 0, pHat: 0, qHat: 0, rHat: 0, alphaDotHat: 0, pitch: 0, roll: 0, yaw: 0 };

describe("coefficient tables", () => {
  const grid: AeroTable = { inputs: ["pitch", "alpha"], breakpoints: [[-1, 1], [0, 1, 2]], values: [0, 1, 2, 10, 11, 12] };

  test("multilinear between breakpoints, row-major with the last input fastest", () => {
    expect(sampleAeroTable(grid, { ...STILL, pitch: -1, alpha: 2 })).toBe(2);
    expect(sampleAeroTable(grid, { ...STILL, pitch: 1, alpha: 0 })).toBe(10);
    expect(sampleAeroTable(grid, { ...STILL, pitch: 0, alpha: 0.5 })).toBeCloseTo(5.5, 9);
  });

  test("held flat past the ends unless linear", () => {
    expect(sampleAeroTable(grid, { ...STILL, pitch: -1, alpha: 5 })).toBe(2);
    expect(sampleAeroTable({ ...grid, extrapolate: "linear" }, { ...STILL, pitch: -1, alpha: 3 })).toBeCloseTo(3, 9);
  });

  test("a build-up sums constants and tables times their factors; unequal surface travel maps the actuator", () => {
    const terms = [{ value: 0.3 }, { value: 4.4, times: "alpha" as const }, { value: { inputs: ["absBeta" as const], breakpoints: [[0, 1]], values: [0, -2] }, times: "signBeta" as const }];
    expect(sumAeroTerms(terms, { ...STILL, alpha: 0.1, beta: -0.5 })).toBeCloseTo(0.3 + 0.44 + 1, 9);
    expect(surfaceAngle({ positive: -0.49, negative: 0.4 }, 1)).toBe(-0.49);
    expect(surfaceAngle({ positive: -0.49, negative: 0.4 }, -0.5)).toBeCloseTo(0.2, 9);
  });

  test("the polar sums lift, drag and side force; the derivatives keep damping apart", () => {
    const polar = polarCoefficients({ area: 1, span: 1, chord: 1, lift: [{ value: 5, times: "alpha" }], drag: [{ value: 0.02 }], side: [{ value: -0.4, times: "beta" }] }, { ...STILL, alpha: 0.1, beta: 0.1 }, { lift: 0, drag: 0, side: 0 });
    expect(polar).toEqual({ lift: 0.5, drag: 0.02, side: -0.04000000000000001 });
    const moments: DerivativeMoments = { roll: 0, pitch: 0, yaw: 0, rollDamping: 0, pitchDamping: 0, yawDamping: 0 };
    derivativeMoments({ area: 1, span: 1, chord: 1, roll: [{ value: 0.2, times: "roll" }, { value: -0.5, times: "pHat" }], pitch: [{ value: -0.6, times: "alpha" }, { value: -12, times: "qHat" }], yaw: [] }, { ...STILL, roll: 0.3, pHat: 0.1, alpha: 0.1, qHat: 0.01 }, moments);
    expect(moments.roll).toBeCloseTo(0.06, 9);
    expect(moments.rollDamping).toBeCloseTo(-0.05, 9);
    expect(moments.pitch).toBeCloseTo(-0.06, 9);
    expect(moments.pitchDamping).toBeCloseTo(-0.12, 9);
  });
});
