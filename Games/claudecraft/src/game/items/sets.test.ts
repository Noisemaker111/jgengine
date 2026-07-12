import { describe, expect, test } from "bun:test";

import { ITEMS } from "./catalog";
import {
  aggregateSetBonuses,
  equippedSetCounts,
  equippedSetStatus,
  ITEM_SETS,
} from "./sets";

describe("item sets", () => {
  test("every ItemDef.set resolves to a defined set", () => {
    for (const item of ITEMS) {
      if (item.set === undefined) continue;
      expect(ITEM_SETS[item.set], `item "${item.id}" tags unknown set "${item.set}"`).toBeDefined();
    }
  });

  test("every set has enough distinct-slot pieces for its 3-piece bonus", () => {
    for (const set of Object.values(ITEM_SETS)) {
      const pieces = ITEMS.filter((item) => item.set === set.id);
      expect(pieces.length, `set "${set.id}" has too few items`).toBeGreaterThanOrEqual(3);
      const slots = new Set(pieces.map((item) => item.slot));
      expect(slots.size, `set "${set.id}" pieces do not span 3 distinct slots`).toBeGreaterThanOrEqual(3);
      const topTier = Math.max(...set.bonuses.map((tier) => tier.pieces));
      expect(topTier).toBeLessThanOrEqual(4);
    }
  });

  test("aggregate is empty below the 2-piece threshold", () => {
    const bonus = aggregateSetBonuses(new Map([["crownforged", 1]]));
    expect(bonus.ap).toBe(0);
    expect(bonus.hastePct).toBe(0);
    expect(bonus.procs).toEqual([]);
  });

  test("plate tier-2 stacks 2/3-piece stats and haste", () => {
    const bonus = aggregateSetBonuses(new Map([["crownforged", 3]]));
    expect(bonus.ap).toBe(40);
    expect(bonus.str).toBe(15);
    expect(bonus.sta).toBe(15);
    expect(bonus.hastePct).toBeCloseTo(0.15);
    expect(bonus.procs).toEqual([]);
  });

  test("four pieces unlock the proc", () => {
    const bonus = aggregateSetBonuses(new Map([["crownforged", 4]]));
    expect(bonus.procs).toHaveLength(1);
    expect(bonus.procs[0].id).toBe("set_bonesplinter");
    expect(bonus.procs[0].trigger).toBe("weaponCrit");
  });

  test("leather tier-2 grants crit and haste at 3 pieces", () => {
    const bonus = aggregateSetBonuses(new Map([["nighttalon", 3]]));
    expect(bonus.agi).toBe(15);
    expect(bonus.critPct).toBe(2);
    expect(bonus.hastePct).toBeCloseTo(0.15);
  });

  test("caster tier-1 grants a spellCast proc at 4 pieces", () => {
    const bonus = aggregateSetBonuses(new Map([["necromancers", 4]]));
    expect(bonus.sp).toBe(20);
    expect(bonus.procs[0].id).toBe("set_clearcasting");
    expect(bonus.procs[0].trigger).toBe("spellCast");
  });

  test("equippedSetCounts counts pieces across slots", () => {
    const counts = equippedSetCounts({
      helmet: "crownforged_dreadhelm",
      shoulder: "crownforged_warspaulders",
      waist: "crownforged_girdle",
      gloves: "nighttalon_grips",
    });
    expect(counts.get("crownforged")).toBe(3);
    expect(counts.get("nighttalon")).toBe(1);
  });

  test("equippedSetStatus flags active tiers", () => {
    const status = equippedSetStatus({
      helmet: "crownforged_dreadhelm",
      shoulder: "crownforged_warspaulders",
      waist: "crownforged_girdle",
    });
    const crown = status.find((entry) => entry.setId === "crownforged");
    expect(crown?.equipped).toBe(3);
    expect(crown?.tiers.find((tier) => tier.pieces === 2)?.active).toBe(true);
    expect(crown?.tiers.find((tier) => tier.pieces === 4)?.active).toBe(false);
  });
});
