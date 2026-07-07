import { describe, expect, test } from "bun:test";
import { createSnapshotStore, deepClone } from "@jgengine/core/tactics/snapshot";
import { createTacticalGrid } from "@jgengine/core/tactics/tacticalGrid";
import { createSurfaceLayer } from "@jgengine/core/tactics/surface";
import { createTurnLoop } from "@jgengine/core/turn/turnLoop";

describe("deepClone", () => {
  test("clones nested objects, arrays, maps and sets without aliasing", () => {
    const source = { a: [1, 2], m: new Map([["k", { v: 1 }]]), s: new Set([1]) };
    const clone = deepClone(source);
    clone.a.push(3);
    clone.m.get("k")!.v = 99;
    clone.s.add(2);
    expect(source.a).toEqual([1, 2]);
    expect(source.m.get("k")!.v).toBe(1);
    expect([...source.s]).toEqual([1]);
  });
});

describe("snapshot store across engine slices", () => {
  test("capture, mutate, restore round-trips grid + surface + turn state", () => {
    const grid = createTacticalGrid({ width: 6, height: 6 });
    const surface = createSurfaceLayer({ kinds: [{ id: "fire", duration: 3 }] });
    const loop = createTurnLoop({ order: ["a", "b"], pools: [{ id: "ap", max: 2 }] });
    grid.place("a", [1, 1]);
    surface.apply([1, 1], "fire");

    const store = createSnapshotStore();
    store.register("grid", grid);
    store.register("surface", surface);
    store.register("turn", loop);

    const snap = store.capture();

    grid.move("a", [4, 4]);
    surface.clear();
    loop.advanceTurn();
    loop.spend("b", "ap", 2);

    store.restore(snap);
    expect(grid.tileOf("a")).toEqual([1, 1]);
    expect(surface.has([1, 1], "fire")).toBe(true);
    expect(loop.active()).toBe("a");
    expect(loop.pool("b", "ap")!.current).toBe(2);
  });

  test("push/pop stack supports repeated in-turn undo", () => {
    const grid = createTacticalGrid({ width: 6, height: 1 });
    grid.place("a", [0, 0]);
    const store = createSnapshotStore();
    store.register("grid", grid);

    store.push();
    grid.move("a", [1, 0]);
    store.push();
    grid.move("a", [2, 0]);
    expect(store.depth()).toBe(2);

    expect(store.pop()).toBe(true);
    expect(grid.tileOf("a")).toEqual([1, 0]);
    expect(store.pop()).toBe(true);
    expect(grid.tileOf("a")).toEqual([0, 0]);
    expect(store.pop()).toBe(false);
  });

  test("a captured snapshot is immune to later mutation", () => {
    const grid = createTacticalGrid({ width: 4, height: 4 });
    grid.place("a", [0, 0]);
    const store = createSnapshotStore();
    store.register("grid", grid);
    const snap = store.capture();
    grid.move("a", [3, 3]);
    store.restore(snap);
    expect(grid.tileOf("a")).toEqual([0, 0]);
  });
});
