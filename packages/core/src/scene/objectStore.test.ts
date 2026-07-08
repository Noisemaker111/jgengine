import { describe, expect, test } from "bun:test";
import { createObjectStore } from "@jgengine/core/scene/objectStore";

describe("scene object store", () => {
  test("place generates unique ids when omitted and stores catalogId, position, rotation", () => {
    const store = createObjectStore();
    const first = store.place("server_rack", 1, 0, 2);
    const second = store.place("server_rack", 3, 0, 2, { rotation: Math.PI });
    expect(first).not.toEqual(second);
    expect(store.get(first)?.catalogId).toBe("server_rack");
    expect(store.get(first)?.position).toEqual([1, 0, 2]);
    expect(store.get(first)?.rotationY).toBe(0);
    expect(store.get(second)?.rotationY).toBe(Math.PI);
  });

  test("place throws on explicit duplicate id", () => {
    const store = createObjectStore();
    store.place("power_panel", 0, 0, 0, { instanceId: "panel_1" });
    expect(() => store.place("power_panel", 1, 0, 0, { instanceId: "panel_1" })).toThrow();
  });

  test("remove reports whether the object existed", () => {
    const store = createObjectStore();
    const id = store.place("crate", 0, 0, 0);
    expect(store.remove(id)).toBe(true);
    expect(store.get(id)).toBeNull();
    expect(store.remove(id)).toBe(false);
  });

  test("move and rotate patch the object and return false for unknown ids", () => {
    const store = createObjectStore();
    const id = store.place("crate", 0, 0, 0);
    expect(store.move(id, 4, 0, 2)).toBe(true);
    expect(store.rotate(id, 1.5)).toBe(true);
    expect(store.get(id)?.position).toEqual([4, 0, 2]);
    expect(store.get(id)?.rotationY).toBe(1.5);
    expect(store.move("missing", 0, 0, 0)).toBe(false);
    expect(store.rotate("missing", 0)).toBe(false);
  });

  test("list filters by parentSpace", () => {
    const store = createObjectStore();
    store.place("rack", 0, 0, 0, { parentSpace: "plot:garage" });
    store.place("rack", 1, 0, 0, { parentSpace: "plot:garage" });
    store.place("rack", 2, 0, 0, { parentSpace: "plot:office" });
    expect(store.list()).toHaveLength(3);
    expect(store.list({ parentSpace: "plot:garage" })).toHaveLength(2);
    expect(store.list({ parentSpace: "plot:empty" })).toEqual([]);
  });

  test("clear removes all objects", () => {
    const store = createObjectStore();
    store.place("rack", 0, 0, 0);
    store.place("rack", 1, 0, 0);
    store.clear();
    expect(store.list()).toEqual([]);
  });

  test("at finds the object occupying a cell and misses empty cells", () => {
    const store = createObjectStore();
    const id = store.place("crate", 2, 0, 5);
    expect(store.at(2, 0, 5)).not.toBeNull();
    expect(store.at(2, 0, 5)?.instanceId).toBe(id);
    expect(store.at(2.4, 0.1, 4.6)?.instanceId).toBe(id);
    expect(store.at(9, 0, 9)).toBeNull();
  });

  test("at returns the most recently placed object when cells collide", () => {
    const store = createObjectStore();
    const first = store.place("crate", 0, 0, 0);
    const second = store.place("barrel", 0, 0, 0);
    expect(store.at(0, 0, 0)?.instanceId).toBe(second);
    store.remove(second);
    expect(store.at(0, 0, 0)?.instanceId).toBe(first);
  });

  test("at reflects move and clears on remove", () => {
    const store = createObjectStore();
    const id = store.place("crate", 0, 0, 0);
    expect(store.at(0, 0, 0)?.instanceId).toBe(id);
    store.move(id, 3, 0, 3);
    expect(store.at(0, 0, 0)).toBeNull();
    expect(store.at(3, 0, 3)?.instanceId).toBe(id);
    store.remove(id);
    expect(store.at(3, 0, 3)).toBeNull();
  });

  test("inBox filters by inclusive AABB bounds", () => {
    const store = createObjectStore();
    const inside = store.place("crate", 1, 0, 1);
    const onMinEdge = store.place("crate", 0, 0, 0);
    const onMaxEdge = store.place("crate", 2, 0, 2);
    const outside = store.place("crate", 3, 0, 3);
    const ids = store.inBox([0, 0, 0], [2, 0, 2]).map((object) => object.instanceId);
    expect(ids.sort()).toEqual([inside, onMaxEdge, onMinEdge].sort());
    expect(ids).not.toContain(outside);
  });

  test("subscribe fires once per mutation and snapshot is referentially stable", () => {
    const store = createObjectStore();
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    const id = store.place("rack", 0, 0, 0);
    const afterPlace = store.snapshot();
    expect(store.snapshot()).toBe(afterPlace);

    store.move(id, 1, 0, 0);
    store.remove(id);
    expect(notified).toBe(3);

    unsubscribe();
    store.place("rack", 0, 0, 0);
    expect(notified).toBe(3);
  });
});
