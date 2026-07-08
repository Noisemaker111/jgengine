import { describe, expect, test } from "bun:test";

import { LEVELING, MAX_LEVEL } from "./curves";

describe("swarm-survivor progression curve", () => {
  test("xp requirement grows every level", () => {
    let previous = LEVELING.xpForLevel(1);
    for (let level = 2; level < 12; level += 1) {
      const requirement = LEVELING.xpForLevel(level);
      expect(requirement).toBeGreaterThan(previous);
      previous = requirement;
    }
  });

  test("resolve rolls overflow xp into levels gained", () => {
    const firstLevelCost = LEVELING.xpForLevel(1);
    const progress = LEVELING.resolve(1, firstLevelCost + 5);
    expect(progress.level).toBe(2);
    expect(progress.levelsGained).toBe(1);
    expect(progress.xp).toBe(5);
  });

  test("grantXp seeds level-ups through the stat access seam", () => {
    const stats = new Map<string, { current: number; max: number }>([
      ["xp", { current: 0, max: LEVELING.xpForLevel(1) }],
      ["level", { current: 1, max: MAX_LEVEL }],
    ]);
    const access = {
      get: (_userId: string, statId: string) => stats.get(statId) ?? null,
      set: (_userId: string, statId: string, patch: { current?: number; max?: number }) => {
        const existing = stats.get(statId);
        if (existing === undefined) return;
        stats.set(statId, { current: patch.current ?? existing.current, max: patch.max ?? existing.max });
      },
    };
    const levelUps: number[] = [];
    const gained = LEVELING.grantXp(access, "player", LEVELING.xpForLevel(1) + 1, (level) => levelUps.push(level));
    expect(gained).toBe(1);
    expect(levelUps).toEqual([2]);
    expect(stats.get("level")?.current).toBe(2);
  });

  test("never exceeds the configured max level", () => {
    const progress = LEVELING.resolve(1, 10_000_000);
    expect(progress.level).toBe(MAX_LEVEL);
    expect(progress.xp).toBe(0);
  });
});
