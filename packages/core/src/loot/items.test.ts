import { describe, expect, test } from "bun:test";
import type { AffixPool, RarityTier } from "../item/affix";
import type { LootBaseDef, LootCatalog, LootManufacturerDef } from "./lootGen";
import { createInventorySet } from "../inventory/inventoryModel";
import { runGenerator } from "../generator/generator";
import { compareToEquipped, itemMass, type ItemDrop } from "./drop";
import { defineLootGenerator } from "./lootGenerator";
import { createRunHaul } from "./haul";

const pools: AffixPool[] = [
  {
    id: "damage",
    affixes: [
      { id: "honed", stat: "damage", roll: [2, 4], weight: 2, minLevel: 1, namePart: { position: "prefix", text: "Honed" } },
      { id: "piercing", stat: "damage", roll: [10, 20], weight: 1, minLevel: 5 },
      { id: "steady", stat: "spread", op: "mul", roll: [0.8, 0.95], weight: 1, minLevel: 1, namePart: { position: "suffix", text: "of Holding" } },
    ],
  },
];

const rarities: RarityTier[] = [
  { id: "common", at: 0, weight: 4, affixCount: 1 },
  { id: "rare", at: 1, weight: 2, affixCount: 2, statScale: 1.2, namePart: "Fine" },
];

const bases: LootBaseDef[] = [
  { id: "pistol", name: "Sidearm", baseStats: { damage: 8, spread: 1 }, pools: ["damage"], mass: 2 },
  { id: "rifle", name: "Longarm", baseStats: { damage: 14, spread: 1 }, pools: ["damage"], minLevel: 3, mass: 4 },
];

const manufacturers: LootManufacturerDef[] = [
  { id: "vex", name: "Vex", bias: { damage: 1 }, favoredPools: ["damage"] },
];

const catalog: LootCatalog = {
  bases,
  parts: [],
  pools,
  rarities,
  manufacturers,
  levelScale: [[1, 1], [10, 2.2]],
};

const LOOT = defineLootGenerator({ id: "test.items", label: "Test items", catalog });

/** One seeded drop through the loot generator, with the id a stash names it by. */
function seededDrop(seed: string, options: { level: number; base?: string; rarity?: string }): ItemDrop {
  const [item] = runGenerator(LOOT, { seed, count: 1, level: options.level, base: options.base ?? "", rarity: options.rarity ?? "" });
  return { ...item!, id: `drop:${seed}` };
}

