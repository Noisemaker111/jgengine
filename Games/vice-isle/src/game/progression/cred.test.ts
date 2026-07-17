import { describe, expect, test } from "bun:test";
import { QUESTS } from "../quests/catalog";
import { BOUNTY_CRED, CRED_BY_QUEST, CRED_GATES, credRequiredForLevel, MAX_CRED, resolveCredProgress } from "./cred";

describe("vice-isle street cred", () => {
  test("every story mission pays cred", () => {
    for (const quest of QUESTS) {
      expect(CRED_BY_QUEST[quest.id] ?? 0).toBeGreaterThan(0);
    }
  });

  test("level costs grow with level", () => {
    for (let level = 1; level < MAX_CRED; level += 1) {
      expect(credRequiredForLevel(level + 1)).toBeGreaterThan(credRequiredForLevel(level));
    }
  });

  test("the smg gate opens by the docks arc (m1 + m2 + one bounty)", () => {
    const xp = CRED_BY_QUEST.m1_welcome! + CRED_BY_QUEST.m2_dock_sweep! + BOUNTY_CRED;
    const progress = resolveCredProgress(1, xp);
    expect(progress.level).toBeGreaterThanOrEqual(CRED_GATES.smg_carmine!);
  });

  test("the cicada gate opens by the time m6 asks you to steal one", () => {
    const chain = ["m1_welcome", "m2_dock_sweep", "m3_the_ledger", "m4_shake_the_heat", "m5_ocean_loop"] as const;
    const xp = chain.reduce((total, id) => total + CRED_BY_QUEST[id]!, 0);
    const progress = resolveCredProgress(1, xp);
    expect(progress.level).toBeGreaterThanOrEqual(CRED_GATES.car_sport!);
  });

  test("finishing the whole story cannot hit the cred cap", () => {
    const xp = Object.values(CRED_BY_QUEST).reduce((a, b) => a + b, 0);
    const progress = resolveCredProgress(1, xp);
    expect(progress.level).toBeLessThan(MAX_CRED);
  });
});
