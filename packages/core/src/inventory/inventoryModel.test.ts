import { describe, expect, test } from "bun:test";
import {
  countItem,
  createEmptyInventory,
  createInventorySet,
  hasItem,
  moveItem,
  putItem,
  splitStack,
  takeItem,
  type InventoryLayout,
  type InventoryState,
  type ItemTraits,
} from "@jgengine/core/inventory/inventoryModel";
import { partitionOnDeath } from "@jgengine/core/inventory/storageTier";

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

describe("splitStack", () => {
  test("splits an amount into the first empty slot when no target is given", () => {
    const state: InventoryState = { slots: [{ itemId: "stone", count: 10 }, null, null] };
    const result = splitStack(state, 0, 4);
    expect(result).toEqual({
      status: "ok",
      state: { slots: [{ itemId: "stone", count: 6 }, { itemId: "stone", count: 4 }, null] },
    });
  });

  test("splits into an explicit empty target slot", () => {
    const state: InventoryState = { slots: [{ itemId: "stone", count: 10 }, null, null] };
    const result = splitStack(state, 0, 3, 2);
    expect(result).toEqual({
      status: "ok",
      state: { slots: [{ itemId: "stone", count: 7 }, null, { itemId: "stone", count: 3 }] },
    });
  });

  test("merges into an explicit target holding the same item", () => {
    const state: InventoryState = { slots: [{ itemId: "stone", count: 10 }, { itemId: "stone", count: 5 }] };
    const result = splitStack(state, 0, 4, 1);
    expect(result).toEqual({
      status: "ok",
      state: { slots: [{ itemId: "stone", count: 6 }, { itemId: "stone", count: 9 }] },
    });
  });

  test("rejects an empty source, a bad amount, a full inventory, and a foreign target", () => {
    const empty: InventoryState = { slots: [null, { itemId: "stone", count: 4 }] };
    expect(splitStack(empty, 0, 2)).toEqual({ status: "rejected", reason: "empty-slot" });
    expect(splitStack(empty, 5, 2)).toEqual({ status: "rejected", reason: "invalid-slot" });

    const stack: InventoryState = { slots: [{ itemId: "stone", count: 4 }, null] };
    expect(splitStack(stack, 0, 0)).toEqual({ status: "rejected", reason: "invalid-amount" });
    expect(splitStack(stack, 0, 4)).toEqual({ status: "rejected", reason: "invalid-amount" });

    const full: InventoryState = { slots: [{ itemId: "stone", count: 4 }, { itemId: "sword", count: 1 }] };
    expect(splitStack(full, 0, 2)).toEqual({ status: "rejected", reason: "no-space" });
    expect(splitStack(full, 0, 2, 1)).toEqual({ status: "rejected", reason: "slot-occupied" });
    expect(splitStack(full, 0, 2, 0)).toEqual({ status: "rejected", reason: "slot-occupied" });
  });

  test("a stack limit keeps a split merge inside the max stack", () => {
    const near: InventoryState = { slots: [{ itemId: "stone", count: 10 }, { itemId: "stone", count: 6 }, null] };
    expect(splitStack(near, 0, 6, 1, 10)).toEqual({ status: "rejected", reason: "over-stack" });
    expect(splitStack(near, 0, 4, 1, 10).status).toBe("ok");
    expect(splitStack(near, 0, 6, 2, 10).status).toBe("ok");
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

  test("rejects invalid moves without changing a saved inventory after reload", () => {
    const inventories = createInventorySet({ backpack: backpackLayout }, traits);
    inventories.put("backpack", "stone", 10.5);
    const saved = JSON.stringify(inventories.state("backpack"));
    const reloaded = createInventorySet({ backpack: backpackLayout }, traits);
    reloaded.replaceState("backpack", JSON.parse(saved));

    expect(reloaded.move("backpack", Number.NaN, "backpack", 1)).toEqual({ status: "rejected", reason: "invalid-slot" });
    expect(reloaded.move("backpack", 0, "backpack", 0.5)).toEqual({ status: "rejected", reason: "invalid-slot" });
    expect(JSON.stringify(reloaded.state("backpack"))).toBe(saved);
    expect(reloaded.count("backpack", "stone")).toBe(10.5);
    expect(reloaded.move("backpack", 0, "backpack", 1).status).toBe("ok");
    expect(reloaded.state("backpack").slots).toEqual([null, { itemId: "stone", count: 10.5 }, null]);
  });
});

describe("invalid inventory inputs", () => {
  const invalidIndices = [Number.NaN, Infinity, -Infinity, -1, 0.5, 3];

  test("rejects non-integer and out-of-range put slots without mutation", () => {
    const state: InventoryState = { slots: [{ itemId: "stone", count: 10 }, null, null] };
    const saved = JSON.stringify(state);
    for (const slot of invalidIndices) {
      expect(putItem(state, backpackLayout, traits, "stone", 1, { slot })).toEqual({ status: "rejected", reason: "invalid-slot" });
      expect(JSON.stringify(state)).toBe(saved);
    }
  });

  test("rejects invalid move sources and targets in the same or another inventory", () => {
    const from: InventoryState = { slots: [{ itemId: "stone", count: 10 }, null, null] };
    const to = createEmptyInventory(backpackLayout);
    const saved = JSON.stringify({ from, to });
    for (const slot of invalidIndices) {
      expect(moveItem(from, slot, to, backpackLayout, traits, 1)).toEqual({ status: "rejected", reason: "invalid-slot" });
      expect(moveItem(from, 0, to, backpackLayout, traits, slot)).toEqual({ status: "rejected", reason: "invalid-slot" });
      expect(moveItem(from, 0, from, backpackLayout, traits, slot)).toEqual({ status: "rejected", reason: "invalid-slot" });
      expect(JSON.stringify({ from, to })).toBe(saved);
    }
  });

  test("rejects invalid split sources and targets without mutation", () => {
    const state: InventoryState = { slots: [{ itemId: "stone", count: 10 }, null, null] };
    const saved = JSON.stringify(state);
    for (const slot of invalidIndices) {
      expect(splitStack(state, slot, 2, 1)).toEqual({ status: "rejected", reason: "invalid-slot" });
      expect(splitStack(state, 0, 2, slot)).toEqual({ status: "rejected", reason: "invalid-slot" });
      expect(JSON.stringify(state)).toBe(saved);
    }
  });

  test("rejects non-finite split amounts before corrupt counts can be saved", () => {
    const state: InventoryState = { slots: [{ itemId: "stone", count: 10 }, null, null] };
    const saved = JSON.stringify(state);
    for (const amount of [Number.NaN, Infinity, -Infinity]) {
      expect(splitStack(state, 0, amount)).toEqual({ status: "rejected", reason: "invalid-amount" });
      expect(splitStack(state, 0, amount, 1)).toEqual({ status: "rejected", reason: "invalid-amount" });
      expect(JSON.stringify(state)).toBe(saved);
    }
  });

  test("preserves fractional quantities through split, merge and JSON reload", () => {
    const state: InventoryState = { slots: [{ itemId: "stone", count: 10.5 }, { itemId: "stone", count: 5 }, null] };
    const split = splitStack(state, 0, 2.5, 1);
    expect(split.status).toBe("ok");
    if (split.status !== "ok") throw new Error("valid split rejected");
    const reloaded: InventoryState = JSON.parse(JSON.stringify(split.state));
    expect(reloaded.slots).toEqual([{ itemId: "stone", count: 8 }, { itemId: "stone", count: 7.5 }, null]);
    expect(countItem(reloaded, "stone")).toBe(15.5);
    const moved = moveItem(reloaded, 0, reloaded, backpackLayout, traits, 1);
    expect(moved.status).toBe("ok");
    if (moved.status !== "ok") throw new Error("valid move rejected");
    expect(moved.to.slots).toEqual([null, { itemId: "stone", count: 15.5 }, null]);
    expect(countItem(moved.to, "stone")).toBe(15.5);
    expect(state.slots[0]).toEqual({ itemId: "stone", count: 10.5 });
  });
});

describe("stash beside a carried inventory", () => {
  const stashLayout: InventoryLayout = { slots: 4 };

  test("a stash holds its own slots: filling one never changes the other", () => {
    const set = createInventorySet({ bag: backpackLayout, stash: stashLayout }, traits);
    set.put("bag", "stone", 5);
    set.put("stash", "stone", 64);

    expect(set.state("bag").slots).toEqual([{ itemId: "stone", count: 5 }, null, null]);
    expect(set.count("bag", "stone")).toBe(5);
    expect(set.count("stash", "stone")).toBe(64);
    expect(set.state("bag").slots).not.toBe(set.state("stash").slots);
  });

  test("moving into the stash drains the bag and leaves no shared stack", () => {
    const set = createInventorySet({ bag: backpackLayout, stash: stashLayout }, traits);
    set.put("bag", "stone", 40);

    expect(set.move("bag", 0, "stash", 0).status).toBe("ok");
    expect(set.state("bag").slots[0]).toBeNull();
    expect(set.state("stash").slots[0]).toEqual({ itemId: "stone", count: 40 });

    const stashSlot = set.state("stash").slots[0]!;
    (stashSlot as { count: number }).count = 1;
    expect(set.state("bag").slots[0]).toBeNull();
  });

  test("a snapshot is detached: editing it changes nothing live", () => {
    const set = createInventorySet({ bag: backpackLayout, stash: stashLayout }, traits);
    set.put("bag", "stone", 3);
    set.put("stash", "sword", 1);

    const saved = set.snapshot();
    expect(saved.bag.slots[0]).toEqual({ itemId: "stone", count: 3 });

    saved.bag.slots[0] = { itemId: "stone", count: 99 };
    saved.stash.slots[0] = null;
    expect(set.count("bag", "stone")).toBe(3);
    expect(set.count("stash", "sword")).toBe(1);
  });

  test("restore round-trips a save into a fresh set and detaches it", () => {
    const source = createInventorySet({ bag: backpackLayout, stash: stashLayout }, traits);
    source.put("bag", "stone", 7);
    source.put("stash", "shield", 1);
    const saved = JSON.parse(JSON.stringify(source.snapshot()));

    const target = createInventorySet({ bag: backpackLayout, stash: stashLayout }, traits);
    expect(target.restore(saved)).toBe(true);
    expect(target.count("bag", "stone")).toBe(7);
    expect(target.count("stash", "shield")).toBe(1);

    saved.bag.slots[1] = { itemId: "stone", count: 50 };
    expect(target.state("bag").slots[1]).toBeNull();
  });

  test("restore refuses an incomplete or malformed save without touching live items", () => {
    const set = createInventorySet({ bag: backpackLayout, stash: stashLayout }, traits);
    set.put("bag", "stone", 2);

    expect(set.restore({ bag: createEmptyInventory(backpackLayout) } as never)).toBe(false);
    expect(set.restore({ bag: createEmptyInventory(backpackLayout), stash: { slots: [null] } })).toBe(false);
    expect(set.restore({
      bag: { slots: [{ itemId: "stone", count: 0 }, null, null] },
      stash: createEmptyInventory(stashLayout),
    })).toBe(false);
    expect(set.restore({
      bag: { slots: [{ itemId: "stone", count: 1 }, null, null] },
      stash: { slots: [null, null, null, { itemId: "shield", count: Number.NaN }] },
    })).toBe(false);
    expect(set.count("bag", "stone")).toBe(2);
    expect(set.count("stash", "shield")).toBe(0);
  });

  test("reset empties every inventory without leaving stale arrays behind", () => {
    const set = createInventorySet({ bag: backpackLayout, stash: stashLayout }, traits);
    set.put("bag", "stone", 2);
    set.put("stash", "shield", 1);
    set.reset();
    expect(set.count("bag", "stone")).toBe(0);
    expect(set.count("stash", "shield")).toBe(0);
    set.put("stash", "stone", 1);
    expect(set.count("bag", "stone")).toBe(0);
  });

  test("a banked stash survives the death partition while the carried bag is lost", () => {
    const set = createInventorySet({ bag: backpackLayout, stash: stashLayout }, traits);
    set.put("bag", "stone", 4);
    set.put("stash", "sword", 1);

    const partition = partitionOnDeath([
      { inventoryId: "bag", tier: "carried", items: [{ itemId: "stone", count: 4 }] },
      { inventoryId: "stash", tier: "banked", items: [{ itemId: "sword", count: 1 }] },
    ]);
    expect(partition.kept).toEqual([{ itemId: "sword", count: 1 }]);
    expect(partition.lost).toEqual([{ itemId: "stone", count: 4 }]);
    expect(set.count("stash", "sword")).toBe(1);
  });
});
