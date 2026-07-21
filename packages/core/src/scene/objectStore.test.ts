import { describe, expect, test } from "bun:test";
import { createObjectStore, objectVisualScale } from "@jgengine/core/scene/objectStore";

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

  test("at finds objects at an exact position and none elsewhere", () => {
    const store = createObjectStore();
    const id = store.place("rack", 4, 0, 2);
    expect(store.at(4, 0, 2).map((o) => o.instanceId)).toEqual([id]);
    expect(store.at(4, 0, 3)).toEqual([]);
  });

  test("at respects tolerance, including across a cell boundary", () => {
    const store = createObjectStore();
    const id = store.place("rack", 4.9, 0, 2);
    expect(store.at(5.05, 0, 2, 0.05)).toEqual([]);
    expect(store.at(5.05, 0, 2, 0.2)).toEqual([store.get(id)]);
    expect(store.at(4, 0, 2, 0.1)).toEqual([]);
  });

  test("at reflects move and stops finding removed objects", () => {
    const store = createObjectStore();
    const id = store.place("rack", 0, 0, 0);
    expect(store.at(0, 0, 0)).toHaveLength(1);
    store.move(id, 10, 0, 10);
    expect(store.at(0, 0, 0)).toEqual([]);
    expect(store.at(10, 0, 10).map((o) => o.instanceId)).toEqual([id]);
    store.remove(id);
    expect(store.at(10, 0, 10)).toEqual([]);
  });

  test("at returns every match at a shared position", () => {
    const store = createObjectStore();
    const first = store.place("rack", 1, 0, 1);
    const second = store.place("rack", 1, 0, 1);
    const found = store.at(1, 0, 1).map((o) => o.instanceId).sort();
    expect(found).toEqual([first, second].sort());
  });

  test("at returns nothing after clear", () => {
    const store = createObjectStore();
    store.place("rack", 2, 0, 2);
    store.clear();
    expect(store.at(2, 0, 2)).toEqual([]);
  });

  test("clear removes all objects", () => {
    const store = createObjectStore();
    store.place("rack", 0, 0, 0);
    store.place("rack", 1, 0, 0);
    store.clear();
    expect(store.list()).toEqual([]);
  });

  test("at returns every match when cells collide", () => {
    const store = createObjectStore();
    const first = store.place("crate", 0, 0, 0);
    const second = store.place("barrel", 0, 0, 0);
    expect(store.at(0, 0, 0).map((o) => o.instanceId).sort()).toEqual([first, second].sort());
    store.remove(second);
    expect(store.at(0, 0, 0).map((o) => o.instanceId)).toEqual([first]);
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

  test("inBox only walks cells overlapping the query range", () => {
    const store = createObjectStore();
    store.place("crate", 0, 0, 0, { instanceId: "origin" });
    store.place("crate", 100, 0, 100, { instanceId: "far" });
    expect(store.inBox([99, -1, 99], [101, 1, 101]).map((o) => o.instanceId)).toEqual(["far"]);
    expect(store.inBox([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]).map((o) => o.instanceId)).toEqual(["origin"]);
    expect(store.inBox([40, 0, 40], [50, 0, 50])).toEqual([]);
  });

  test("inBox on a city-scale volume still finds objects without enumerating millions of empty 1m cells (#1517)", () => {
    const store = createObjectStore();
    store.place("crate", 0, 0, 0, { instanceId: "origin" });
    store.place("crate", 50, 0, 50, { instanceId: "mid" });
    store.place("crate", 200, 0, 200, { instanceId: "far" });
    // ~100³ cell volume at 1 m cells would thrash; bailout must still return correct hits.
    const hits = store.inBox([-50, -50, -50], [50, 50, 50]).map((o) => o.instanceId).sort();
    expect(hits).toEqual(["mid", "origin"]);
    expect(hits).not.toContain("far");
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

  test("place carries an optional per-instance visual", () => {
    const store = createObjectStore();
    const id = store.place("crate", 0, 0, 0, { visual: { color: "#ff0000", opacity: 0.5, scale: 2 } });
    expect(store.get(id)?.visual).toEqual({ color: "#ff0000", opacity: 0.5, scale: 2 });
  });

  test("place omits visual entirely when not given", () => {
    const store = createObjectStore();
    const id = store.place("crate", 0, 0, 0);
    expect(store.get(id)?.visual).toBeUndefined();
    expect(Object.keys(store.get(id)!)).not.toContain("visual");
  });

  test("setVisual updates an existing object's visual and reports missing ids", () => {
    const store = createObjectStore();
    const id = store.place("crate", 0, 0, 0);
    expect(store.setVisual(id, { color: "#00ff00" })).toBe(true);
    expect(store.get(id)?.visual).toEqual({ color: "#00ff00" });
    expect(store.setVisual("missing", { color: "#00ff00" })).toBe(false);
  });

  test("setVisual with undefined clears a previously set visual", () => {
    const store = createObjectStore();
    const id = store.place("crate", 0, 0, 0, { visual: { color: "#ff0000" } });
    expect(store.setVisual(id, undefined)).toBe(true);
    expect(store.get(id)?.visual).toBeUndefined();
  });

  test("setVisual preserves position, rotation, and parentSpace", () => {
    const store = createObjectStore();
    const id = store.place("crate", 1, 2, 3, { rotation: 0.5, parentSpace: "plot:garage" });
    store.setVisual(id, { scale: [2, 3, 4] });
    const object = store.get(id);
    expect(object?.position).toEqual([1, 2, 3]);
    expect(object?.rotationY).toBe(0.5);
    expect(object?.parentSpace).toBe("plot:garage");
    expect(object?.visual).toEqual({ scale: [2, 3, 4] });
  });

  test("onExisting keep returns the existing instanceId untouched", () => {
    const store = createObjectStore();
    store.place("rack", 1, 0, 2, { instanceId: "r1" });
    const id = store.place("rack.gpu", 9, 0, 9, { instanceId: "r1", onExisting: "keep" });
    expect(id).toBe("r1");
    expect(store.get("r1")?.catalogId).toBe("rack");
    expect(store.get("r1")?.position).toEqual([1, 0, 2]);
  });

  test("onExisting replace respawns fresh and keeps the spatial index correct", () => {
    const store = createObjectStore();
    store.place("rack", 1, 0, 2, { instanceId: "r1" });
    expect(store.at(1, 0, 2)).toHaveLength(1);

    const id = store.place("rack.gpu", 9, 0, 9, { instanceId: "r1", onExisting: "replace" });
    expect(id).toBe("r1");
    expect(store.get("r1")?.catalogId).toBe("rack.gpu");
    expect(store.get("r1")?.position).toEqual([9, 0, 9]);
    expect(store.at(1, 0, 2)).toEqual([]);
    expect(store.at(9, 0, 9).map((o) => o.instanceId)).toEqual(["r1"]);
  });

  test("onExisting default still throws on a duplicate id", () => {
    const store = createObjectStore();
    store.place("rack", 0, 0, 0, { instanceId: "r1" });
    expect(() => store.place("rack.gpu", 1, 0, 0, { instanceId: "r1" })).toThrow();
  });
});

describe("objectVisualScale", () => {
  test("defaults to a unit scale when no visual or scale is given", () => {
    expect(objectVisualScale(undefined)).toEqual([1, 1, 1]);
    expect(objectVisualScale({})).toEqual([1, 1, 1]);
  });

  test("broadcasts a numeric scale across all three axes", () => {
    expect(objectVisualScale({ scale: 2.5 })).toEqual([2.5, 2.5, 2.5]);
  });

  test("passes a tuple scale through unchanged", () => {
    expect(objectVisualScale({ scale: [1, 2, 3] })).toEqual([1, 2, 3]);
  });
});
