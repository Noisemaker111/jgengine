import { describe, expect, test } from "bun:test";
import { createItemLedger, salvageItem } from "@jgengine/core/loot/salvage";
import { compareToEquipped } from "@jgengine/core/loot/drop";
import { BREAKDOWN, COMPARE_OPTIONS, ITEM_CATALOG, RARITIES, breakdownValue, compareToPrepared, itemValue, itemWeight, kindOf, rollItem, weaponStats } from "./items";
import { CACHE_WEIGHT, bankHaul, canCache, loadOf, loseHaul } from "./haul";
import { depart, newDive, newHome, settle, takeLoot, type Dive, type ItemKind } from "./state";
import { weaponReadout } from "./combat";
import { depthAt } from "../world";

const rifle = (level: number, seed: string) => rollItem("service-rifle", level, seed, `dive:${seed}`);
const wire = rollItem("wire", 1, "w", "1:wire");
const polymer = rollItem("polymer", 2, "p", "1:polymer");
const cells = rollItem("cells", 2, "c", "1:cells");
const ink = rollItem("ink", 4, "i", "1:ink");
function loot(dive: Dive, source: string, kind: ItemKind, depth = 1): Dive {
  const result = takeLoot(dive, source, kind, depth);
  if (!result.ok) throw new Error(result.message);
  return result.dive;
}

