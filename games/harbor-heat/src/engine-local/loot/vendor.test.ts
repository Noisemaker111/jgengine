import { describe, expect, test } from "bun:test";
import type { AffixPool, RarityTier } from "@jgengine/core/item/affix";
import type { LootBaseDef, LootCatalog, LootManufacturerDef } from "@jgengine/core/loot/lootGen";
import { createShopStock } from "@jgengine/core/economy/shopStock";
import { createEmptyWallet, balance, grant } from "@jgengine/core/economy/wallet";
import { runGenerator } from "@jgengine/core/generator/generator";
import { defineLootGenerator } from "@jgengine/core/loot/lootGenerator";
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

/** `count` seeded items for a vendor shelf. */
function shelf(seed: string, level: number, count: number) {
  return runGenerator(LOOT, { seed, level, count });
}

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
      items: shelf("vendor-1", 2, 3),
      price: rule,
      idPrefix: "test.shelf",
    };
    const first = stockVendor(shop, options);
    expect(first).toHaveLength(3);
    expect(shop.list()).toHaveLength(3);
    expect(first[0]!.entry.price.amount).toBe(itemPrice(first[0]!.item, rule).buy);
    expect(first[0]!.entry.sellPrice?.amount).toBe(Math.floor(first[0]!.entry.price.amount * 0.4));

    const second = stockVendor(shop, { ...options, items: shelf("vendor-2", 2, 3) });
    expect(shop.list()).toHaveLength(3);
    expect(shop.list().map((entry) => entry.id)).toEqual(second.map((offer) => offer.entry.id));
  });

  test("a purchase charges the shared wallet", () => {
    const shop = createShopStock();
    const offers = stockVendor(shop, {
      items: shelf("buy", 1, 1), price: rule, idPrefix: "buy",
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
