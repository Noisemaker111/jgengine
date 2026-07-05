import { describe, expect, test } from "bun:test";
import {
  countItem,
  createEmptyInventory,
  createInventorySet,
  hasItem,
  moveItem,
  putItem,
  takeItem,
  type InventoryLayout,
  type InventoryState,
  type ItemTraits,
} from "@jgengine/core/inventory/inventoryModel";

const traits: ItemTraits = {
  stackLimit(itemId) {
    if (itemId === "stone") return 64;
    if (itemId === "sword" || itemId === "shield") return 1;
    return 16;
  },
  kind(itemId) {
    if (itemId === "sword" || itemId === "shield") return "tool";
    if (itemId === "stone") return "material";
    return null;
  },
};

const backpackLayout: InventoryLayout = { slots: 3 };
const toolbeltLayout: InventoryLayout = { slots: 2, accepts: "tool" };

describe("putItem auto-stacking", () => {
  test("stacks into a partial stack then overflows into a new slot", () => {
    let state = createEmptyInventory(backpackLayout);
    const first = putItem(state, backpackLayout, traits, "stone", 50);
    expect(first.status).toBe("ok");
    state = (first as { status: "ok"; state: InventoryState }).state;

    const second = putItem(state, backpackLayout, traits, "stone", 20);
    expect(second.status).toBe("ok");
    const result = (second as { status: "ok"; state: InventoryState }).state;

    expect(result.slots[0]).toEqual({ itemId: "stone", count: 64 });
    expect(result.slots[1]).toEqual({ itemId: "stone", count: 6 });
    expect(result.slots[2]).toBeNull();
  });

  test("rejects when total capacity cannot hold the stack limit", () => {
    const singleSlot: InventoryLayout = { slots: 1 };
    const state = createEmptyInventory(singleSlot);
    const result = putItem(state, singleSlot, traits, "stone", 100);
    expect(result).toEqual({ status: "rejected", reason: "no-space" });
  });

  test("rejects items whose kind does not match the layout's accepts filter", () => {
    const state = createEmptyInventory(toolbeltLayout);
    const result = putItem(state, toolbeltLayout, traits, "stone", 1);
    expect(result).toEqual({ status: "rejected", reason: "wrong-kind" });
  });

  test("accepts items whose kind matches the layout's accepts filter", () => {
    const state = createEmptyInventory(toolbeltLayout);
    const result = putItem(state, toolbeltLayout, traits, "sword", 1);
    expect(result.status).toBe("ok");
  });
});

describe("putItem explicit slot", () => {
  test("places into an empty explicit slot", () => {
    const state = createEmptyInventory(backpackLayout);
    const result = putItem(state, backpackLayout, traits, "stone", 10, { slot: 1 });
    expect(result.status).toBe("ok");
    const next = (result as { status: "ok"; state: InventoryState }).state;
    expect(next.slots[0]).toBeNull();
    expect(next.slots[1]).toEqual({ itemId: "stone", count: 10 });
  });

  test("merges into an occupied explicit slot holding the same item", () => {
    let state = createEmptyInventory(backpackLayout);
    state = (putItem(state, backpackLayout, traits, "stone", 10, { slot: 0 }) as { status: "ok"; state: InventoryState })
      .state;
    const result = putItem(state, backpackLayout, traits, "stone", 5, { slot: 0 });
    expect(result).toEqual({ status: "ok", state: { slots: [{ itemId: "stone", count: 15 }, null, null] } });
  });

  test("rejects an occupied explicit slot holding a different item", () => {
    let state = createEmptyInventory(backpackLayout);
    state = (putItem(state, backpackLayout, traits, "stone", 10, { slot: 0 }) as { status: "ok"; state: InventoryState })
      .state;
    const result = putItem(state, backpackLayout, traits, "sword", 1, { slot: 0 });
    expect(result).toEqual({ status: "rejected", reason: "slot-occupied" });
  });

  test("rejects an out-of-range explicit slot", () => {
    const state = createEmptyInventory(backpackLayout);
    expect(putItem(state, backpackLayout, traits, "stone", 1, { slot: -1 })).toEqual({
      status: "rejected",
      reason: "invalid-slot",
    });
    expect(putItem(state, backpackLayout, traits, "stone", 1, { slot: 3 })).toEqual({
      status: "rejected",
      reason: "invalid-slot",
    });
  });
});

