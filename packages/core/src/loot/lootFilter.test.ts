import { describe, expect, test } from "bun:test";
import { evaluateLootFilter, lootFilter, type LootFilterRule } from "@jgengine/core/loot/lootFilter";

const RULES: readonly LootFilterRule[] = lootFilter([
  { id: "hide-common-ammo", when: { all: [{ eq: ["rarity", "common"] }, { eq: ["baseType", "resource"] }] }, hide: true },
  { id: "rare-weapon", when: { all: [{ eq: ["rarity", "rare"] }, { eq: ["baseType", "weapon"] }] }, beam: true, color: "#60a5fa", label: "Rare" },
  { id: "legendary", when: { eq: ["rarity", "legendary"] }, beam: true, color: "#f59e0b", label: "LEGENDARY" },
  { id: "high-tier-affix", when: { all: [{ eq: ["baseType", "gear"] }, { gte: ["affixTier", 3] }] }, beam: true, label: "Crafted" },
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
      { id: "either", when: { in: ["rarity", ["rare", "legendary"]] }, beam: true },
    ]);
    expect(evaluateLootFilter(rules, { rarity: "rare", baseType: "weapon" })).toEqual({ beam: true });
    expect(evaluateLootFilter(rules, { rarity: "legendary", baseType: "weapon" })).toEqual({ beam: true });
    expect(evaluateLootFilter(rules, { rarity: "common", baseType: "weapon" })).toEqual({});
  });

  test("an untiered item reads as tier 0 inside a tier range", () => {
    const rules = lootFilter([{ id: "low", when: { all: [{ gte: ["affixTier", 0] }, { lte: ["affixTier", 1] }] }, hide: true }]);
    expect(evaluateLootFilter(rules, { rarity: "common", baseType: "gear" })).toEqual({ hidden: true });
    expect(evaluateLootFilter(rules, { rarity: "common", baseType: "gear", affixTier: 2 })).toEqual({});
  });

  test("lootFilter rejects duplicate rule ids", () => {
    expect(() =>
      lootFilter([
        { id: "dup", when: { all: [] } },
        { id: "dup", when: { all: [] } },
      ]),
    ).toThrow(/duplicated/);
  });
});
