import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createObjectStore } from "../scene/objectStore";
import { createGameContext, type GameContextContent } from "./gameContext";
import { fromRuntimeObjectRow, toRuntimeObjectRow } from "./objectRows";

const CONTENT: GameContextContent = {
  itemById(itemId) {
    return itemId === "gpu" ? { baseType: "hardware" } : null;
  },
  objectById(catalogId) {
    if (catalogId === "rack") return { slotInventory: { slots: 2, accepts: "hardware" } };
    if (catalogId === "bench") return {};
    return null;
  },
};

function makeContext() {
  return createGameContext({
    definition: defineGameDefinition({
      name: "RackGame",
      assets: createAssetCatalog(),
      multiplayer: "off",
      inventories: {
        backpack: { slots: 4, traits: { stackLimit: () => 8, kind: (itemId) => (itemId === "gpu" ? "hardware" : "junk") } },
      },
    }),
    content: CONTENT,
    player: { userId: "user_a", isNew: true },
  });
}

describe("placed object per-instance state", () => {
  test("state survives move, rotate, and setVisual", () => {
    const objects = createObjectStore();
    const id = objects.place("rack", 0, 0, 0, { state: { owner: "user_a" } });

    objects.move(id, 1, 0, 1);
    objects.rotate(id, 1.5);
    objects.setVisual(id, { color: "#f00" });
    expect(objects.get(id)?.state).toEqual({ owner: "user_a" });

    objects.patchState(id, { powered: true, owner: undefined });
    expect(objects.get(id)?.state).toEqual({ powered: true });

    objects.setState(id, undefined);
    expect(objects.get(id)?.state).toBeUndefined();
  });

  test("placement, state and slots round-trip through RuntimeObjectRow", () => {
    const objects = createObjectStore();
    const id = objects.place("rack", 2, 0, -3, {
      rotation: 0.25,
      parentSpace: "lab",
      state: { powered: true },
      slots: { slots: [{ itemId: "gpu", count: 1 }, null] },
    });
    const object = objects.get(id)!;

    const row = toRuntimeObjectRow(object);
    expect(row.flags).toEqual({ powered: true });
    expect(fromRuntimeObjectRow(row)).toEqual(object);
  });

  test("objects replicate through the baseline snapshot module", () => {
    const host = makeContext();
    const id = host.scene.object.place("rack", 4, 0, 4, { state: { powered: true } });
    host.scene.object.slots.put(id, "gpu", 1);

    const client = makeContext();
    client.scene.object.place("bench", 9, 0, 9);
    client.hydrate(host.snapshot());

    expect(client.scene.object.get(id)?.state).toEqual({ powered: true });
    expect(client.scene.object.slots.count(id, "gpu")).toBe(1);
    expect(client.scene.object.list().map((object) => object.catalogId)).toEqual(["rack"]);
  });
});

describe("object slot inventories", () => {
  test("catalog slotInventory bounds and filters what an object accepts", () => {
    const ctx = makeContext();
    const rack = ctx.scene.object.place("rack", 0, 0, 0);
    const bench = ctx.scene.object.place("bench", 5, 0, 0);

    expect(ctx.scene.object.slots.layout(rack)).toEqual({ slots: 2, accepts: "hardware" });
    expect(ctx.scene.object.slots.layout(bench)).toBeNull();
    expect(ctx.scene.object.slots.put(bench, "gpu", 1)).toEqual({
      status: "rejected",
      reason: "no-slot-inventory",
    });
    expect(ctx.scene.object.slots.put(rack, "sandwich", 1)).toEqual({
      status: "rejected",
      reason: "wrong-kind",
    });
    expect(ctx.scene.object.slots.put("object-missing", "gpu", 1)).toEqual({
      status: "rejected",
      reason: "unknown-object",
    });
  });

  test("transfers move items between a player inventory and object slots", () => {
    const ctx = makeContext();
    const rack = ctx.scene.object.place("rack", 0, 0, 0);
    ctx.player.inventory.put("backpack", "gpu", 2);

    expect(ctx.scene.object.slots.transferIn({ instanceId: rack, userId: "user_a", inventoryId: "backpack", itemId: "gpu", count: 2, slot: 1 })).toEqual({ status: "ok" });
    expect(ctx.player.inventory.count("backpack", "gpu")).toBe(0);
    expect(ctx.scene.object.slots.count(rack, "gpu")).toBe(2);
    expect(ctx.scene.object.slots.state(rack)?.slots[1]).toEqual({ itemId: "gpu", count: 2 });

    expect(ctx.scene.object.slots.transferOut({ instanceId: rack, userId: "user_a", inventoryId: "backpack", itemId: "gpu", count: 1, slot: 1 })).toEqual({ status: "ok" });
    expect(ctx.player.inventory.count("backpack", "gpu")).toBe(1);
    expect(ctx.scene.object.slots.count(rack, "gpu")).toBe(1);
  });

  test("a rejected transfer leaves both sides untouched", () => {
    const ctx = makeContext();
    const rack = ctx.scene.object.place("rack", 0, 0, 0);
    ctx.player.inventory.put("backpack", "gpu", 1);

    expect(ctx.scene.object.slots.transferIn({ instanceId: rack, userId: "user_a", inventoryId: "nope", itemId: "gpu" })).toEqual({
      status: "rejected",
      reason: "unknown-inventory",
    });
    expect(ctx.scene.object.slots.transferOut({ instanceId: rack, userId: "user_a", inventoryId: "backpack", itemId: "gpu" })).toEqual({
      status: "rejected",
      reason: "insufficient",
    });
    expect(ctx.player.inventory.count("backpack", "gpu")).toBe(1);
    expect(ctx.scene.object.slots.count(rack, "gpu")).toBe(0);
  });
});
