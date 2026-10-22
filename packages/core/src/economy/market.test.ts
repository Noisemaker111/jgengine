import { describe, expect, test } from "bun:test";

import { gateTimingMs } from "../../../../scripts/timing-budget";
import { devtools } from "../devtools/devtools";
import { createMarket, type MarketGoodDef } from "./market";

function good(overrides: Partial<MarketGoodDef> = {}): MarketGoodDef {
  return { id: "grain", basePrice: 100, stock: 160, demand: 40, ...overrides };
}

describe("market price from supply and demand", () => {
  test("price is basePrice at the reference stock and moves with stock on the stated curve", () => {
    const market = createMarket({ goods: [good()] });
    expect(market.targetStockOf("grain")).toBe(160);

    // price = basePrice x (coverPeriods x demand / stock)^elasticity
    expect(market.priceOf("grain")).toBe(100);
    market.restock("grain", 160);
    expect(market.stockOf("grain")).toBe(320);
    expect(market.priceOf("grain")).toBe(50);
    expect(market.sell("grain", 240)).toMatchObject({ ok: true, unitPrice: 50 });
    expect(market.stockOf("grain")).toBe(80);
    expect(market.priceOf("grain")).toBe(200);
  });

  test("price clamps to the factor bounds on both ends", () => {
    const market = createMarket({ goods: [good({ stock: 0 })] });
    expect(market.priceOf("grain")).toBe(400);
    market.restock("grain", 100_000);
    expect(market.priceOf("grain")).toBe(25);
  });

  test("the same stock prices higher when demand is higher", () => {
    const market = createMarket({ goods: [good(), good({ id: "scarce", stock: 160, demand: 80 })] });
    expect(market.priceOf("grain")).toBe(100);
    expect(market.priceOf("scarce")).toBe(200);
    market.setDemand("grain", 160);
    expect(market.priceOf("grain")).toBe(400);
  });

  test("elasticity and cover periods shape the curve", () => {
    const steep = createMarket({ goods: [good({ stock: 80, elasticity: 2 })] });
    const flat = createMarket({ goods: [good({ stock: 80, elasticity: 0.5 })] });
    const slow = createMarket({ goods: [good({ stock: 80, coverPeriods: 8 })] });
    expect(steep.priceOf("grain")).toBe(400);
    expect(flat.priceOf("grain")).toBe(141);
    expect(slow.priceOf("grain")).toBe(400);
  });

  test("a caller price curve replaces the default", () => {
    const market = createMarket({
      goods: [good({ stock: 80 })],
      priceCurve: (input) => input.basePrice + input.stock,
    });
    expect(market.priceOf("grain")).toBe(180);
  });
});

describe("finite stock", () => {
  test("stock is finite: a sale beyond it is refused with the shortfall", () => {
    const market = createMarket({ goods: [good({ stock: 10 })] });
    expect(market.sell("grain", 11)).toEqual({ ok: false, reason: "out-of-stock", shortfall: 1 });
    expect(market.stockOf("grain")).toBe(10);
    expect(market.sell("grain", 10)).toMatchObject({ ok: true, qty: 10, total: 10 * market.priceOf("grain") });
    expect(market.stockOf("grain")).toBe(0);
    expect(market.sell("grain", 1)).toEqual({ ok: false, reason: "out-of-stock", shortfall: 1 });
  });

  test("bad counts and unknown goods are refused without moving stock", () => {
    const market = createMarket({ goods: [good()] });
    expect(market.sell("grain", 0)).toEqual({ ok: false, reason: "invalid-qty" });
    expect(market.sell("grain", 1.5)).toEqual({ ok: false, reason: "invalid-qty" });
    expect(market.sell("ghost", 1)).toEqual({ ok: false, reason: "unknown-good" });
    expect(market.restock("ghost", 1)).toBe(false);
    expect(market.restock("grain", -1)).toBe(false);
    expect(market.priceOf("ghost")).toBe(0);
    expect(market.stockOf("grain")).toBe(160);
  });

  test("a quote reads the price and the move without mutating", () => {
    const market = createMarket({ goods: [good()] });
    const quote = market.quote("grain", 80)!;
    expect(quote).toEqual({ goodId: "grain", qty: 80, unitPrice: 100, total: 8_000, shortfall: 0, nextUnitPrice: 200 });
    expect(market.quote("grain", 200)).toMatchObject({ shortfall: 40, total: 16_000 });
    expect(market.quote("ghost", 1)).toBeNull();
    expect(market.stockOf("grain")).toBe(160);
  });

  test("restocking lowers the price and selling raises it", () => {
    const market = createMarket({ goods: [good()] });
    expect(market.priceAfter("grain", 80)).toBe(200);
    expect(market.priceAfter("grain", -80)).toBe(67);
    market.restock("grain", 160);
    expect(market.priceOf("grain")).toBe(50);
  });
});

