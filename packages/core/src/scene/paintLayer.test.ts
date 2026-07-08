import { describe, expect, test } from "bun:test";
import { createPaintLayer } from "@jgengine/core/scene/paintLayer";

describe("paintLayer", () => {
  test("paint appends strokes for an instance", () => {
    const layer = createPaintLayer();
    layer.paint("car-1", { u: 0.2, v: 0.3, radius: 0.05, color: "#ff0000" });
    layer.paint("car-1", { u: 0.4, v: 0.6, radius: 0.05, color: "#00ff00" });
    expect(layer.strokes("car-1")).toEqual([
      { u: 0.2, v: 0.3, radius: 0.05, color: "#ff0000" },
      { u: 0.4, v: 0.6, radius: 0.05, color: "#00ff00" },
    ]);
    expect(layer.strokes("car-2")).toEqual([]);
  });

  test("paintedIds lists instances with at least one stroke", () => {
    const layer = createPaintLayer();
    layer.paint("a", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    layer.paint("b", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    expect(layer.paintedIds().sort()).toEqual(["a", "b"]);
  });

  test("clear(instanceId) removes only that instance's strokes", () => {
    const layer = createPaintLayer();
    layer.paint("a", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    layer.paint("b", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    layer.clear("a");
    expect(layer.strokes("a")).toEqual([]);
    expect(layer.strokes("b")).toHaveLength(1);
    expect(layer.paintedIds()).toEqual(["b"]);
  });

  test("clear() with no instance wipes every instance", () => {
    const layer = createPaintLayer();
    layer.paint("a", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    layer.paint("b", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    layer.clear();
    expect(layer.paintedIds()).toEqual([]);
  });

  test("version bumps on paint and clear for the affected instance only", () => {
    const layer = createPaintLayer();
    expect(layer.version("a")).toBe(0);
    layer.paint("a", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    expect(layer.version("a")).toBe(1);
    expect(layer.version("b")).toBe(0);
    layer.paint("a", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    expect(layer.version("a")).toBe(2);
    layer.clear("a");
    expect(layer.version("a")).toBe(3);
  });

  test("subscribe notifies listeners on paint and clear, and unsubscribes cleanly", () => {
    const layer = createPaintLayer();
    let notified = 0;
    const unsubscribe = layer.subscribe(() => {
      notified += 1;
    });
    layer.paint("a", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    layer.clear("a");
    expect(notified).toBe(2);
    unsubscribe();
    layer.paint("a", { u: 0, v: 0, radius: 0.1, color: "#fff" });
    expect(notified).toBe(2);
  });
});
