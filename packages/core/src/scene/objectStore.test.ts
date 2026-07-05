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
