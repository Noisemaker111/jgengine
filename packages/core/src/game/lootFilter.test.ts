import { describe, expect, test } from "bun:test";
import { evaluateLootFilter, lootFilter, type LootFilterRule } from "@jgengine/core/game/lootFilter";

const RULES: readonly LootFilterRule[] = lootFilter([
  { id: "hide-common-ammo", when: { rarity: "common", baseType: "resource" }, hide: true },
  { id: "rare-weapon", when: { rarity: "rare", baseType: "weapon" }, beam: true, color: "#60a5fa", label: "Rare" },
  { id: "legendary", when: { rarity: "legendary" }, beam: true, color: "#f59e0b", label: "LEGENDARY" },
  { id: "high-tier-affix", when: { baseType: "gear", minAffixTier: 3 }, beam: true, label: "Crafted" },
]);

describe("evaluateLootFilter", () => {
  test("first matching rule wins and only its fields override", () => {
    expect(evaluateLootFilter(RULES, { rarity: "common", baseType: "resource" })).toEqual({ hidden: true });
    expect(evaluateLootFilter(RULES, { rarity: "rare", baseType: "weapon" })).toEqual({
      beam: true,
      color: "#60a5fa",
      label: "Rare",
    });
    expect(evaluateLootFilter(RULES, { rarity: "legendary", baseType: "weapon" })).toEqual({
      beam: true,
      color: "#f59e0b",
      label: "LEGENDARY",
    });
  });

  test("no matching rule returns an empty override", () => {
    expect(evaluateLootFilter(RULES, { rarity: "uncommon", baseType: "armor" })).toEqual({});
  });

  test("affix tier range gates a rule", () => {
    expect(evaluateLootFilter(RULES, { rarity: "rare", baseType: "gear", affixTier: 2 })).toEqual({});
    expect(evaluateLootFilter(RULES, { rarity: "rare", baseType: "gear", affixTier: 3 })).toEqual({
      beam: true,
      label: "Crafted",
    });
  });

  test("rarity/baseType conditions accept an array of alternatives", () => {
    const rules = lootFilter([
      { id: "either", when: { rarity: ["rare", "legendary"] }, beam: true },
    ]);
    expect(evaluateLootFilter(rules, { rarity: "rare", baseType: "weapon" })).toEqual({ beam: true });
    expect(evaluateLootFilter(rules, { rarity: "legendary", baseType: "weapon" })).toEqual({ beam: true });
    expect(evaluateLootFilter(rules, { rarity: "common", baseType: "weapon" })).toEqual({});
  });

  test("lootFilter rejects duplicate rule ids", () => {
    expect(() =>
      lootFilter([
        { id: "dup", when: {} },
        { id: "dup", when: {} },
      ]),
    ).toThrow(/duplicated/);
  });
});
