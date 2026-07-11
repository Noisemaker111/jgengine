import { describe, expect, test } from "bun:test";
import { VisibilitySystem, type CameraVisibilityContext, type VisibilityObject } from "./visibility";

const camera: CameraVisibilityContext = {
  id: "main",
  position: { x: 0, y: 0, z: 0 },
  visibleRadius: 10,
};

function objectAt(x: number, overrides?: VisibilityObject["overrides"]): VisibilityObject {
  return {
    id: `object-${x}`,
    bounds: { center: { x, y: 0, z: 0 }, radius: 1 },
    overrides,
  };
}

describe("VisibilitySystem", () => {
  test("renders and loads objects inside an active camera", () => {
    const system = new VisibilitySystem({ hysteresis: 0 });
    expect(system.evaluate(objectAt(5), [camera], 0)).toEqual({
      render: true,
      load: true,
      unload: false,
      reason: "visible",
    });
  });

  test("preloads objects outside the view without rendering them", () => {
    const system = new VisibilitySystem({ preloadMargin: 10, hysteresis: 0 });
    expect(system.evaluate(objectAt(15), [camera], 0)).toEqual({
      render: false,
      load: true,
      unload: false,
      reason: "preload",
    });
  });

  test("keeps recently needed assets loaded during the unload grace period", () => {
    const system = new VisibilitySystem({ preloadMargin: 0, hysteresis: 0, unloadGraceMs: 100 });
    const object = objectAt(5);
    system.evaluate(object, [camera], 0);
    object.bounds.center.x = 100;

    expect(system.evaluate(object, [camera], 50).reason).toBe("grace-period");
    expect(system.evaluate(object, [camera], 101)).toMatchObject({
      render: false,
      load: false,
      unload: true,
    });
  });

  test("uses every relevant camera for visibility", () => {
    const system = new VisibilitySystem({ preloadMargin: 0, hysteresis: 0 });
    const secondCamera: CameraVisibilityContext = {
      id: "split-screen-player-two",
      position: { x: 100, y: 0, z: 0 },
      visibleRadius: 10,
    };

    expect(system.evaluate(objectAt(100), [camera, secondCamera], 0).render).toBe(true);
  });

  test("supports safe engine-level overrides", () => {
    const system = new VisibilitySystem({ preloadMargin: 0, hysteresis: 0 });

    expect(system.evaluate(objectAt(1_000, { alwaysVisible: true }), [], 0).render).toBe(true);
    expect(system.evaluate(objectAt(1_000, { cullingDisabled: true }), [], 0).render).toBe(true);
    expect(system.evaluate(objectAt(1_000, { neverUnload: true }), [camera], 0)).toMatchObject({
      load: true,
      unload: false,
    });
  });

  test("does not let non-streaming cameras retain assets", () => {
    const system = new VisibilitySystem({ preloadMargin: 100, hysteresis: 0, unloadGraceMs: 0 });
    const editorCamera: CameraVisibilityContext = {
      ...camera,
      visibleRadius: 0,
      influencesStreaming: false,
    };

    expect(system.evaluate(objectAt(50), [editorCamera], 0)).toMatchObject({
      render: false,
      load: false,
      unload: true,
    });
  });
});
