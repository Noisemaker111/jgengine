import { describe, expect, test } from "bun:test";
import { enemyById } from "../entities/enemies/catalog";
import { ENEMY_COSTS, WAVES, WAVE_COUNT } from "./manifest";

describe("wave manifests", () => {
  test("ten waves, all entries resolve to enemies", () => {
    expect(WAVE_COUNT).toBe(10);
    for (const wave of WAVES) {
      expect(wave.entries.length).toBeGreaterThan(0);
      for (const entry of wave.entries) {
        expect(enemyById(entry.id)).toBeDefined();
        expect(entry.cost).toBe(ENEMY_COSTS[entry.id]!);
      }
    }
  });

  test("every wave affords at least one spawn", () => {
    for (const wave of WAVES) {
      const cheapest = Math.min(...wave.entries.map((entry) => entry.cost));
      expect(wave.budget).toBeGreaterThanOrEqual(cheapest);
    }
  });

  test("bosses arrive on waves 5 and 10", () => {
    expect(WAVES[4]!.entries.some((entry) => entry.id === "boss_warden")).toBe(true);
    expect(WAVES[9]!.entries.some((entry) => entry.id === "boss_dreadnought")).toBe(true);
    expect(WAVES[4]!.budget).toBeGreaterThanOrEqual(ENEMY_COSTS.boss_warden!);
    expect(WAVES[9]!.budget).toBeGreaterThanOrEqual(ENEMY_COSTS.boss_dreadnought!);
  });

  test("non-boss budgets escalate", () => {
    const nonBoss = [0, 1, 2, 3, 5, 6, 7, 8].map((index) => WAVES[index]!.budget);
    for (let i = 1; i < nonBoss.length; i += 1) {
      expect(nonBoss[i]!).toBeGreaterThan(nonBoss[i - 1]!);
    }
  });
});
