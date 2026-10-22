import { describe, expect, test } from "bun:test";

import { compareGearSets, gearScore } from "./gearScore";

const options = {
  weights: { damage: 2 },
  lowerIsBetter: ["weight"],
  levelWeight: 0.5,
  rarityScore: { rare: 10 },
  expectedSlots: ["weapon", "armor", "relic"],
  emptySlotPenalty: 5,
};

describe("gear score", () => {
  test("aggregates a set with the documented formula", () => {
    const score = gearScore(
      {
        weapon: { stats: { damage: 30, weight: 12 }, level: 5, rarity: "rare" },
        armor: { stats: { armor: 40 }, level: 4 },
      },
      options,
    );

    // weapon: 30x2 + 12x-1 + 0.5x5 + 10 = 60 - 12 + 2.5 + 10 = 60.5
    // armor: 40 + 0.5x4 = 42; total 102.5 minus one empty slot (5) = 97.5
    expect(score.bySlot).toEqual({ armor: 42, weapon: 60.5 });
    expect(score.byStat).toEqual({ armor: 40, damage: 60, weight: -12 });
    expect(score.score).toBeCloseTo(97.5, 6);
    expect(score.items).toBe(2);
    expect(score.average).toBeCloseTo(48.75, 6);
    expect(score.coverage).toBeCloseTo(2 / 3, 6);
    expect(score.emptySlots).toEqual(["relic"]);
  });

  test("rises when the gear is better and falls for an empty loadout", () => {
    const plain = {
      weapon: { stats: { damage: 20 }, level: 3 },
      armor: { stats: { armor: 20 }, level: 3 },
      relic: { stats: { crit: 0.1 }, level: 1 },
    };
    const upgraded = {
      weapon: { stats: { damage: 34, weight: 9 }, level: 8, rarity: "rare" },
      armor: { stats: { armor: 31 }, level: 7 },
      relic: { stats: { crit: 0.2 }, level: 6 },
    };
    const comparison = compareGearSets(plain, upgraded, options);
    expect(comparison.a.score).toBeLessThan(comparison.b.score);
    expect(comparison.delta).toBeGreaterThan(0);
    expect(comparison.better).toBe("b");

    const empty = gearScore({}, options);
    expect(empty).toMatchObject({ score: -15, items: 0, average: 0, coverage: 0, emptySlots: ["weapon", "armor", "relic"] });
  });

  test("counts only filled slots and ignores nulls", () => {
    const score = gearScore({ weapon: { stats: { damage: 5 } }, armor: null, relic: undefined });
    expect(score.items).toBe(1);
    expect(score.score).toBe(5);
    expect(score.coverage).toBe(1);
    expect(score.byStat).toEqual({ damage: 5 });
  });

  test("is a pure read: the same set always scores the same", () => {
    const set = { weapon: { stats: { damage: 12, weight: 4 }, level: 2, rarity: "rare" } };
    expect(gearScore(set, options)).toEqual(gearScore(set, options));
    expect(compareGearSets(set, set, options)).toMatchObject({ delta: 0, better: "equal" });
  });
});