describe("demand from observed buying", () => {
  test("recordDemand smooths toward what sold and raises demand on unmet units", () => {
    const market = createMarket({ goods: [good({ demand: 40 })] });
    market.recordDemand("grain", 0, 0);
    expect(market.demandOf("grain")).toBe(20);
    market.recordDemand("grain", 0, 40);
    expect(market.demandOf("grain")).toBe(30);
    expect(market.stats().unmetUnits).toBe(40);
  });

  test("a stockout raises the price for the next period", () => {
    const market = createMarket({ goods: [good({ stock: 0, demand: 40 })] });
    const stockedOut = market.priceOf("grain");
    market.recordDemand("grain", 0, 80);
    expect(market.demandOf("grain")).toBe(60);
    expect(market.priceOf("grain")).toBe(400);
    expect(market.priceOf("grain")).toBeGreaterThanOrEqual(stockedOut);
  });

  test("demand is caller data and setDemand refuses a negative", () => {
    const market = createMarket({ goods: [good()] });
    market.setDemand("grain", 10);
    expect(market.priceOf("grain")).toBe(25);
    expect(() => market.setDemand("grain", -1)).toThrow("non-negative finite");
  });
});

describe("retune, state and probe", () => {
  test("retune changes price policy in play and refuses an unusable patch", () => {
    const market = createMarket({ goods: [good()] });
    expect(market.retune("grain", { basePrice: 200 })).toBe(true);
    expect(market.priceOf("grain")).toBe(200);
    expect(market.retune("grain", { minFactor: 5, maxFactor: 1 })).toBe(false);
    expect(market.retune("grain", { basePrice: -1 })).toBe(false);
    expect(market.retune("ghost", { basePrice: 1 })).toBe(false);
    expect(market.priceOf("grain")).toBe(200);
  });

  test("snapshot and restore round-trip through JSON", () => {
    const market = createMarket({ goods: [good(), good({ id: "tools", basePrice: 500, stock: 20, demand: 5 })] });
    market.sell("grain", 40);
    market.recordDemand("grain", 40, 0);
    market.restock("tools", 10);
    const snapshot = JSON.parse(JSON.stringify(market.snapshot()));

    const restored = createMarket({ goods: [good(), good({ id: "tools", basePrice: 500, stock: 20, demand: 5 })] });
    expect(restored.restore(snapshot)).toBe(true);
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.priceOf("grain")).toBe(market.priceOf("grain"));
    expect(restored.stats()).toEqual(market.stats());
  });

  test("restore refuses malformed state and unknown goods without mutating", () => {
    const market = createMarket({ goods: [good()] });
    const before = market.snapshot();
    expect(market.restore({ goods: [{ id: "ghost", stock: 1, demand: 1 }], counters: before.counters })).toBe(false);
    expect(market.restore({ goods: [{ id: "grain", stock: -1, demand: 1 }], counters: before.counters })).toBe(false);
    expect(market.restore({ goods: [{ id: "grain", stock: 1, demand: 1 }], counters: { ...before.counters, revenue: 1.5 } })).toBe(false);
    expect(market.snapshot()).toEqual(before);
  });

  test("stats report stock, value and takings, and the probe reads them", () => {
    const market = createMarket({ goods: [good()], devtoolsName: "market.test" });
    expect(market.sell("grain", 40)).toMatchObject({ ok: true, unitPrice: 100 });
    const stats = market.stats();
    expect(stats).toEqual({
      goods: 1,
      unitsInStock: 120,
      stockValue: 120 * market.priceOf("grain"),
      sales: 1,
      unitsSold: 40,
      revenue: 4_000,
      unmetUnits: 0,
    });
    expect(devtools.probes.read()["market.test"]).toEqual(stats);
    market.dispose();
    expect(devtools.probes.read()["market.test"]).toBeUndefined();
  });

  test("reset clears stock and counters", () => {
    const market = createMarket({ goods: [good()] });
    market.sell("grain", 10);
    market.reset();
    expect(market.stats()).toEqual({ goods: 1, unitsInStock: 0, stockValue: 0, sales: 0, unitsSold: 0, revenue: 0, unmetUnits: 0 });
  });

  test("refuses a catalog it cannot price", () => {
    expect(() => createMarket({ goods: [good({ basePrice: 1.5 })] })).toThrow("positive integer in minor units");
    expect(() => createMarket({ goods: [good({ stock: -1 })] })).toThrow("non-negative integer");
    expect(() => createMarket({ goods: [good({ demand: -1 })] })).toThrow("non-negative finite");
    expect(() => createMarket({ goods: [good({ elasticity: 0 })] })).toThrow("elasticity must be positive");
    expect(() => createMarket({ goods: [good({ minFactor: 5, maxFactor: 1 })] })).toThrow("minFactor <= maxFactor");
    expect(() => createMarket({ goods: [good(), good()] })).toThrow("declared twice");
  });
});

describe("bounded per-tick cost", () => {
  test("price lookups stay flat over 200 goods", () => {
    const goods = Array.from({ length: 200 }, (_, i) => good({ id: `good-${i}`, stock: 100 + i }));
    const market = createMarket({ goods });
    const samples: number[] = [];
    for (let run = 0; run < 7; run += 1) {
      const started = performance.now();
      for (let tick = 0; tick < 200; tick += 1) {
        for (const entry of goods) market.priceOf(entry.id);
      }
      samples.push(performance.now() - started);
    }
    gateTimingMs("market price lookups", samples, 6, "200 goods x 200 ticks = 40k lookups");
  });
});
