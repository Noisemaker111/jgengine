import { describe, expect, test } from "bun:test";

import { createItemInstanceRegistry, proceduralLootEntry } from "@jgengine/core/item/itemInstanceRegistry";

describe("createItemInstanceRegistry", () => {
  test("register returns a unique id per call, distinct from the base id", () => {
    const registry = createItemInstanceRegistry<{ name: string }>("gen");
    const a = registry.register("pistol_rare", { name: "Vector Pistol" });
    const b = registry.register("pistol_rare", { name: "Another Vector Pistol" });
    expect(a).not.toBe(b);
    expect(a).not.toBe("pistol_rare");
    expect(a.startsWith("gen:pistol_rare:")).toBe(true);
  });

  test("get/has resolve a registered instance", () => {
    const registry = createItemInstanceRegistry<{ name: string }>();
    const id = registry.register("relic_charm", { name: "Keen Charm" });
    expect(registry.has(id)).toBe(true);
    expect(registry.get(id)).toEqual({ name: "Keen Charm" });
    expect(registry.has("unknown")).toBe(false);
    expect(registry.get("unknown")).toBeUndefined();
  });

  test("release removes the instance", () => {
    const registry = createItemInstanceRegistry<{ name: string }>();
    const id = registry.register("relic_charm", { name: "Keen Charm" });
    expect(registry.count()).toBe(1);
    registry.release(id);
    expect(registry.has(id)).toBe(false);
    expect(registry.count()).toBe(0);
  });

  test("defaults to an \"item\" prefix", () => {
    const registry = createItemInstanceRegistry<{ name: string }>();
    const id = registry.register("base", { name: "x" });
    expect(id.startsWith("item:base:")).toBe(true);
  });
});

describe("proceduralLootEntry", () => {
  test("rolls once, registers the result, and returns the runtime id", () => {
    const registry = createItemInstanceRegistry<{ rarity: string }>("relic");
    const calls: number[] = [];
    const generate = proceduralLootEntry(registry, (rng) => {
      const roll = rng();
      calls.push(roll);
      return { baseId: "charm", def: { rarity: roll < 0.5 ? "common" : "rare" } };
    });
    const id = generate(() => 0.9);
    expect(calls).toEqual([0.9]);
    expect(registry.get(id)).toEqual({ rarity: "rare" });
    expect(id.startsWith("relic:charm:")).toBe(true);
  });

  test("each call produces a distinct instance", () => {
    const registry = createItemInstanceRegistry<{ n: number }>("gen");
    let n = 0;
    const generate = proceduralLootEntry(registry, () => ({ baseId: "thing", def: { n: n++ } }));
    const a = generate(() => 0);
    const b = generate(() => 0);
    expect(a).not.toBe(b);
    expect(registry.get(a)).toEqual({ n: 0 });
    expect(registry.get(b)).toEqual({ n: 1 });
  });
});
