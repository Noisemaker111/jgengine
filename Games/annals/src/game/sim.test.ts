import { describe, expect, test } from "bun:test";

import { initPools, populationOf, tickDailyDrift, totalPopulation } from "./sim";
import { settlements } from "./settlements";

describe("sim population pools", () => {
  test("daily drift clamps every settlement pool within a sane, non-negative range", () => {
    initPools();
    for (let day = 0; day < 2000; day += 1) tickDailyDrift();

    for (const settlement of settlements) {
      const population = populationOf(settlement.id);
      expect(population).toBeGreaterThanOrEqual(20);
      expect(population).toBeLessThanOrEqual(settlement.population * 8);
      expect(Number.isFinite(population)).toBe(true);
    }
    expect(totalPopulation()).toBeGreaterThan(0);
  });
});