describe("items roll from the authored table", () => {
  test("the same seed rolls the same instance; a different seed may not", () => {
    expect(JSON.stringify(rifle(3, "deepward:7:fitter"))).toBe(JSON.stringify(rifle(3, "deepward:7:fitter")));
    expect(JSON.stringify(rifle(3, "deepward:8:fitter"))).not.toBe(JSON.stringify(rifle(3, "deepward:7:fitter")));
  });

  test("item level comes from room depth, so a deep room rolls above the entrance", () => {
    const shallow = rifle(depthAt([0, 0, -3], "vault"), "same-seed");
    const deep = rifle(depthAt([0, 0, -39], "vault"), "same-seed");
    expect(shallow.level).toBe(1);
    expect(deep.level).toBe(4);
    expect(deep.stats.damage!).toBeGreaterThan(shallow.stats.damage!);
    expect(itemValue(deep)).toBeGreaterThan(itemValue(shallow));
  });

  test("every rolled affix and rarity comes from the shared weighted table", () => {
    const affixIds = new Set(ITEM_CATALOG.pools.flatMap(pool => pool.affixes.map(affix => affix.id)));
    const rarityIds = new Set(RARITIES.map(tier => tier.id));
    const seen = new Set<string>();
    const kinds: ItemKind[] = ["wire", "polymer", "cells", "ink", "service-rifle"];
    for (let seed = 0; seed < 120; seed += 1) {
      const item = rollItem(kinds[seed % kinds.length]!, 1 + (seed % 4), `spread:${seed}`, `spread:${seed}`);
      expect(rarityIds.has(item.rarity)).toBe(true);
      expect(item.affixes.length).toBeLessThanOrEqual(4);
      for (const affix of item.affixes) {
        expect(affixIds.has(affix.id)).toBe(true);
        seen.add(affix.id);
      }
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  test("a better rifle shows per-stat deltas against the prepared one", () => {
    const equipped = rollItem("service-rifle", 1, "compare:equipped", "1:fitter");
    const candidate = rollItem("service-rifle", 4, "compare:candidate", "2:fitter");
    const comparison = compareToPrepared(candidate, equipped);
    const damage = comparison.deltas.find(delta => delta.stat === "damage")!;
    expect(damage.delta).toBeGreaterThan(0);
    expect(damage.better).toBe("candidate");
    expect(comparison.better).toBe("candidate");
    expect(compareToEquipped(equipped, candidate, COMPARE_OPTIONS).better).toBe("equipped");
  });

  test("the rifle in hand fires the rolled numbers, not a constant", () => {
    const strong = rifle(4, "hand:strong");
    const plain = rifle(1, "hand:plain");
    const dive: Dive = { ...newDive(1), hand: "service-rifle", cache: [{ ...strong, x: 0, y: 0, rotated: false }] };
    expect(weaponReadout(dive).damage).toBe(Math.round(strong.stats.damage!));
    expect(weaponStats(strong).damage).toBeGreaterThan(weaponStats(plain).damage);
    expect(weaponReadout({ ...dive, hand: "sidearm" }).damage).toBe(20);
    expect(weaponReadout(null).damage).toBe(20);
  });
});

describe("weight, bank and loss", () => {
  test("the pack refuses a haul over capacity with a sentence", () => {
    const loaded = [wire, polymer, cells];
    expect(loadOf(loaded).mass).toBeLessThanOrEqual(CACHE_WEIGHT);
    const refused = canCache(loaded, ink);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected a refusal");
    expect(refused.reason).toBe("over-capacity");
    expect(refused.message).toBe(`${ink.name} would put the cache at ${Math.round((loadOf(loaded).mass + itemWeight(ink)) * 100) / 100} of ${CACHE_WEIGHT}. Leave something behind first.`);
    expect(itemWeight(ink)).toBeGreaterThan(itemWeight(wire));
  });

  test("the extraction refuses an item once the load is full, and takes it when there is room", () => {
    const packed = [wire, polymer, cells].reduce((dive, item, index) => ({ ...dive, cache: [...dive.cache, { ...item, x: index, y: 0, rotated: false }] }), newDive(1));
    const full = takeLoot(packed, "ink", "ink", 4);
    expect(full.ok).toBe(false);
    if (full.ok) throw new Error("expected a refusal");
    expect(full.reason).toBe("over-capacity");
    expect(full.message).toContain("Leave something behind first.");
    const light = [{ ...wire, x: 0, y: 0, rotated: false }];
    const taken = takeLoot({ ...newDive(1), cache: light }, "fitter", "service-rifle", 4);
    expect(taken.ok).toBe(true);
    if (!taken.ok) throw new Error(taken.message);
    expect(taken.dive.cache.map(item => kindOf(item))).toEqual(["wire", "service-rifle"]);
  });

  test("a banked run keeps its instances and a lost Life keeps only the bank", () => {
    const banked = bankHaul([wire, ink], []);
    expect(banked.banked.map(item => item.id)).toEqual(["1:wire", "1:ink"]);
    expect(banked.refused).toEqual([]);
    expect(loseHaul([wire, ink]).map(item => item.id)).toEqual(["1:wire", "1:ink"]);
    expect(bankHaul([], [wire]).banked).toEqual([]);
  });

  test("the stash outlives the Life that carried the haul", () => {
    const first = depart(newHome());
    const home = settle(first, loot(newDive(1), "ink", "ink", 4), "extracted", "Rail");
    expect(home.stash[0]!.level).toBe(4);
    const away = depart(home);
    const lost = settle(away, loot(newDive(2), "wire", "wire", 1), "lost", "No air");
    expect(lost.stash).toEqual(home.stash);
    expect(lost.bank.banked).toBeGreaterThan(0);
    expect(lost.deaths).toBe(1);
  });

  test("a broken-down instance pays once and cannot be used again", () => {
    const ledger = createItemLedger({});
    expect(ledger.canUse(ink.id)).toBe(true);
    const paid = salvageItem(ink, BREAKDOWN, ledger);
    expect(paid.ok).toBe(true);
    expect(paid.ok && paid.yield.amount).toBe(breakdownValue(ink));
    const again = salvageItem(ink, BREAKDOWN, ledger);
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.reason).toBe("already-spent");
    expect(ledger.canUse(ink.id)).toBe(false);
    expect(ledger.snapshot()).toEqual({ [ink.id]: "salvaged" });
  });
});
