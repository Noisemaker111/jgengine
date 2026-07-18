import { describe, expect, test } from "bun:test";
import { createPriceHistory } from "@jgengine/core/economy/priceHistory";

describe("economy/priceHistory", () => {
  test("statsOf aggregates volume-weighted average, min, max, and latest", () => {
    const history = createPriceHistory({ maxSamplesPerItem: 10 });
    history.record({ itemId: "ore", count: 2, unitPrice: 10, currency: "copper", at: 0 });
    history.record({ itemId: "ore", count: 1, unitPrice: 40, currency: "copper", at: 1 });
    expect(history.statsOf("ore")).toEqual({
      sampleCount: 2,
      volume: 3,
      minUnitPrice: 10,
      maxUnitPrice: 40,
      averageUnitPrice: 20,
      latestUnitPrice: 40,
    });
  });

  test("statsOf returns null for an unknown item", () => {
    const history = createPriceHistory({ maxSamplesPerItem: 10 });
    expect(history.statsOf("ore")).toBeNull();
  });

  test("record ignores invalid prices and counts", () => {
    const history = createPriceHistory({ maxSamplesPerItem: 10 });
    history.record({ itemId: "ore", count: 0, unitPrice: 10, currency: "copper", at: 0 });
    history.record({ itemId: "ore", count: 1, unitPrice: Number.NaN, currency: "copper", at: 0 });
    expect(history.statsOf("ore")).toBeNull();
  });

  test("the per-item sample cap drops the oldest samples first", () => {
    const history = createPriceHistory({ maxSamplesPerItem: 2 });
    history.record({ itemId: "ore", count: 1, unitPrice: 1, currency: "copper", at: 0 });
    history.record({ itemId: "ore", count: 1, unitPrice: 2, currency: "copper", at: 1 });
    history.record({ itemId: "ore", count: 1, unitPrice: 3, currency: "copper", at: 2 });
    expect(history.samplesOf("ore").map((sale) => sale.unitPrice)).toEqual([2, 3]);
  });

  test("the sliding window drops samples older than windowSeconds on read", () => {
    const history = createPriceHistory({ maxSamplesPerItem: 10, windowSeconds: 100 });
    history.record({ itemId: "ore", count: 1, unitPrice: 5, currency: "copper", at: 0 });
    history.record({ itemId: "ore", count: 1, unitPrice: 9, currency: "copper", at: 90 });
    expect(history.statsOf("ore", 150)?.sampleCount).toBe(1);
    expect(history.statsOf("ore", 150)?.latestUnitPrice).toBe(9);
    expect(history.statsOf("ore", 500)).toBeNull();
    expect(history.itemIds()).toEqual([]);
  });

  test("clear removes one item or everything", () => {
    const history = createPriceHistory({ maxSamplesPerItem: 10 });
    history.record({ itemId: "ore", count: 1, unitPrice: 5, currency: "copper", at: 0 });
    history.record({ itemId: "gem", count: 1, unitPrice: 50, currency: "copper", at: 0 });
    history.clear("ore");
    expect(history.statsOf("ore")).toBeNull();
    expect(history.statsOf("gem")).not.toBeNull();
    history.clear();
    expect(history.itemIds()).toEqual([]);
  });
});
