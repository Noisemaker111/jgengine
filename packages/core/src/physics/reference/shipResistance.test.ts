import { describe, expect, test } from "bun:test";

import { HOLTROP_MENNEN_EXAMPLE as EXAMPLE, holtropMennenResistance, holtropPropulsionFactors, ittc1957Friction, schoenherrFriction } from "./shipResistance";

function within(value: number, published: number, tolerance: number): void {
  expect(Math.abs(value - published)).toBeLessThanOrEqual(tolerance * Math.abs(published));
}

describe("Holtrop–Mennen resistance", () => {
  const result = holtropMennenResistance(EXAMPLE.hull, EXAMPLE.speed);
  const published = EXAMPLE.published;

  test("reproduces the 1982 paper's 25-knot example: every coefficient within 0.1%, every component within 0.5%", () => {
    within(result.froude, published.froude, 1e-3);
    within(result.prismaticCoefficient, published.prismaticCoefficient, 1e-3);
    within(result.lengthOfRun, published.lengthOfRun, 1e-3);
    within(result.formFactor, published.formFactor, 1e-3);
    within(result.wettedArea, published.wettedArea, 1e-3);
    within(result.entranceAngle, published.entranceAngle, 1e-3);
    for (const key of ["c1", "c2", "c3", "c5", "c7", "c15", "m1", "m2", "lambda"] as const) within(result[key], published[key], 1e-3);
    within(result.friction, published.friction, 1e-3);
    within(result.appendage, published.appendage, 5e-3);
    within(result.wave, published.wave, 5e-3);
    within(result.bulb, published.bulb, 5e-3);
    expect(result.transom).toBe(0);
    within(result.correlationAllowance, published.correlationAllowance, 2e-3);
    within(result.correlation, published.correlation, 5e-3);
    within(result.viscousCoefficient, published.viscousCoefficient, 1e-3);
  });

  test("total resistance and effective power within 0.1% of 1793.26 kN and 23 063 kW", () => {
    within(result.total, published.total, 1e-3);
    within(result.effectivePower, published.effectivePower, 1e-3);
  });

  test("wake, thrust deduction, thrust, blade area and relative-rotative efficiency within 0.2%", () => {
    const factors = holtropPropulsionFactors(EXAMPLE.hull, result, EXAMPLE.propeller);
    within(factors.wake, published.wake, 2e-3);
    within(factors.thrustDeduction, published.thrustDeduction, 2e-3);
    within(factors.thrust, published.thrust, 2e-3);
    within(factors.bladeAreaRatio, published.bladeAreaRatio, 2e-3);
    within(factors.relativeRotative, published.relativeRotative, 2e-3);
    within(factors.c9, published.c9, 1e-3);
    within(factors.cp1, published.cp1, 1e-3);
  });

  test("wave resistance runs continuously through the 1984 high-speed range", () => {
    const speeds = Array.from({ length: 40 }, (_, i) => (0.3 + i * 0.01) * Math.sqrt(9.81 * EXAMPLE.hull.length));
    const waves = speeds.map((speed) => holtropMennenResistance(EXAMPLE.hull, speed).wave);
    for (let i = 1; i < waves.length; i += 1) expect(Math.abs((waves[i] ?? 0) - (waves[i - 1] ?? 0))).toBeLessThan(0.25 * (waves[i - 1] ?? 0));
    expect(waves.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
  });
});

describe("friction lines", () => {
  test("ITTC-1957 and Schoenherr agree with their defining equations", () => {
    expect(ittc1957Friction(1e7)).toBeCloseTo(0.075 / 25, 10);
    for (const reynolds of [1e6, 1e7, 2e9]) {
      const cf = schoenherrFriction(reynolds);
      expect(0.242 / Math.sqrt(cf)).toBeCloseTo(Math.log10(reynolds * cf), 10);
    }
  });
});
