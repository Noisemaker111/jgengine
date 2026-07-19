import { describe, expect, test } from "bun:test";

import { createAnnotationLayer } from "./mapAnnotations";

describe("createAnnotationLayer", () => {
  test("addStroke records a polyline and projects it into a MapRoute", () => {
    const layer = createAnnotationLayer();
    const id = layer.addStroke([[0, 0], [4, 2], [8, 0]], { tone: "danger", width: 3 });
    expect(layer.strokes()).toHaveLength(1);
    const route = layer.routes()[0]!;
    expect(route.id).toBe(id);
    expect(route.tone).toBe("danger");
    expect(route.width).toBe(3);
    expect(route.points).toEqual([[0, 0], [4, 2], [8, 0]]);
  });

  test("a stroke with fewer than two points is ignored", () => {
    const layer = createAnnotationLayer();
    expect(layer.addStroke([[1, 1]])).toBe("");
    expect(layer.strokes()).toHaveLength(0);
  });

  test("addShape projects into a MapZone; default tone is applied", () => {
    const layer = createAnnotationLayer({ defaultTone: "warning" });
    layer.addShape({ kind: "circle", center: [2, 3], radius: 5 }, { label: "Rally" });
    const zone = layer.zones()[0]!;
    expect(zone.tone).toBe("warning");
    expect(zone.label).toBe("Rally");
    expect(zone.shape).toEqual({ kind: "circle", center: [2, 3], radius: 5 });
  });

  test("addNote pins text at a world point", () => {
    const layer = createAnnotationLayer();
    layer.addNote([7, -3], "ambush");
    expect(layer.notes()[0]).toMatchObject({ position: [7, -3], text: "ambush", tone: "info" });
  });

  test("remove deletes across all annotation kinds; clear empties everything", () => {
    const layer = createAnnotationLayer();
    const s = layer.addStroke([[0, 0], [1, 1]]);
    const z = layer.addShape({ kind: "circle", center: [0, 0], radius: 1 });
    layer.addNote([0, 0], "x");
    expect(layer.remove(s)).toBe(true);
    expect(layer.remove(z)).toBe(true);
    expect(layer.remove("nope")).toBe(false);
    expect(layer.strokes()).toHaveLength(0);
    layer.clear();
    expect(layer.notes()).toHaveLength(0);
  });

  test("routes()/strokes() keep a stable identity until a change (useSyncExternalStore contract)", () => {
    const layer = createAnnotationLayer();
    layer.addStroke([[0, 0], [1, 0]]);
    const a = layer.routes();
    expect(layer.routes()).toBe(a);
    layer.addStroke([[0, 0], [0, 1]]);
    expect(layer.routes()).not.toBe(a);
  });

  test("snapshot/restore round-trips strokes, shapes, and notes", () => {
    const layer = createAnnotationLayer();
    layer.addStroke([[0, 0], [2, 2]], { tone: "safe" });
    layer.addShape({ kind: "rect", center: [1, 1], w: 4, d: 2 });
    layer.addNote([5, 5], "cache");
    const snap = JSON.parse(JSON.stringify(layer.snapshot()));

    const restored = createAnnotationLayer();
    restored.restore(snap);
    expect(restored.strokes()).toHaveLength(1);
    expect(restored.zones()).toHaveLength(1);
    expect(restored.notes()[0]?.text).toBe("cache");
    expect(restored.routes()[0]?.tone).toBe("safe");
  });

  test("subscribe fires on add/remove/clear and stops after unsubscribe", () => {
    const layer = createAnnotationLayer();
    let hits = 0;
    const off = layer.subscribe(() => { hits += 1; });
    const id = layer.addStroke([[0, 0], [1, 1]]);
    layer.remove(id);
    layer.clear(); // already empty → no notify
    off();
    layer.addStroke([[0, 0], [1, 1]]);
    expect(hits).toBe(2);
  });
});
