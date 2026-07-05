import { describe, expect, test } from "bun:test";
import { createTradeSystem, type TradeField } from "@jgengine/core/game/trade";

function tradeFixture() {
  const catalog: Record<string, TradeField> = {
    health_potion: { buy: { coins: 20 }, sell: { coins: 5 }, shops: ["shop_town"] },
    quest_item: { shops: ["shop_town"] },
  };

  const balances: Record<string, number> = { coins: 100 };
  const inventory = new Map<string, Map<string, number>>();

  const wallet = {
    canAfford(costs: Record<string, number>) {
      return Object.entries(costs).every(([currency, amount]) => (balances[currency] ?? 0) >= amount)
        ? null
        : "insufficient-funds";
    },
    charge(costs: Record<string, number>) {
      for (const [currency, amount] of Object.entries(costs)) balances[currency] = (balances[currency] ?? 0) - amount;
    },
    grant(gains: Record<string, number>) {
      for (const [currency, amount] of Object.entries(gains)) balances[currency] = (balances[currency] ?? 0) + amount;
    },
  };

  const inventoryOps = {
    put(inventoryId: string, itemId: string, count: number) {
      const bag = inventory.get(inventoryId) ?? new Map<string, number>();
      bag.set(itemId, (bag.get(itemId) ?? 0) + count);
      inventory.set(inventoryId, bag);
      return null;
    },
    take(inventoryId: string, itemId: string, count: number) {
      const bag = inventory.get(inventoryId) ?? new Map<string, number>();
      const have = bag.get(itemId) ?? 0;
      if (have < count) return { reason: "insufficient-items" };
      bag.set(itemId, have - count);
      return null;
    },
    count(inventoryId: string, itemId: string) {
      return inventory.get(inventoryId)?.get(itemId) ?? 0;
    },
  };

  const trade = createTradeSystem({
    resolveTrade: (itemId) => catalog[itemId],
    wallet,
    inventory: inventoryOps,
  });

  return { trade, balances, inventoryOps };
}

describe("game.trade", () => {
  test("canBuy rejects items without a buy price", () => {
    const { trade } = tradeFixture();
    expect(trade.canBuy("quest_item", "shop_town")).toBe("not-purchasable");
  });

  test("canBuy rejects when the shop does not stock the item", () => {
    const { trade } = tradeFixture();
    expect(trade.canBuy("health_potion", "shop_other")).toBe("not-stocked");
  });

  test("canBuy rejects when the wallet cannot afford it", () => {
    const { trade, balances } = tradeFixture();
    balances.coins = 5;
    expect(trade.canBuy("health_potion", "shop_town")).toBe("insufficient-funds");
  });

  test("buy charges the wallet and puts the item in the inventory", () => {
    const { trade, balances, inventoryOps } = tradeFixture();
    const result = trade.buy("health_potion", 2, { shop: "shop_town", inventoryId: "backpack" });
    expect(result).toBeNull();
    expect(balances.coins).toBe(60);
    expect(inventoryOps.count("backpack", "health_potion")).toBe(2);
  });

  test("buy rolls back the charge if the inventory rejects the put", () => {
    const { trade, balances, inventoryOps } = tradeFixture();
    inventoryOps.put = () => ({ reason: "no-space" });
    const result = trade.buy("health_potion", 1, { shop: "shop_town", inventoryId: "backpack" });
    expect(result).toEqual({ reason: "no-space" });
    expect(balances.coins).toBe(100);
  });

  test("canSell rejects items without a sell price", () => {
    const { trade } = tradeFixture();
    expect(trade.canSell("quest_item")).toBe("not-sellable");
  });

  test("sell takes the item and grants currency", () => {
    const { trade, balances, inventoryOps } = tradeFixture();
    inventoryOps.put("backpack", "health_potion", 3);
    const result = trade.sell("health_potion", 2, { shop: "shop_town", inventoryId: "backpack" });
    expect(result).toBeNull();
    expect(balances.coins).toBe(110);
    expect(inventoryOps.count("backpack", "health_potion")).toBe(1);
  });

  test("sell rejects when the inventory lacks enough of the item", () => {
    const { trade } = tradeFixture();
    const result = trade.sell("health_potion", 1, { shop: "shop_town", inventoryId: "backpack" });
    expect(result).toEqual({ reason: "insufficient-items" });
  });

  test("tradableAt lists catalog items whose shops include the given shop", () => {
    const { trade } = tradeFixture();
    expect(trade.tradableAt("shop_town", ["health_potion", "quest_item", "unknown_item"])).toEqual([
      "health_potion",
      "quest_item",
    ]);
  });
});
