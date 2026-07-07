import { describe, expect, test } from "bun:test";
import {
  createWorldItemStore,
  resolveDeathDrops,
  resolveWorldItemPresentation,
  scatterOffset,
  scatterPosition,
  selectNearestWorldItem,
  type RarityStyle,
  type WorldItemStoreDeps,
} from "@jgengine/core/game/worldItem";
import type { LootFilterRule } from "@jgengine/core/game/lootFilter";
import type { Drop } from "@jgengine/core/game/lootTable";

function fixedRng(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

describe("scatterOffset / scatterPosition", () => {
  test("stays within the configured annulus radius", () => {
    const rng = fixedRng(0.25, 0.9);
    const offset = scatterOffset(rng, { radius: 2, minRadius: 0.5 });
    const distance = Math.hypot(offset[0], offset[2]);
    expect(distance).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(distance).toBeLessThanOrEqual(2 + 1e-9);
    expect(offset[1]).toBe(0);
  });

  test("adds the offset onto the origin", () => {
    const rng = fixedRng(0, 1);
    const position = scatterPosition([10, 0, 5], rng, { radius: 3, minRadius: 0 });
    expect(position).toEqual([13, 0, 5]);
  });

  test("is deterministic for a fixed rng", () => {
    const a = scatterOffset(fixedRng(0.4, 0.6), { radius: 1 });
    const b = scatterOffset(fixedRng(0.4, 0.6), { radius: 1 });
    expect(a).toEqual(b);
  });
});

describe("selectNearestWorldItem", () => {
  const candidates = [
    { instanceId: "far", position: [10, 0, 0] as const },
    { instanceId: "near", position: [1, 0, 0] as const },
    { instanceId: "mid", position: [3, 0, 0] as const },
  ];

  test("picks the nearest candidate within radius", () => {
    expect(selectNearestWorldItem(candidates, [0, 0, 0], 5)).toBe("near");
  });

  test("ignores candidates outside the radius", () => {
    expect(selectNearestWorldItem(candidates, [0, 0, 0], 0.5)).toBeNull();
  });

  test("returns null with no candidates", () => {
    expect(selectNearestWorldItem([], [0, 0, 0], 5)).toBeNull();
  });
});

function createTestStore() {
  const entityPositions = new Map<string, [number, number, number]>();
  const despawned: string[] = [];
  let counter = 0;
  const deps: WorldItemStoreDeps = {
    spawnEntity(position) {
      const id = `wi-${counter++}`;
      entityPositions.set(id, position);
      return id;
    },
    despawnEntity(instanceId) {
      despawned.push(instanceId);
      return entityPositions.delete(instanceId);
    },
    resolvePosition: (instanceId) => entityPositions.get(instanceId),
    now: () => 1000,
  };
  return { store: createWorldItemStore(deps), despawned };
}

describe("createWorldItemStore", () => {
  test("spawn records rarity/baseType defaults and count", () => {
    const { store } = createTestStore();
    const record = store.spawn({ itemId: "sword_iron", position: [0, 0, 0] });
    expect(record.rarity).toBe("common");
    expect(record.baseType).toBe("sword_iron");
    expect(record.count).toBe(1);
    expect(store.get(record.instanceId)).toEqual(record);
  });

  test("spawn honors explicit rarity/baseType/count/affixTier/source", () => {
    const { store } = createTestStore();
    const record = store.spawn({
      itemId: "sword_iron",
      position: [0, 0, 0],
      rarity: "legendary",
      baseType: "weapon",
      count: 2,
      affixTier: 4,
      source: "boss_1",
    });
    expect(record).toMatchObject({
      itemId: "sword_iron",
      rarity: "legendary",
      baseType: "weapon",
      count: 2,
      affixTier: 4,
      source: "boss_1",
    });
  });

  test("list reflects all spawned items", () => {
    const { store } = createTestStore();
    store.spawn({ itemId: "a", position: [0, 0, 0] });
    store.spawn({ itemId: "b", position: [1, 0, 0] });
    expect(store.list()).toHaveLength(2);
  });

  test("nearestInRadius resolves live entity position and honors a filter", () => {
    const { store } = createTestStore();
    const near = store.spawn({ itemId: "a", rarity: "common", position: [1, 0, 0] });
    store.spawn({ itemId: "b", rarity: "legendary", position: [1.5, 0, 0] });
    expect(store.nearestInRadius([0, 0, 0], 5)).toBe(near.instanceId);
    expect(
      store.nearestInRadius([0, 0, 0], 5, (record) => record.rarity === "legendary"),
    ).not.toBe(near.instanceId);
  });

  test("take removes the record and despawns the entity", () => {
    const { store, despawned } = createTestStore();
    const record = store.spawn({ itemId: "a", position: [0, 0, 0] });
    const taken = store.take(record.instanceId);
    expect(taken).toEqual(record);
    expect(store.get(record.instanceId)).toBeNull();
    expect(despawned).toEqual([record.instanceId]);
    expect(store.take(record.instanceId)).toBeNull();
  });
});

describe("resolveDeathDrops", () => {
  const drops: Drop[] = [
    { currency: "scrap", count: 5 },
    { item: "pulse_rifle", count: 1 },
  ];

  test("grant mode passes drops through untouched", () => {
    expect(resolveDeathDrops(drops, { mode: "grant", origin: [0, 0, 0], resolveRarity: () => "common" })).toEqual({
      worldSpawns: [],
      grants: drops,
    });
  });

  test("world mode scatters item drops and still grants currency directly", () => {
    const resolved = resolveDeathDrops(drops, {
      mode: "world",
      origin: [5, 0, 5],
      resolveRarity: (itemId) => (itemId === "pulse_rifle" ? "rare" : "common"),
      resolveBaseType: () => "weapon",
      scatter: { radius: 1, minRadius: 0 },
      rng: fixedRng(0, 1),
      source: "drone_grunt",
    });
    expect(resolved.grants).toEqual([{ currency: "scrap", count: 5 }]);
    expect(resolved.worldSpawns).toEqual([
      {
        itemId: "pulse_rifle",
        count: 1,
        rarity: "rare",
        position: [6, 0, 5],
        baseType: "weapon",
        source: "drone_grunt",
      },
    ]);
  });
});

describe("resolveWorldItemPresentation", () => {
  const rarityStyle: Record<string, RarityStyle> = {
    common: { color: "#9ca3af", beam: false },
    legendary: { color: "#f59e0b", beam: true, label: "Legendary" },
  };

  test("falls back to the rarity baseline with no filter rules", () => {
    expect(resolveWorldItemPresentation({ rarity: "legendary", baseType: "weapon" }, rarityStyle, undefined)).toEqual(
      { hidden: false, beam: true, color: "#f59e0b", label: "Legendary" },
    );
  });

  test("a matching rule overrides only the fields it sets", () => {
    const rules: LootFilterRule[] = [{ id: "hide-common", when: { rarity: "common" }, hide: true }];
    expect(resolveWorldItemPresentation({ rarity: "common", baseType: "resource" }, rarityStyle, rules)).toEqual({
      hidden: true,
      beam: false,
      color: "#9ca3af",
    });
  });

  test("an unknown rarity with no rules renders unstyled but visible", () => {
    expect(resolveWorldItemPresentation({ rarity: "mythic", baseType: "weapon" }, rarityStyle, undefined)).toEqual({
      hidden: false,
      beam: false,
    });
  });
});
