import { describe, expect, test } from "bun:test";

import {
  applyTradeOutcome,
  canAffordCosts,
  resolveBuy,
  resolveSell,
  type TradeField,
} from "./trade";

const potion: TradeField = { buy: { coins: 20 }, sell: { coins: 5 }, shops: ["shop_town"] };
const questItem: TradeField = { shops: ["shop_town"] };

describe("pure trade tier", () => {
  test("canAffordCosts checks a balance snapshot", () => {
    expect(canAffordCosts({ coins: 100 }, { coins: 20 })).toBeNull();
    expect(canAffordCosts({ coins: 10 }, { coins: 20 })).toBe("insufficient-funds");
    expect(canAffordCosts({}, { coins: 1 })).toBe("insufficient-funds");
  });

  test("resolveBuy produces a signed currency + item outcome", () => {
    const result = resolveBuy("health_potion", potion, "shop_town", 2, { coins: 100 });
    expect(result).toEqual({
      status: "ok",
      outcome: { itemId: "health_potion", count: 2, currency: { coins: -40 } },
    });
  });

  test("resolveBuy rejects unpurchasable, unstocked, and unaffordable trades", () => {
    expect(resolveBuy("quest_item", questItem, "shop_town", 1, { coins: 100 })).toEqual({
      status: "rejected",
      reason: "not-purchasable",
    });
    expect(resolveBuy("health_potion", potion, "shop_other", 1, { coins: 100 })).toEqual({
      status: "rejected",
      reason: "not-stocked",
    });
    expect(resolveBuy("health_potion", potion, "shop_town", 1, { coins: 5 })).toEqual({
      status: "rejected",
      reason: "insufficient-funds",
    });
  });

  test("resolveSell produces a negative item delta and positive currency", () => {
    expect(resolveSell("health_potion", potion, 3)).toEqual({
      status: "ok",
      outcome: { itemId: "health_potion", count: -3, currency: { coins: 15 } },
    });
    expect(resolveSell("quest_item", questItem, 1)).toEqual({
      status: "rejected",
      reason: "not-sellable",
    });
  });

  test("applyTradeOutcome applies the item first then the currency", () => {
    const balances: Record<string, number> = { coins: 100 };
    const bag = new Map<string, number>();
    const appliers = {
      adjustItem(itemId: string, count: number) {
        bag.set(itemId, (bag.get(itemId) ?? 0) + count);
        return null;
      },
      adjustCurrency(delta: Record<string, number>) {
        for (const [c, amount] of Object.entries(delta)) balances[c] = (balances[c] ?? 0) + amount;
      },
    };

    const buy = resolveBuy("health_potion", potion, "shop_town", 2, balances);
    expect(buy.status).toBe("ok");
    if (buy.status === "ok") expect(applyTradeOutcome(buy.outcome, appliers)).toBeNull();
    expect(balances.coins).toBe(60);
    expect(bag.get("health_potion")).toBe(2);
  });

  test("applyTradeOutcome leaves currency untouched when the item change is rejected", () => {
    const balances: Record<string, number> = { coins: 100 };
    const appliers = {
      adjustItem: () => ({ reason: "insufficient-items" }),
      adjustCurrency: () => {
        throw new Error("currency must not move when the item change fails");
      },
    };
    const sell = resolveSell("health_potion", potion, 1);
    expect(sell.status).toBe("ok");
    if (sell.status === "ok") {
      expect(applyTradeOutcome(sell.outcome, appliers)).toEqual({ reason: "insufficient-items" });
    }
    expect(balances.coins).toBe(100);
  });
});
