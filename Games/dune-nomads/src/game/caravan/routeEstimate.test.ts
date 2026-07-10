import { describe, expect, test } from "bun:test";

import { computePaceMultiplier } from "./pace";
import { computeWaterDrainRate, headwindSeverity } from "./water";
import { estimateRouteWaterCost } from "./routeEstimate";

const flatField = { sampleHeight: () => 0, sampleNormal: () => [0, 1, 0] as const };

describe("estimateRouteWaterCost", () => {
  test("no flags gives an empty estimate", () => {
    const estimate = estimateRouteWaterCost([{ x: 0, z: 0 }], flatField, [0, 0], 17);
    expect(estimate.segments).toHaveLength(0);
    expect(estimate.totalWater).toBe(0);
  });

  test("matches the live drain formula for a single flat, windless leg", () => {
    const baseSpeed = 17;
    const estimate = estimateRouteWaterCost(
      [
        { x: 0, z: 0 },
        { x: 0, z: 100 },
      ],
      flatField,
      [0, 0],
      baseSpeed,
    );
    const pace = computePaceMultiplier({ slope: 0, windVector: [0, 0], headingRad: 0 });
    const speed = baseSpeed * pace.multiplier;
    const seconds = 100 / speed;
    const water = computeWaterDrainRate({ speed, headwind: headwindSeverity(pace.windAlignment) }) * seconds;
    expect(estimate.totalSeconds).toBeCloseTo(seconds, 5);
    expect(estimate.totalWater).toBeCloseTo(water, 5);
  });

  test("a headwind leg costs more water than a tailwind leg of equal length", () => {
    const headwindEstimate = estimateRouteWaterCost(
      [
        { x: 0, z: 0 },
        { x: 0, z: 200 },
      ],
      flatField,
      [0, -10],
      17,
    );
    const tailwindEstimate = estimateRouteWaterCost(
      [
        { x: 0, z: 0 },
        { x: 0, z: 200 },
      ],
      flatField,
      [0, 10],
      17,
    );
    expect(headwindEstimate.totalWater).toBeGreaterThan(tailwindEstimate.totalWater);
  });

  test("sums multiple legs", () => {
    const estimate = estimateRouteWaterCost(
      [
        { x: 0, z: 0 },
        { x: 0, z: 100 },
        { x: 100, z: 100 },
      ],
      flatField,
      [1, 0],
      17,
    );
    expect(estimate.segments).toHaveLength(2);
    expect(estimate.totalDistance).toBeCloseTo(200, 5);
  });
});
