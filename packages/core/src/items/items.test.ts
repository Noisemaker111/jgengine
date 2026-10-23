import { describe, expect, test } from "bun:test";
import type { AffixPool, RarityTier } from "../item/affix";
import type { LootBaseDef, LootCatalog, LootManufacturerDef } from "../loot/lootGen";
import { createInventorySet } from "../inventory/inventoryModel";
import { createShopStock } from "../economy/shopStock";
import { createEmptyWallet, balance, grant } from "../economy/wallet";
import { seededRng } from "../random/rng";
import { compareToEquipped, itemMass, rollDrop, type ItemDrop } from "./drop";
import { createRunHaul } from "./haul";
import { createItemLedger, salvageItem, salvageValue } from "./salvage";
import { createVendorRotation, itemPrice, stockVendor, type VendorPriceRule } from "./vendor";

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
  { id: "common", weight: 4, affixCount: 1 },
  { id: "rare", weight: 2, affixCount: 2, statScale: 1.2, namePart: "Fine" },
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
    const a = rollDrop(catalog, "run-7:drop-1", { level: 4 });
    const b = rollDrop(catalog, "run-7:drop-1", { level: 4 });
    expect(a).toEqual(b);
    expect(a.id).toBe("drop:run-7:drop-1");
  });

  test("a different seed changes the roll", () => {
    const a = rollDrop(catalog, "seed-a", { level: 4, baseId: "pistol", rarity: "common" });
    const b = rollDrop(catalog, "seed-b", { level: 4, baseId: "pistol", rarity: "common" });
    expect(a.affixes[0]?.value).not.toBe(b.affixes[0]?.value);
  });

  test("an affix below its minLevel never rolls", () => {
    for (let i = 0; i < 60; i += 1) {
      const item = rollDrop(catalog, `low-${i}`, { level: 1, baseId: "pistol" });
      expect(item.affixes.some((affix) => affix.id === "piercing")).toBe(false);
    }
  });

  test("the same affix enters the pool at its minLevel", () => {
    let seen = false;
    for (let i = 0; i < 200 && !seen; i += 1) {
      const item = rollDrop(catalog, `high-${i}`, { level: 5, baseId: "pistol", rarity: "rare" });
      seen = item.affixes.some((affix) => affix.id === "piercing");
    }
    expect(seen).toBe(true);
  });

  test("a base below its minLevel is neither rolled nor pinned", () => {
    for (let i = 0; i < 60; i += 1) {
      expect(rollDrop(catalog, `base-low-${i}`, { level: 2 }).baseId).toBe("pistol");
    }
    expect(() => rollDrop(catalog, "pinned", { level: 1, baseId: "rifle" })).toThrow(/item level 3/);
    expect(rollDrop(catalog, "pinned", { level: 3, baseId: "rifle" }).baseId).toBe("rifle");
  });

  test("mass grows with level and older saves fall back to one", () => {
    expect(rollDrop(catalog, "mass-1", { level: 1, baseId: "pistol" }).mass).toBe(2);
    expect(rollDrop(catalog, "mass-6", { level: 6, baseId: "pistol" }).mass).toBe(3);
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

  test("carrying refuses weight beyond capacity without mutating", () => {
    const inventories = createInventorySet({ run: { slots: 4 }, stash: { slots: 4 } }, traits());
    const haul = createRunHaul({
      inventories, runId: "run", stashId: "stash", weightOf, capacity: 9,
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
      inventories: first, runId: "run", stashId: "stash", weightOf, capacity: 20,
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
      inventories: reloaded, runId: "run", stashId: "stash", weightOf, capacity: 20,
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
      inventories, runId: "run", stashId: "stash", weightOf, capacity: 30,
      storage: null,
    });
    haul.carry("spare", 2);
    haul.bank();
    haul.carry("core", 3);
    expect(haul.mass()).toEqual({ run: 3, stash: 4, remaining: 27 });
  });
});

describe("salvage", () => {
  const table = {
    currency: "cores",
    perLevel: 3,
    rarityMultiplier: { rare: 2 },
  };

  test("yield follows level and rarity", () => {
    expect(salvageValue({ level: 5, rarity: "common" }, table)).toEqual({ currency: "cores", amount: 15 });
    expect(salvageValue({ level: 5, rarity: "rare" }, table)).toEqual({ currency: "cores", amount: 30 });
    expect(salvageValue({ level: 1, rarity: "common" }, { ...table, minimum: 4 })).toEqual({ currency: "cores", amount: 4 });
  });

  test("a salvaged item cannot be salvaged or sold again", () => {
    const ledger = createItemLedger();
    const item = { id: "drop:one", level: 3, rarity: "common" };
    const first = salvageItem(item, table, ledger);
    expect(first).toMatchObject({ ok: true, yield: { currency: "cores", amount: 9 } });
    expect(ledger.canUse(item.id)).toBe(false);
    expect(salvageItem(item, table, ledger)).toEqual({ ok: false, reason: "already-spent" });
    expect(ledger.spend(item.id, "sold")).toBe(false);
    expect(ledger.status(item.id)).toBe("salvaged");
  });

  test("the ledger round-trips as plain data", () => {
    const ledger = createItemLedger();
    ledger.spend("a", "salvaged");
    ledger.spend("b", "sold");
    const copy = createItemLedger(ledger.snapshot());
    expect(copy.status("a")).toBe("salvaged");
    expect(copy.status("b")).toBe("sold");
    expect(copy.status("c")).toBe("owned");
    expect(copy.restore({ a: "lost" as never })).toBe(false);
  });
});

describe("vendor stock", () => {
  const rule: VendorPriceRule = {
    currency: "credits",
    base: 10,
    perLevel: 5,
    rarityMultiplier: { rare: 1.5 },
    sellFactor: 0.4,
  };

  test("stock is rolled, priced and replaced on refresh", () => {
    const shop = createShopStock();
    const options = {
      catalog,
      rng: seededRng("vendor-1"),
      level: 2,
      count: 3,
      price: rule,
      idPrefix: "test.shelf",
    };
    const first = stockVendor(shop, options);
    expect(first).toHaveLength(3);
    expect(shop.list()).toHaveLength(3);
    expect(first[0]!.entry.price.amount).toBe(itemPrice(first[0]!.item, rule).buy);
    expect(first[0]!.entry.sellPrice?.amount).toBe(Math.floor(first[0]!.entry.price.amount * 0.4));

    const second = stockVendor(shop, { ...options, rng: seededRng("vendor-2") });
    expect(shop.list()).toHaveLength(3);
    expect(shop.list().map((entry) => entry.id)).toEqual(second.map((offer) => offer.entry.id));
  });

  test("a purchase charges the shared wallet", () => {
    const shop = createShopStock();
    const offers = stockVendor(shop, {
      catalog, rng: seededRng("buy"), level: 1, count: 1, price: rule, idPrefix: "buy",
    });
    const wallet = grant(createEmptyWallet(), "credits", 1000);
    const result = shop.buy(offers[0]!.entry.id, wallet);
    expect(result.ok).toBe(true);
    if (result.ok) expect(balance(result.wallet, "credits")).toBe(1000 - offers[0]!.entry.price.amount);
  });

  test("the restock rule counts runs", () => {
    const rotation = createVendorRotation(2);
    expect(rotation.due(1)).toBe(false);
    expect(rotation.due(2)).toBe(true);
    rotation.mark(2);
    expect(rotation.due(3)).toBe(false);
    expect(rotation.due(4)).toBe(true);
    expect(rotation.state()).toEqual({ refreshedAt: 2 });
  });
});
