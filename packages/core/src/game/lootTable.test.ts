import { describe, expect, test } from "bun:test";

import { createLootRegistry, grantDrops, lootTable } from "./lootTable";

describe("lootTable", () => {
  test("has reports registration state", () => {
    const registry = createLootRegistry();
    expect(registry.has("chest_common")).toBe(false);
    registry.register({ id: "chest_common", entries: [{ item: "gold", count: 1, weight: 1 }] });
    expect(registry.has("chest_common")).toBe(true);
  });

  test("rejects entries with both item and currency, or neither", () => {
    const registry = createLootRegistry();
    expect(() =>
      registry.register({ id: "bad", entries: [{ item: "gold", currency: "coins", count: 1, weight: 1 }] }),
    ).toThrow();
    expect(() => registry.register({ id: "bad2", entries: [{ count: 1, weight: 1 }] })).toThrow();
  });

  test("rejects duplicate table ids", () => {
    const registry = createLootRegistry();
    registry.register({ id: "dup", entries: [{ item: "gold", count: 1, weight: 1 }] });
    expect(() => registry.register({ id: "dup", entries: [{ item: "gold", count: 1, weight: 1 }] })).toThrow();
  });

  test("roll throws for unknown table", () => {
    const registry = createLootRegistry();
    expect(() => registry.roll("missing")).toThrow();
  });

  test("roll picks the single-entry table deterministically", () => {
    const registry = createLootRegistry();
    registry.register({ id: "iron_only", entries: [{ item: "iron_ingot", count: 3, weight: 1 }] });
    expect(registry.roll("iron_only")).toEqual([{ item: "iron_ingot", count: 3 }]);
  });

  test("roll resolves inclusive count ranges via injected rng", () => {
    const registry = createLootRegistry();
    registry.register({ id: "ranged", entries: [{ item: "iron_ingot", count: [1, 3], weight: 1 }] });
    expect(registry.roll("ranged", () => 0)).toEqual([{ item: "iron_ingot", count: 1 }]);
    expect(registry.roll("ranged", () => 0.999)).toEqual([{ item: "iron_ingot", count: 3 }]);
  });

  test("roll selects weighted entries via injected rng", () => {
    const registry = createLootRegistry();
    registry.register({
      id: "weighted",
      entries: [
        { item: "common", count: 1, weight: 40 },
        { currency: "coins", count: 5, weight: 60 },
      ],
    });
    expect(registry.roll("weighted", () => 0)).toEqual([{ item: "common", count: 1 }]);
    expect(registry.roll("weighted", () => 0.99)).toEqual([{ currency: "coins", count: 5 }]);
  });

  test("roll performs `rolls` independent draws", () => {
    const registry = createLootRegistry();
    registry.register({ id: "triple", rolls: 3, entries: [{ item: "gem", count: 1, weight: 1 }] });
    expect(registry.roll("triple")).toEqual([
      { item: "gem", count: 1 },
      { item: "gem", count: 1 },
      { item: "gem", count: 1 },
    ]);
  });

  test("lootTable validates and returns the definition without registering globally", () => {
    const def = { id: "chest", entries: [{ item: "gold", count: 1, weight: 1 }] };
    expect(lootTable(def)).toBe(def);
    expect(() => lootTable({ id: "bad", entries: [] })).toThrow();
    expect(() => lootTable({ id: "bad", entries: [{ count: 1, weight: 1 }] })).toThrow();
    expect(createLootRegistry().has("chest")).toBe(false);
  });

  test("independent mode rolls each entry's own chance — several drops or none, no filler entry", () => {
    const registry = createLootRegistry();
    registry.register({
      id: "wolf",
      mode: "independent",
      entries: [
        { item: "pelt", count: 1, chance: 0.5 },
        { item: "fang", count: 1, chance: 0.25 },
        { currency: "coins", count: 3, chance: 1 },
      ],
    });
    const rolls = [0.4, 0.3, 0.0];
    let index = 0;
    const rng = () => rolls[index++ % rolls.length];
    expect(registry.roll("wolf", rng)).toEqual([
      { item: "pelt", count: 1 },
      { currency: "coins", count: 3 },
    ]);
    expect(registry.roll("wolf", () => 0.99)).toEqual([{ currency: "coins", count: 3 }]);
  });

  test("independent mode multiplies passes via rolls", () => {
    const registry = createLootRegistry();
    registry.register({
      id: "boss",
      mode: "independent",
      rolls: 2,
      entries: [{ item: "gem", count: 1, chance: 1 }],
    });
    expect(registry.roll("boss", () => 0)).toEqual([
      { item: "gem", count: 1 },
      { item: "gem", count: 1 },
    ]);
  });

  test("mode-mismatched entries are rejected", () => {
    const registry = createLootRegistry();
    expect(() =>
      registry.register({ id: "bad-weighted", entries: [{ item: "gold", count: 1, chance: 0.5, weight: 1 }] }),
    ).toThrow();
    expect(() => registry.register({ id: "bad-no-weight", entries: [{ item: "gold", count: 1 }] })).toThrow();
    expect(() =>
      registry.register({ id: "bad-ind", mode: "independent", entries: [{ item: "gold", count: 1, weight: 1, chance: 0.5 }] }),
    ).toThrow();
    expect(() =>
      registry.register({ id: "bad-chance", mode: "independent", entries: [{ item: "gold", count: 1, chance: 1.5 }] }),
    ).toThrow();
  });

  test("generate entries roll a runtime id via the injected callback", () => {
    const registry = createLootRegistry();
    const seen: number[] = [];
    registry.register({
      id: "relic_drop",
      entries: [
        {
          generate: (rng) => {
            const roll = rng();
            seen.push(roll);
            return `relic:charm:${Math.floor(roll * 100)}`;
          },
          count: 1,
          weight: 1,
        },
      ],
    });
    expect(registry.roll("relic_drop", () => 0.42)).toEqual([{ item: "relic:charm:42", count: 1 }]);
    expect(seen).toEqual([0.42]);
  });

  test("generate cannot combine with item or currency, and needs one of the three", () => {
    const registry = createLootRegistry();
    expect(() =>
      registry.register({ id: "bad-gen-item", entries: [{ item: "gold", generate: () => "x", count: 1, weight: 1 }] }),
    ).toThrow();
    expect(() =>
      registry.register({
        id: "bad-gen-currency",
        entries: [{ currency: "coins", generate: () => "x", count: 1, weight: 1 }],
      }),
    ).toThrow();
    expect(() => registry.register({ id: "bad-none", entries: [{ count: 1, weight: 1 }] })).toThrow();
  });

  test("generate entries roll a fresh id each draw across multiple rolls", () => {
    const registry = createLootRegistry();
    let n = 0;
    registry.register({ id: "multi_gen", rolls: 2, entries: [{ generate: () => `gen:${n++}`, count: 1, weight: 1 }] });
    expect(registry.roll("multi_gen")).toEqual([
      { item: "gen:0", count: 1 },
      { item: "gen:1", count: 1 },
    ]);
  });

  test("grantDrops routes items and currency to their appliers", () => {
    const putItem = (itemId: string, count: number) => calls.push(["putItem", itemId, count]);
    const grantCurrency = (currencyId: string, amount: number) => calls.push(["grantCurrency", currencyId, amount]);
    const calls: unknown[][] = [];
    grantDrops([{ item: "gem", count: 2 }, { currency: "coins", count: 5 }], { putItem, grantCurrency });
    expect(calls).toEqual([
      ["putItem", "gem", 2],
      ["grantCurrency", "coins", 5],
    ]);
  });
});
