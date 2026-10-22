import { describe, expect, test } from "bun:test";

import { canCarry, carriedEntries, characterLoad } from "./carryLoad";
import { createEmptyInventory, createInventorySet, putItem, type InventoryLayout, type InventoryState, type ItemTraits } from "./inventoryModel";

const MASSES: Record<string, number> = { ingot: 10, plank: 2, rifle: 6, plate: 12, pebble: 0.5 };
const weightOf = (itemId: string): number => MASSES[itemId] ?? 0;

const traits: ItemTraits = { stackLimit: () => 20 };
const bagLayout: InventoryLayout = { slots: 4 };

function bagWith(itemId: string, count: number): InventoryState {
  const result = putItem(createEmptyInventory(bagLayout), bagLayout, traits, itemId, count);
  if (result.status !== "ok") throw new Error("fixture failed");
  return result.state;
}

describe("carriedEntries", () => {
  test("lists filled stacks in slot order and skips empty slots", () => {
    const state = bagWith("ingot", 3);
    expect(carriedEntries([state])).toEqual([{ itemId: "ingot", quantity: 3 }]);
    expect(carriedEntries([createEmptyInventory(bagLayout)])).toEqual([]);
  });

  test("reads several carried inventories as one list", () => {
    expect(carriedEntries([bagWith("ingot", 1), bagWith("plank", 2)])).toEqual([
      { itemId: "ingot", quantity: 1 },
      { itemId: "plank", quantity: 2 },
    ]);
  });
});

describe("characterLoad", () => {
  test("weighs carried stacks against capacity and reports what is left", () => {
    const load = characterLoad({ carried: [bagWith("ingot", 3)], weightOf, capacity: 100 });
    expect(load.carriedMass).toBe(30);
    expect(load.wornMass).toBe(0);
    expect(load.mass).toBe(30);
    expect(load.remaining).toBe(70);
    expect(load.tier).toBe("unencumbered");
  });

  test("worn gear adds weight at the configured factor", () => {
    const full = characterLoad({ carried: [], worn: ["plate"], weightOf, capacity: 100 });
    expect(full.wornMass).toBe(12);
    const light = characterLoad({ carried: [], worn: ["plate"], weightOf, capacity: 100, wornFactor: 0.5 });
    expect(light.wornMass).toBe(6);
    expect(light.mass).toBe(6);
  });

  test("an inventory left out of the list adds no weight, so a stash can sit outside the load", () => {
    const set = createInventorySet({ bag: { slots: 4 }, stash: { slots: 4 } }, traits);
    set.put("bag", "ingot", 1);
    set.put("stash", "ingot", 9);
    const load = characterLoad({ carried: [set.state("bag")], weightOf, capacity: 100 });
    expect(load.mass).toBe(10);
  });

  test("weight crosses the soft band: sprint and jump go, speed drops, then the carrier is immobile", () => {
    const light = characterLoad({ carried: [bagWith("plank", 10)], weightOf, capacity: 100 });
    expect(light.tier).toBe("unencumbered");
    expect(light.moveMultiplier).toBe(1);

    const heavy = characterLoad({ carried: [bagWith("ingot", 9)], weightOf, capacity: 100 });
    expect(heavy.tier).toBe("encumbered");
    expect(heavy.canSprint).toBe(false);
    expect(heavy.canJump).toBe(false);
    expect(heavy.moveMultiplier).toBeGreaterThan(0);
    expect(heavy.moveMultiplier).toBeLessThan(1);

    const pinned = characterLoad({ carried: [bagWith("ingot", 10)], weightOf, capacity: 100 });
    expect(pinned.tier).toBe("immobile");
    expect(pinned.moveMultiplier).toBe(0);
    expect(pinned.immobile).toBe(true);
    expect(pinned.remaining).toBe(0);
  });

  test("capacity is caller data: raising it from gear or level lifts the tier back down", () => {
    const state = bagWith("ingot", 9);
    expect(characterLoad({ carried: [state], weightOf, capacity: 100 }).tier).toBe("encumbered");
    expect(characterLoad({ carried: [state], weightOf, capacity: 200 }).tier).toBe("unencumbered");
  });

  test("a negative remaining never wraps: overloaded carriers report the debt", () => {
    const load = characterLoad({ carried: [bagWith("ingot", 12)], weightOf, capacity: 100 });
    expect(load.remaining).toBe(-20);
    expect(load.fraction).toBeGreaterThan(1);
  });
});

describe("canCarry", () => {
  test("accepts a pickup that still fits and refuses one that does not", () => {
    const load = characterLoad({ carried: [bagWith("ingot", 9)], weightOf, capacity: 100 });
    expect(canCarry(load, 10)).toBe(true);
    expect(canCarry(load, 10.5)).toBe(false);
  });

  test("an empty carrier at capacity 0 accepts nothing positive", () => {
    const load = characterLoad({ carried: [], weightOf, capacity: 0 });
    expect(canCarry(load, 1)).toBe(false);
    expect(canCarry(load, 0)).toBe(true);
  });

  test("nonsense added mass counts as nothing", () => {
    const load = characterLoad({ carried: [], weightOf, capacity: 10 });
    expect(canCarry(load, Number.NaN)).toBe(true);
    expect(canCarry(load, -5)).toBe(true);
  });
});
