import { describe, expect, test } from "bun:test";
import type { CameraVisibilityContext } from "@jgengine/core/visibility/camera";
import type { Renderable } from "@jgengine/core/visibility/visibilitySystem";
import { createVisibilitySystem } from "@jgengine/core/visibility/visibilitySystem";

function mainCamera(): CameraVisibilityContext {
  return {
    id: "main",
    view: { kind: "perspective", position: [0, 0, 0], target: [0, 0, 1], fovDeg: 60, aspect: 1, near: 0.1, far: 200 },
  };
}

function ahead(id: string, z: number, overrides?: Partial<Renderable>): Renderable {
  return { id, position: [0, 0, z], version: 1, ...overrides };
}

describe("visibilitySystem", () => {
  test("keeps objects in view and culls objects behind the camera", () => {
    const objects: Renderable[] = [ahead("front", 20), ahead("behind", -20)];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    const result = sys.update();
    expect(result.visible.has("front")).toBe(true);
    expect(result.visible.has("behind")).toBe(false);
    expect(result.stats.totalObjects).toBe(2);
  });

  test("a normal object with only position + version is culled automatically (no cullable component)", () => {
    const objects: Renderable[] = [{ id: "plain", position: [500, 0, 20], version: 1 }];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("plain")).toBe(false);
  });

  test("a moving object re-enters view after crossing the frustum", () => {
    const obj = { id: "mover", position: [500, 0, 20] as [number, number, number], version: 1 };
    const objects: Renderable[] = [obj];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("mover")).toBe(false);
    obj.position = [0, 0, 20];
    obj.version = 2;
    expect(sys.update().visible.has("mover")).toBe(true);
  });

  test("always-visible objects bypass culling", () => {
    const objects: Renderable[] = [ahead("hud", -20, { alwaysVisible: true })];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("hud")).toBe(true);
  });

  test("per-object cullingDisabled override keeps an out-of-view object", () => {
    const objects: Renderable[] = [ahead("keep", -20, { overrides: { cullingDisabled: true } })];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("keep")).toBe(true);
  });

  test("maxRenderDistance override culls a distant but in-frustum object", () => {
    const objects: Renderable[] = [ahead("far", 150, { overrides: { maxRenderDistance: 50 } })];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    const result = sys.update();
    expect(result.visible.has("far")).toBe(false);
    expect(result.stats.rejectedByDistance).toBe(1);
  });

  test("an object visible to any of several cameras is visible", () => {
    const objects: Renderable[] = [ahead("side", 20)];
    const front = mainCamera();
    const behind: CameraVisibilityContext = {
      id: "rear",
      view: { kind: "perspective", position: [0, 0, 40], target: [0, 0, 41], fovDeg: 60, aspect: 1, near: 0.1, far: 200 },
    };
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [behind, front] });
    // The object is in front of the main camera even though the rear camera cannot see it.
    expect(sys.update().visible.has("side")).toBe(true);
  });

  test("custom visibility callback overrides the pipeline", () => {
    const objects: Renderable[] = [ahead("scripted", 20, { overrides: { customVisibility: () => false } })];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("scripted")).toBe(false);
  });

  test("disabling culling globally renders everything", () => {
    const objects: Renderable[] = [ahead("behind", -20)];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()], settings: { enabled: false } });
    expect(sys.update().visible.has("behind")).toBe(true);
  });

  test("preload region extends beyond the visible frustum", () => {
    // Just outside the frustum edge but within the preload margin.
    const objects: Renderable[] = [{ id: "edge", position: [18, 0, 20], version: 1 }];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()], settings: { preloadMargin: 40 } });
    const result = sys.update();
    expect(result.visible.has("edge")).toBe(false);
    expect(result.preload.has("edge")).toBe(true);
  });

  test("required assets come from the preload set", () => {
    const objects: Renderable[] = [ahead("tree", 20, { assets: ["tree.glb"] })];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    sys.update();
    expect(sys.requiredAssets().has("tree.glb")).toBe(true);
  });

  test("removed objects drop out of the index and bounds", () => {
    let objects: Renderable[] = [ahead("a", 20), ahead("b", 20)];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    sys.update();
    expect(sys.index().size()).toBe(2);
    objects = [ahead("a", 20)];
    sys.update();
    expect(sys.index().size()).toBe(1);
    expect(sys.boundsOf("b")).toBeUndefined();
  });

  test("debug snapshot reports frustum corners, partitions, and culled ids", () => {
    const objects: Renderable[] = [ahead("front", 20), ahead("behind", -20)];
    const sys = createVisibilitySystem({ renderables: () => objects, cameras: () => [mainCamera()] });
    sys.update();
    const snap = sys.debugSnapshot();
    expect(snap.cameras).toHaveLength(1);
    expect(snap.cameras[0]!.corners).toHaveLength(24);
    expect(snap.culled).toContain("behind");
    expect(snap.partitions.length).toBeGreaterThan(0);
  });
});
