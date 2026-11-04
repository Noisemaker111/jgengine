import { describe, expect, test } from "bun:test";

import { createObjectStore } from "@jgengine/core/scene/objectStore";

import { drawsScaledModel, placedObjectIds } from "./WorldScene";

describe("WorldScene scaled models", () => {
  test("only a placement with its own visual scale draws through a scale group", () => {
    expect(drawsScaledModel({ visual: { scale: [12, 30, 18] } })).toBe(true);
    expect(drawsScaledModel({ visual: { color: "#fff" } })).toBe(false);
    expect(drawsScaledModel({ visual: undefined })).toBe(false);
  });
});

describe("WorldScene object list", () => {
  test("clearing props away keeps the same list, so the world's objects are not rebuilt", () => {
    const store = createObjectStore();
    store.place("crate", 0, 0, 0, { instanceId: "a" });
    store.place("crate", 1, 0, 0, { instanceId: "b" });
    const read = placedObjectIds(store);
    const before = read();
    expect(before).toEqual(["a", "b"]);
    store.remove("a");
    expect(read()).toBe(before);
  });

  test("a placement, even of an id that was removed, gives a new list", () => {
    const store = createObjectStore();
    store.place("crate", 0, 0, 0, { instanceId: "a" });
    const read = placedObjectIds(store);
    const before = read();
    store.remove("a");
    store.place("barrel", 0, 0, 0, { instanceId: "a" });
    const after = read();
    expect(after).not.toBe(before);
    expect(after).toEqual(["a"]);
    store.hydrate([{ instanceId: "b", catalogId: "crate", position: [0, 0, 0], rotationY: 0 }]);
    expect(read()).toEqual(["b"]);
  });
});
