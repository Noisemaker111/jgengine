import { describe, expect, test } from "bun:test";
import type { AffixPool, RarityTier } from "@jgengine/core/item/affix";
import type { LootBaseDef, LootCatalog, LootManufacturerDef } from "@jgengine/core/loot/lootGen";
import { createInventorySet } from "@jgengine/core/inventory/inventoryModel";
import { createShopStock } from "@jgengine/core/economy/shopStock";
import { createEmptyWallet, balance, grant } from "@jgengine/core/economy/wallet";
import { runGenerator } from "@jgengine/core/generator/generator";
import { compareToEquipped, itemMass, type ItemDrop } from "@jgengine/core/loot/drop";
import { defineLootGenerator } from "@jgengine/core/loot/lootGenerator";
import { createRunHaul } from "@jgengine/core/loot/haul";
import { createItemLedger, salvageItem, salvageValue } from "./salvage";
import { createVendorRotation, itemPrice, stockVendor, type VendorPriceRule } from "../../../../harbor-heat/src/engine-local/loot/vendor";

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

/** `count` seeded items for a vendor shelf. */
function shelf(seed: string, level: number, count: number) {
  return runGenerator(LOOT, { seed, level, count });
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

