import { describe, expect, test } from "bun:test";

import { createEmptyWallet, balance, grant } from "@jgengine/core/economy/wallet";
import { createShopStock, type ShopStockEntry } from "@jgengine/core/economy/shopStock";

function sampleEntries(): ShopStockEntry[] {
  return [
    { id: "potion", kind: "potion", price: { currency: "gold", amount: 10 }, qty: 3, sellPrice: { currency: "gold", amount: 4 } },
    { id: "blade", kind: "blade", price: { currency: "gold", amount: 50 }, qty: 1 },
    { id: "charm", kind: "charm", price: { currency: "gems", amount: 2 }, qty: null },
  ];
}

describe("createShopStock", () => {
  test("lists entries in insertion order as detached copies", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    const list = shop.list();
    expect(list.map((e) => e.id)).toEqual(["potion", "blade", "charm"]);
    // Mutating a returned copy must not affect internal state.
    list[0]!.qty = 999;
    expect(shop.get("potion")!.qty).toBe(3);
  });

  test("get returns null for unknown ids", () => {
    const shop = createShopStock();
    expect(shop.get("nope")).toBeNull();
  });

  test("buy charges the caller wallet, decrements finite qty, and returns the new wallet", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    const wallet = grant(createEmptyWallet(), "gold", 100);

    const result = shop.buy("potion", wallet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(balance(result.wallet, "gold")).toBe(90);
      expect(result.entry.qty).toBe(2);
    }
    // Passed wallet is never mutated.
    expect(balance(wallet, "gold")).toBe(100);
    // Internal qty decremented.
    expect(shop.get("potion")!.qty).toBe(2);
  });

  test("buy on unlimited stock never decrements qty", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    const wallet = grant(createEmptyWallet(), "gems", 10);
    const result = shop.buy("charm", wallet);
    expect(result.ok).toBe(true);
    if (result.ok) expect(balance(result.wallet, "gems")).toBe(8);
    expect(shop.get("charm")!.qty).toBeNull();
  });

  test("buy rejects insufficient-funds without touching stock or wallet", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    const wallet = grant(createEmptyWallet(), "gold", 5);
    const result = shop.buy("potion", wallet);
    expect(result).toEqual({ ok: false, reason: "insufficient-funds" });
    expect(shop.get("potion")!.qty).toBe(3);
    expect(balance(wallet, "gold")).toBe(5);
  });

  test("buy rejects out-of-stock once finite qty hits zero", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    const wallet = grant(createEmptyWallet(), "gold", 500);
    let w = wallet;
    const first = shop.buy("blade", w);
    expect(first.ok).toBe(true);
    if (first.ok) w = first.wallet;
    const second = shop.buy("blade", w);
    expect(second).toEqual({ ok: false, reason: "out-of-stock" });
  });

  test("buy rejects unknown-item", () => {
    const shop = createShopStock();
    expect(shop.buy("ghost", createEmptyWallet())).toEqual({ ok: false, reason: "unknown-item" });
  });

  test("sell grants the sellPrice and restocks a finite qty", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    const wallet = createEmptyWallet();
    const result = shop.sell("potion", wallet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(balance(result.wallet, "gold")).toBe(4);
      expect(result.entry.qty).toBe(4);
    }
    expect(shop.get("potion")!.qty).toBe(4);
  });

  test("sell rejects not-sellable when no sellPrice", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    expect(shop.sell("blade", createEmptyWallet())).toEqual({ ok: false, reason: "not-sellable" });
  });

  test("sell rejects unknown-item", () => {
    const shop = createShopStock();
    expect(shop.sell("ghost", createEmptyWallet())).toEqual({ ok: false, reason: "unknown-item" });
  });

  test("canAfford reflects balance and stock", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    expect(shop.canAfford("potion", grant(createEmptyWallet(), "gold", 10))).toBe(true);
    expect(shop.canAfford("potion", grant(createEmptyWallet(), "gold", 9))).toBe(false);
    expect(shop.canAfford("missing", createEmptyWallet())).toBe(false);
  });

  test("free entries (amount 0) buy without a matching currency balance", () => {
    const shop = createShopStock({ entries: [{ id: "gift", kind: "gift", price: { currency: "gold", amount: 0 }, qty: 1 }] });
    const result = shop.buy("gift", createEmptyWallet());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entry.qty).toBe(0);
  });

  test("restock adds to finite qty and no-ops on unlimited", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    shop.restock("blade", 4);
    expect(shop.get("blade")!.qty).toBe(5);
    shop.restock("charm", 4);
    expect(shop.get("charm")!.qty).toBeNull();
  });

  test("setPrice replaces the buy price", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    shop.setPrice("potion", { currency: "gems", amount: 1 });
    expect(shop.get("potion")!.price).toEqual({ currency: "gems", amount: 1 });
  });

  test("add rejects duplicate ids and remove drops entries", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    expect(() => shop.add({ id: "potion", kind: "potion", price: { currency: "gold", amount: 1 }, qty: 1 })).toThrow();
    shop.remove("blade");
    expect(shop.get("blade")).toBeNull();
    expect(shop.list().map((e) => e.id)).toEqual(["potion", "charm"]);
  });

  test("construction rejects invalid entries", () => {
    expect(() => createShopStock({ entries: [{ id: "x", kind: "x", price: { currency: "gold", amount: -1 }, qty: 1 }] })).toThrow(RangeError);
    expect(() => createShopStock({ entries: [{ id: "x", kind: "x", price: { currency: "gold", amount: 1 }, qty: 1.5 }] })).toThrow(RangeError);
    expect(() => createShopStock({ entries: [{ id: "", kind: "x", price: { currency: "gold", amount: 1 }, qty: 1 }] })).toThrow(TypeError);
  });

  test("subscribe fires on mutations and unsubscribe stops it", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    let count = 0;
    const unsub = shop.subscribe(() => {
      count += 1;
    });
    shop.buy("charm", grant(createEmptyWallet(), "gems", 10));
    shop.restock("blade", 1);
    shop.setPrice("blade", { currency: "gold", amount: 60 });
    expect(count).toBe(3);
    unsub();
    shop.remove("blade");
    expect(count).toBe(3);
  });

  test("snapshot/restore round-trips the full stock", () => {
    const shop = createShopStock({ entries: sampleEntries() });
    shop.buy("potion", grant(createEmptyWallet(), "gold", 100));
    const snap = shop.snapshot();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);

    const restored = createShopStock();
    restored.restore(snap);
    expect(restored.list()).toEqual(shop.list());
    expect(restored.get("potion")!.qty).toBe(2);
  });
});