describe("takeItem", () => {
  test("drains stacks from the end deterministically", () => {
    const state: InventoryState = {
      slots: [
        { itemId: "stone", count: 5 },
        { itemId: "stone", count: 5 },
      ],
    };
    const result = takeItem(state, "stone", 8);
    expect(result).toEqual({
      status: "ok",
      state: { slots: [{ itemId: "stone", count: 2 }, null] },
    });
  });

  test("rejects when there is not enough of the item", () => {
    const state: InventoryState = { slots: [{ itemId: "stone", count: 2 }, null] };
    const result = takeItem(state, "stone", 100);
    expect(result).toEqual({ status: "rejected", reason: "insufficient" });
  });
});

describe("countItem / hasItem", () => {
  test("sums counts across slots", () => {
    const state: InventoryState = {
      slots: [{ itemId: "stone", count: 5 }, { itemId: "stone", count: 6 }, { itemId: "sword", count: 1 }],
    };
    expect(countItem(state, "stone")).toBe(11);
    expect(hasItem(state, "stone", 11)).toBe(true);
    expect(hasItem(state, "stone", 12)).toBe(false);
    expect(countItem(state, "shield")).toBe(0);
  });
});

describe("moveItem", () => {
  test("merges stacks of the same item into the destination slot", () => {
    const from: InventoryState = { slots: [{ itemId: "stone", count: 10 }, null] };
    const to: InventoryState = { slots: [{ itemId: "stone", count: 5 }, null] };
    const result = moveItem(from, 0, to, backpackLayout, traits, 0);
    expect(result).toEqual({
      status: "ok",
      from: { slots: [null, null] },
      to: { slots: [{ itemId: "stone", count: 15 }, null] },
    });
  });

  test("moves into an empty destination slot", () => {
    const from: InventoryState = { slots: [{ itemId: "stone", count: 10 }, null] };
    const to: InventoryState = { slots: [null, null] };
    const result = moveItem(from, 0, to, backpackLayout, traits, 1);
    expect(result).toEqual({
      status: "ok",
      from: { slots: [null, null] },
      to: { slots: [null, { itemId: "stone", count: 10 }] },
    });
  });

  test("swaps stacks holding different items", () => {
    const from: InventoryState = { slots: [{ itemId: "sword", count: 1 }] };
    const to: InventoryState = { slots: [{ itemId: "shield", count: 1 }] };
    const result = moveItem(from, 0, to, toolbeltLayout, traits, 0);
    expect(result).toEqual({
      status: "ok",
      from: { slots: [{ itemId: "shield", count: 1 }] },
      to: { slots: [{ itemId: "sword", count: 1 }] },
    });
  });

  test("rejects moving an item whose kind the destination layout does not accept", () => {
    const from: InventoryState = { slots: [{ itemId: "stone", count: 1 }] };
    const to: InventoryState = { slots: [null, null] };
    const result = moveItem(from, 0, to, toolbeltLayout, traits, 0);
    expect(result).toEqual({ status: "rejected", reason: "wrong-kind" });
  });
});

describe("createInventorySet", () => {
  test("supports the put(id, itemId, count) call shape and keeps state per id", () => {
    const inventories = createInventorySet(
      { backpack: backpackLayout, toolbelt: toolbeltLayout },
      traits,
    );

    const putResult = inventories.put("backpack", "stone", 12);
    expect(putResult.status).toBe("ok");
    expect(inventories.count("backpack", "stone")).toBe(12);
    expect(inventories.has("backpack", "stone", 12)).toBe(true);
    expect(inventories.state("backpack").slots[0]).toEqual({ itemId: "stone", count: 12 });

    const takeResult = inventories.take("backpack", "stone", 5);
    expect(takeResult.status).toBe("ok");
    expect(inventories.count("backpack", "stone")).toBe(7);

    inventories.put("toolbelt", "sword", 1);
    const moveResult = inventories.move("toolbelt", 0, "toolbelt", 1);
    expect(moveResult.status).toBe("ok");
    expect(inventories.state("toolbelt").slots[1]).toEqual({ itemId: "sword", count: 1 });
    expect(inventories.state("toolbelt").slots[0]).toBeNull();
  });
});
