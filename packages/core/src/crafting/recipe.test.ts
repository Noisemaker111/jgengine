import { describe, expect, test } from "bun:test";

import { createEmptyInventory, putItem, type InventoryLayout, type ItemTraits } from "../inventory/inventoryModel";
import { canCraft, craft, createRecipeGraph, craftSeconds, hasRecipeInputs, missingInputs, stationSatisfied, type RecipeDef } from "./recipe";

const traits: ItemTraits = { stackLimit: () => 99 };
const layout: InventoryLayout = { slots: 6 };

function stocked(items: Record<string, number>) {
  let state = createEmptyInventory(layout);
  for (const [itemId, count] of Object.entries(items)) {
    const put = putItem(state, layout, traits, itemId, count);
    if (put.status !== "ok") throw new Error(`seed failed for ${itemId}`);
    state = put.state;
  }
  return state;
}

const plank: RecipeDef = {
  id: "recipe_plank",
  inputs: [{ itemId: "log", count: 1 }],
  outputs: [{ itemId: "plank", count: 4 }],
  seconds: 2,
};

const forgeBlade: RecipeDef = {
  id: "recipe_blade",
  inputs: [
    { itemId: "ingot", count: 2 },
    { itemId: "handle", count: 1 },
  ],
  outputs: [{ itemId: "blade", count: 1 }],
  station: "forge",
  stationRange: 4,
  requires: ["tech_smithing"],
};

describe("recipe graph", () => {
  test("consumes inputs and produces outputs", () => {
    const result = craft(stocked({ log: 3 }), layout, traits, plank);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const logSlot = result.state.slots.find((s) => s?.itemId === "log");
    const plankSlot = result.state.slots.find((s) => s?.itemId === "plank");
    expect(logSlot?.count).toBe(2);
    expect(plankSlot?.count).toBe(4);
  });

  test("missing inputs blocks the craft and reports the shortfall", () => {
    const state = stocked({ log: 0 });
    expect(hasRecipeInputs(state, plank)).toBe(false);
    expect(missingInputs(state, plank)).toEqual([{ itemId: "log", count: 1 }]);
    const result = craft(state, layout, traits, plank);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toBe("missing-inputs");
  });

  test("workstation-in-range gates the craft", () => {
    const state = stocked({ ingot: 4, handle: 2 });
    const unlocked = () => true;

    const noStation = canCraft(state, layout, traits, forgeBlade, { unlocked, origin: [0, 0], stations: [] });
    expect(noStation.ok).toBe(false);
    if (!noStation.ok) expect(noStation.reason).toBe("no-station");

    const outOfRange = canCraft(state, layout, traits, forgeBlade, {
      unlocked,
      origin: [0, 0],
      stations: [{ catalogId: "forge", position: [10, 0] }],
    });
    expect(outOfRange.ok).toBe(false);

    const inRange = canCraft(state, layout, traits, forgeBlade, {
      unlocked,
      origin: [0, 0],
      stations: [{ catalogId: "forge", position: [2, 1] }],
    });
    expect(inRange.ok).toBe(true);
  });

  test("stationSatisfied ignores non-matching stations", () => {
    expect(
      stationSatisfied(forgeBlade, { origin: [0, 0], stations: [{ catalogId: "anvil", position: [0, 0] }] }),
    ).toBe(false);
  });

  test("locked recipe requires the unlock", () => {
    const state = stocked({ ingot: 4, handle: 2 });
    const stations = [{ catalogId: "forge", position: [1, 0] }];
    const locked = canCraft(state, layout, traits, forgeBlade, { origin: [0, 0], stations, unlocked: () => false });
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.reason).toBe("locked");
      if (locked.reason === "locked") expect(locked.requires).toEqual(["tech_smithing"]);
    }
  });

  test("rejects when outputs do not fit and does not consume inputs", () => {
    const tight: InventoryLayout = { slots: 1 };
    const twoOut: RecipeDef = {
      id: "recipe_kit",
      inputs: [{ itemId: "log", count: 1 }],
      outputs: [
        { itemId: "plank", count: 4 },
        { itemId: "nail", count: 2 },
      ],
    };
    let state = createEmptyInventory(tight);
    state = (putItem(state, tight, traits, "log", 1) as { status: "ok"; state: typeof state }).state;
    const result = craft(state, tight, traits, twoOut);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toBe("no-output-space");
    expect(state.slots[0]).toEqual({ itemId: "log", count: 1 });
  });

  test("craftSeconds reads the craft time", () => {
    expect(craftSeconds(plank)).toBe(2);
    expect(craftSeconds({ ...plank, seconds: undefined })).toBe(0);
  });

  test("graph indexes recipes by product and ingredient", () => {
    const graph = createRecipeGraph([plank, forgeBlade]);
    expect(graph.get("recipe_plank")).toBe(plank);
    expect(graph.producing("plank").map((r) => r.id)).toEqual(["recipe_plank"]);
    expect(graph.using("ingot").map((r) => r.id)).toEqual(["recipe_blade"]);
  });
});
