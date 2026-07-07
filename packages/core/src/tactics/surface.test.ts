import { describe, expect, test } from "bun:test";
import { createSurfaceLayer } from "@jgengine/core/tactics/surface";

const config = {
  kinds: [
    { id: "grease" },
    { id: "fire", duration: 2 },
    { id: "water" },
    { id: "electrified", duration: 1 },
    { id: "steam", duration: 3 },
  ],
  reactions: [
    { when: ["grease", "fire"] as const, result: "fire" },
    { when: ["water", "lightning"] as const, result: "electrified" },
    { when: ["water", "fire"] as const, result: "steam" },
  ],
};

describe("surface combination matrix", () => {
  test("grease + fire ignites into fire", () => {
    const layer = createSurfaceLayer(config);
    layer.apply([2, 2], "grease");
    const events = layer.apply([2, 2], "fire");
    expect(layer.kindsAt([2, 2])).toEqual(["fire"]);
    expect(events).toContainEqual({ kind: "react", tile: [2, 2], consumed: ["grease", "fire"], produced: "fire" });
  });

  test("water + lightning electrifies", () => {
    const layer = createSurfaceLayer(config);
    layer.apply([0, 0], "water");
    layer.apply([0, 0], "lightning");
    expect(layer.kindsAt([0, 0])).toEqual(["electrified"]);
  });

  test("water + fire cancels both into steam", () => {
    const layer = createSurfaceLayer(config);
    layer.apply([1, 1], "fire");
    layer.apply([1, 1], "water");
    expect(layer.has([1, 1], "fire")).toBe(false);
    expect(layer.has([1, 1], "water")).toBe(false);
    expect(layer.kindsAt([1, 1])).toEqual(["steam"]);
  });

  test("non-reacting surfaces coexist on a tile", () => {
    const layer = createSurfaceLayer(config);
    layer.apply([0, 0], "grease");
    layer.apply([0, 0], "water");
    expect(layer.kindsAt([0, 0]).sort()).toEqual(["grease", "water"]);
  });
});

describe("surface tick / persistence", () => {
  test("timed surfaces decay and expire on their own tick", () => {
    const layer = createSurfaceLayer(config);
    layer.apply([3, 3], "fire");
    expect(layer.tick(1)).toEqual([]);
    expect(layer.has([3, 3], "fire")).toBe(true);
    const events = layer.tick(1.5);
    expect(events).toEqual([{ kind: "expire", tile: [3, 3], surface: "fire" }]);
    expect(layer.has([3, 3], "fire")).toBe(false);
  });

  test("permanent surfaces persist across ticks", () => {
    const layer = createSurfaceLayer(config);
    layer.apply([0, 0], "water");
    layer.tick(1000);
    expect(layer.has([0, 0], "water")).toBe(true);
  });

  test("apply patch overrides the configured duration", () => {
    const layer = createSurfaceLayer(config);
    layer.apply([0, 0], "fire", { duration: 10 });
    layer.tick(5);
    expect(layer.has([0, 0], "fire")).toBe(true);
  });
});

describe("surface snapshot", () => {
  test("capture and restore round-trips surface cells", () => {
    const layer = createSurfaceLayer(config);
    layer.apply([1, 1], "water");
    layer.apply([2, 2], "fire");
    const snap = layer.capture();
    layer.clear();
    layer.restore(snap);
    expect(layer.has([1, 1], "water")).toBe(true);
    expect(layer.has([2, 2], "fire")).toBe(true);
  });
});
