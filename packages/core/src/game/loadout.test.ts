import { describe, expect, test } from "bun:test";

import {
  countItem,
  createEmptyInventory,
  putItem,
  type InventoryLayout,
  type InventoryState,
  type ItemTraits,
} from "../inventory/inventoryModel";
import { createLoadouts, type LoadoutDeps } from "./loadout";

const traits: ItemTraits = { stackLimit: () => 10 };

function createHarness(layouts: Record<string, InventoryLayout>) {
  const committed = new Map<string, Map<string, InventoryState>>();

  function statesFor(userId: string): Map<string, InventoryState> {
    let states = committed.get(userId);
    if (!states) {
      states = new Map(Object.entries(layouts).map(([id, layout]) => [id, createEmptyInventory(layout)]));
      committed.set(userId, states);
    }
    return states;
  }

  const seeded: { userId: string; statId: string; pool: { current: number; max?: number } }[] = [];
  const granted: { userId: string; currencyId: string; amount: number }[] = [];
  const unlocked: { userId: string; unlockId: string }[] = [];

  const deps: LoadoutDeps = {
    inventory: {
      begin(userId) {
        const working = new Map(statesFor(userId));
        return {
          put(inventoryId, itemId, count, slot) {
            const layout = layouts[inventoryId];
            const state = working.get(inventoryId);
            if (layout === undefined || state === undefined) {
              return { reason: `unknown inventory "${inventoryId}"` };
            }
            const result = putItem(state, layout, traits, itemId, count, slot === undefined ? undefined : { slot });
            if (result.status === "rejected") return { reason: result.reason };
            working.set(inventoryId, result.state);
            return null;
          },
          commit() {
            const states = statesFor(userId);
            for (const [id, state] of working) states.set(id, state);
          },
        };
      },
    },
    stats: { seed: (userId, statId, pool) => seeded.push({ userId, statId, pool }) },
    economy: { grant: (userId, currencyId, amount) => granted.push({ userId, currencyId, amount }) },
    unlocks: { grant: (userId, unlockId) => unlocked.push({ userId, unlockId }) },
  };

  return {
    deps,
    seeded,
    granted,
    unlocked,
    count: (userId: string, inventoryId: string, itemId: string) =>
      countItem(statesFor(userId).get(inventoryId)!, itemId),
  };
}

describe("loadouts", () => {
  test("applyLoadout applies inventories, stats, economy, and unlocks", () => {
    const harness = createHarness({ hotbar: { slots: 4 }, backpack: { slots: 8 } });
    const loadouts = createLoadouts(harness.deps);
    loadouts.register({
      starterKit: {
        inventories: {
          hotbar: [{ item: "wooden_pickaxe", count: 1, slot: 0 }],
          backpack: [{ item: "ammo_556", count: 9 }],
        },
        stats: { health: { current: 100, max: 100 } },
        economy: { coins: 50 },
        unlocks: ["tutorial_complete"],
      },
    });

    expect(loadouts.has("starterKit")).toBe(true);
    expect(loadouts.applyLoadout("alice", "starterKit")).toBeNull();
    expect(harness.count("alice", "hotbar", "wooden_pickaxe")).toBe(1);
    expect(harness.count("alice", "backpack", "ammo_556")).toBe(9);
    expect(harness.seeded).toEqual([{ userId: "alice", statId: "health", pool: { current: 100, max: 100 } }]);
    expect(harness.granted).toEqual([{ userId: "alice", currencyId: "coins", amount: 50 }]);
    expect(harness.unlocked).toEqual([{ userId: "alice", unlockId: "tutorial_complete" }]);
  });

  test("a failing put leaves everything unapplied", () => {
    const harness = createHarness({ hotbar: { slots: 2 } });
    const loadouts = createLoadouts(harness.deps);
    loadouts.register({
      broken: {
        inventories: {
          hotbar: [
            { item: "sword", count: 1, slot: 0 },
            { item: "shield", count: 1, slot: 0 },
          ],
        },
        stats: { health: { current: 100, max: 100 } },
        economy: { coins: 25 },
        unlocks: ["oops"],
      },
    });

    const result = loadouts.applyLoadout("alice", "broken");
    expect(result).toEqual({ reason: "hotbar: slot-occupied" });
    expect(harness.count("alice", "hotbar", "sword")).toBe(0);
    expect(harness.count("alice", "hotbar", "shield")).toBe(0);
    expect(harness.seeded).toEqual([]);
    expect(harness.granted).toEqual([]);
    expect(harness.unlocked).toEqual([]);
  });

  test("unknown loadout id is rejected", () => {
    const harness = createHarness({ hotbar: { slots: 2 } });
    const loadouts = createLoadouts(harness.deps);
    expect(loadouts.applyLoadout("alice", "missing")).toEqual({ reason: 'unknown loadout "missing"' });
  });
});
