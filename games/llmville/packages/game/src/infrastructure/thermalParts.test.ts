import { describe, expect, test } from "bun:test";
import {
  computeCardTemperatureC,
  computeThermalState,
  gridHookupCapacityKw,
  rackHeatBand,
} from "@llmville/game/infrastructure/infrastructure";

describe("grid hookup Ladder", () => {
  test("each level keeps its service capacity, clamped at both ends", () => {
    expect([-1, 0, 0.4, 0.5, 1, 2, 3, 4, 5, 9, Number.NaN].map(gridHookupCapacityKw)).toEqual([1.5, 1.5, 1.5, 5, 5, 20, 100, 600, 600, 600, 1.5]);
  });
});

describe("rack heat Meter", () => {
  test("temperatures keep their values along the cooling curve", () => {
    const cases: readonly (readonly [number, number, number, number])[] = [
      [0, 1, 1, 22],
      [1, 0, 0, 100],
      [0.5, 1, 1, 60.285799192611165],
      [1, 1, 1, 79.77925966962047],
      [2, 1, 0.54, 94.75797000629952],
      [1.08, 1, 1, 81.84930545919747],
      [3, 1, 0.36000000000000004, 98.64105477811951],
    ];
    for (const [heat, cooling, throttle, temperature] of cases) {
      const state = computeThermalState(heat, cooling);
      expect(state.throttleFactor).toBe(throttle);
      expect(state.temperatureC).toBe(temperature);
      expect(computeCardTemperatureC(heat, cooling)).toBe(temperature);
    }
  });

  test("a card with no cooling share and no heat sits at ambient", () => {
    expect(computeCardTemperatureC(0, 0)).toBe(22);
    expect(computeCardTemperatureC(0.2, -1)).toBe(100);
  });
});

describe("rack heat bands", () => {
  test("badge bands start at 65 and 80 °C", () => {
    expect([22, 64.9, 65, 79.99, 80, 100, Number.NaN].map(rackHeatBand)).toEqual(["cool", "cool", "warm", "warm", "hot", "hot", "cool"]);
  });
});
