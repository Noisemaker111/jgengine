import { describe, expect, test } from "bun:test";

import { createPlacedStructureStore } from "./placedStructureStore";

describe("placedStructureStore", () => {
  test("save, move, rotate, and delete round-trip a placement", () => {
    const store = createPlacedStructureStore();
    const bed = store.add({ catalogId: "bed", position: [1, 0, 2], rotationY: 0, plotId: "home" });
    expect(store.move(bed.id, [3, 0, 4])).toBe(true);
    expect(store.rotate(bed.id, 1.57)).toBe(true);
    const moved = store.get(bed.id)!;
    expect(moved.position).toEqual([3, 0, 4]);
    expect(moved.rotationY).toBe(1.57);
    expect(store.remove(bed.id)).toBe(true);
    expect(store.get(bed.id)).toBeNull();
  });

  test("list filters by plot and catalog id", () => {
    const store = createPlacedStructureStore();
    store.add({ catalogId: "bed", position: [0, 0, 0], plotId: "home" });
    store.add({ catalogId: "lamp", position: [1, 0, 0], plotId: "home" });
    store.add({ catalogId: "bed", position: [2, 0, 0], plotId: "shop" });
    expect(store.list({ plotId: "home" })).toHaveLength(2);
    expect(store.list({ catalogId: "bed" })).toHaveLength(2);
    expect(store.list({ plotId: "home", catalogId: "bed" })).toHaveLength(1);
  });

  test("selection tracks the active structure and clears on delete", () => {
    const store = createPlacedStructureStore();
    const lamp = store.add({ catalogId: "lamp", position: [0, 0, 0] });
    expect(store.select(lamp.id)).toBe(true);
    expect(store.selected()?.id).toBe(lamp.id);
    store.remove(lamp.id);
    expect(store.selected()).toBeNull();
    expect(store.select("missing")).toBe(false);
  });

  test("snapshot and load persist a whole layout across a reload", () => {
    const store = createPlacedStructureStore();
    store.add({ catalogId: "bed", position: [1, 0, 1], rotationY: 0.5, plotId: "home", data: { color: "red" } });
    store.add({ catalogId: "lamp", position: [2, 0, 2] });
    const snapshot = store.snapshot();

    const reloaded = createPlacedStructureStore();
    reloaded.load(snapshot);
    expect(reloaded.list()).toHaveLength(2);
    const bed = reloaded.list({ catalogId: "bed" })[0]!;
    expect(bed.data).toEqual({ color: "red" });
    expect(bed.rotationY).toBe(0.5);
  });

  test("subscribe fires on mutation", () => {
    const store = createPlacedStructureStore();
    let calls = 0;
    const unsub = store.subscribe(() => {
      calls += 1;
    });
    store.add({ catalogId: "bed", position: [0, 0, 0] });
    expect(calls).toBe(1);
    unsub();
  });
});
