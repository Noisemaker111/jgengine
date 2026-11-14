import { describe, expect, test } from "bun:test";
import { city } from "../city";
import { CRED_BY_JOB, PIZZA_CRED, CRED_GATES, credRequiredForLevel, MAX_CRED, resolveCredProgress } from "./cred";

describe("harbor-heat street cred", () => {
  test("every story mission pays cred", () => {
    for (const id of Object.keys(city.jobs ?? {})) {
      expect(CRED_BY_JOB[id] ?? 0).toBeGreaterThan(0);
    }
  });

  test("level costs grow with level", () => {
    for (let level = 1; level < MAX_CRED; level += 1) {
      expect(credRequiredForLevel(level + 1)).toBeGreaterThan(credRequiredForLevel(level));
    }
  });

  test("the jet-ski opens by the time Reading the Water asks for a hull, and the blimp by the blackout", () => {
    const water = resolveCredProgress(1, CRED_BY_JOB.welcome! + 12 * PIZZA_CRED.happy);
    expect(water.level).toBeGreaterThanOrEqual(CRED_GATES.car_sport!);
    const chain = ["welcome", "learn_water", "crust_war", "festival_night", "riptide_run", "storm_surge"] as const;
    const xp = chain.reduce((total, id) => total + CRED_BY_JOB[id]!, 0) + 40 * PIZZA_CRED.happy;
    expect(resolveCredProgress(1, xp).level).toBeGreaterThanOrEqual(CRED_GATES.air_helicopter!);
  });

  test("finishing the whole story cannot hit the cred cap", () => {
    const xp = Object.entries(CRED_BY_JOB).filter(([id]) => city.jobs?.[id]?.kind !== "side").map(([, cred]) => cred).reduce((a, b) => a + b, 0);
    const progress = resolveCredProgress(1, xp);
    expect(progress.level).toBeLessThan(MAX_CRED);
  });
});
