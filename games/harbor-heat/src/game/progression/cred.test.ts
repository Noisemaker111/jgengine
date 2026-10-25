import { describe, expect, test } from "bun:test";
import { city } from "../city";
import { BOUNTY_CRED, CRED_BY_JOB, CRED_GATES, credRequiredForLevel, MAX_CRED, resolveCredProgress } from "./cred";

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

  test("the smg gate opens by the docks arc (m1 + m2 + one bounty)", () => {
    const xp = CRED_BY_JOB.welcome! + CRED_BY_JOB.dock_sweep! + BOUNTY_CRED;
    const progress = resolveCredProgress(1, xp);
    expect(progress.level).toBeGreaterThanOrEqual(CRED_GATES.smg_carmine!);
  });

  test("the cicada gate opens by the time m6 asks you to steal one", () => {
    const chain = ["welcome", "dock_sweep", "ledger", "shake_heat", "ocean_loop"] as const;
    const xp = chain.reduce((total, id) => total + CRED_BY_JOB[id]!, 0);
    const progress = resolveCredProgress(1, xp);
    expect(progress.level).toBeGreaterThanOrEqual(CRED_GATES.car_sport!);
  });

  test("finishing the whole story cannot hit the cred cap", () => {
    const xp = Object.entries(CRED_BY_JOB).filter(([id]) => city.jobs?.[id]?.kind !== "side").map(([, cred]) => cred).reduce((a, b) => a + b, 0);
    const progress = resolveCredProgress(1, xp);
    expect(progress.level).toBeLessThan(MAX_CRED);
  });
});