function traits() {
  return { stackLimit: () => 99 };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("deterministic level-gated drops", () => {
  test("the same seed rolls the same item", () => {
    const a = seededDrop("run-7:drop-1", { level: 4 });
    const b = seededDrop("run-7:drop-1", { level: 4 });
    expect(a).toEqual(b);
    expect(a.id).toBe("drop:run-7:drop-1");
  });

  test("a different seed changes the roll", () => {
    const a = seededDrop("seed-a", { level: 4, base: "pistol", rarity: "common" });
    const b = seededDrop("seed-b", { level: 4, base: "pistol", rarity: "common" });
    expect(a.affixes[0]?.value).not.toBe(b.affixes[0]?.value);
  });

  test("an affix below its minLevel never rolls", () => {
    for (let i = 0; i < 60; i += 1) {
      const item = seededDrop(`low-${i}`, { level: 1, base: "pistol" });
      expect(item.affixes.some((affix) => affix.id === "piercing")).toBe(false);
    }
  });

  test("the same affix enters the pool at its minLevel", () => {
    let seen = false;
    for (let i = 0; i < 200 && !seen; i += 1) {
      const item = seededDrop(`high-${i}`, { level: 5, base: "pistol", rarity: "rare" });
      seen = item.affixes.some((affix) => affix.id === "piercing");
    }
    expect(seen).toBe(true);
  });

  test("a base below its minLevel is neither rolled nor pinned", () => {
    for (let i = 0; i < 60; i += 1) {
      expect(seededDrop(`base-low-${i}`, { level: 2 }).baseId).toBe("pistol");
    }
    expect(() => seededDrop("pinned", { level: 1, base: "rifle" })).toThrow(/item level 3/);
    expect(seededDrop("pinned", { level: 3, base: "rifle" }).baseId).toBe("rifle");
  });

  test("mass grows with level and older saves fall back to one", () => {
    expect(seededDrop("mass-1", { level: 1, base: "pistol" }).mass).toBe(2);
    expect(seededDrop("mass-6", { level: 6, base: "pistol" }).mass).toBe(3);
    expect(itemMass({})).toBe(1);
  });
});

describe("comparison against equipped", () => {
  function drop(id: string, stats: Record<string, number>): ItemDrop {
    return {
      id,
      baseId: "pistol",
      manufacturer: "vex",
      rarity: "common",
      level: 1,
      name: id,
      parts: [],
      affixes: [],
      stats,
      mass: 2,
    };
  }

  test("reports one delta per stat and a weighted verdict", () => {
    const worn = drop("worn", { damage: 10, reload: 2 });
    const fresh = drop("fresh", { damage: 14, reload: 3 });
    const comparison = compareToEquipped(fresh, worn, { lowerIsBetter: ["reload"] });
    expect(comparison.equippedId).toBe("worn");
    expect(comparison.deltas).toEqual([
      { stat: "damage", a: 10, b: 14, delta: 4, better: "candidate" },
      { stat: "reload", a: 2, b: 3, delta: 1, better: "equipped" },
    ]);
    expect(comparison.scoreDelta).toBe(3);
    expect(comparison.better).toBe("candidate");
  });

  test("an empty slot compares against zero", () => {
    const fresh = drop("fresh", { damage: 14 });
    const comparison = compareToEquipped(fresh, null);
    expect(comparison.equippedId).toBeNull();
    expect(comparison.deltas).toEqual([
      { stat: "damage", a: 0, b: 14, delta: 14, better: "candidate" },
    ]);
    expect(comparison.better).toBe("candidate");
  });
});

describe("run haul", () => {
  const masses: Record<string, number> = { spare: 2, engine: 8, core: 1 };
  const weightOf = (id: string) => masses[id] ?? 0;
  /** The test's own bands: encumbered from 85% load, slowing toward half speed at capacity. */
  const TUNING = { soft: 0.85, floor: 0.5 } as const;

  test("carrying refuses weight beyond capacity without mutating", () => {
    const inventories = createInventorySet({ run: { slots: 4 }, stash: { slots: 4 } }, traits());
    const haul = createRunHaul({
      inventories, runId: "run", stashId: "stash", weightOf, capacity: 9, encumbrance: TUNING,
      storage: memoryStorage(),
    });
    expect(haul.carry("engine")).toMatchObject({ ok: true, mass: 8, remaining: 1 });
    const refused = haul.carry("spare");
    expect(refused).toMatchObject({ ok: false, reason: "over-capacity", mass: 8 });
    expect(inventories.count("run", "spare")).toBe(0);
    expect(haul.carry("core", 0)).toMatchObject({ ok: false, reason: "invalid-count" });
  });

  test("a banked stash survives a reload and a failed run loses only the haul", () => {
    const storage = memoryStorage();
    const first = createInventorySet({ run: { slots: 4 }, stash: { slots: 4 } }, traits());
    const haul = createRunHaul({
      inventories: first, runId: "run", stashId: "stash", weightOf, capacity: 20, encumbrance: TUNING,
      storage, key: "test.stash",
    });
    expect(haul.carry("spare", 2).ok).toBe(true);
    expect(haul.carry("engine").ok).toBe(true);
    const banked = haul.bank();
    expect(banked.stacks).toHaveLength(2);
    expect(first.count("run", "engine")).toBe(0);
    expect(first.count("stash", "engine")).toBe(1);
    expect(first.count("stash", "spare")).toBe(2);

    const reloaded = createInventorySet({ run: { slots: 4 }, stash: { slots: 4 } }, traits());
    const second = createRunHaul({
      inventories: reloaded, runId: "run", stashId: "stash", weightOf, capacity: 20, encumbrance: TUNING,
      storage, key: "test.stash",
    });
    expect(second.load()).toBe(true);
    expect(reloaded.count("stash", "engine")).toBe(1);
    expect(reloaded.count("stash", "spare")).toBe(2);

    expect(second.carry("core", 3).ok).toBe(true);
    const lost = second.fail();
    expect(lost.stacks).toEqual([{ itemId: "core", count: 3 }]);
    expect(reloaded.count("run", "core")).toBe(0);
    expect(reloaded.count("stash", "engine")).toBe(1);
  });

  test("mass reads carried weight and the untouched stash separately", () => {
    const inventories = createInventorySet({ run: { slots: 4 }, stash: { slots: 4 } }, traits());
    const haul = createRunHaul({
      inventories, runId: "run", stashId: "stash", weightOf, capacity: 30, encumbrance: TUNING,
      storage: null,
    });
    haul.carry("spare", 2);
    haul.bank();
    haul.carry("core", 3);
    expect(haul.mass()).toEqual({ run: 3, stash: 4, remaining: 27 });
  });
});
