import { describe, expect, test } from "bun:test";
import type { CameraVisibilityContext } from "@jgengine/core/visibility/camera";
import type { Renderable } from "@jgengine/core/visibility/visibilitySystem";
import { devtools } from "@jgengine/core/devtools/devtools";
import { createSpatialIndex } from "@jgengine/core/spatial/spatialIndex";
import { createVisibilitySystem } from "./visibilitySystem";

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
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    const result = sys.update();
    expect(result.visible.has("front")).toBe(true);
    expect(result.visible.has("behind")).toBe(false);
    expect(result.stats.totalObjects).toBe(2);
  });

  test("a normal object with only position + version is culled automatically (no cullable component)", () => {
    const objects: Renderable[] = [{ id: "plain", position: [500, 0, 20], version: 1 }];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("plain")).toBe(false);
  });

  test("a moving object re-enters view after crossing the frustum", () => {
    const obj = { id: "mover", position: [500, 0, 20] as [number, number, number], version: 1 };
    const objects: Renderable[] = [obj];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("mover")).toBe(false);
    obj.position = [0, 0, 20];
    obj.version = 2;
    expect(sys.update().visible.has("mover")).toBe(true);
  });

  test("the generation moves only on a frame the visible set changed", () => {
    const obj = { id: "mover", position: [500, 0, 20] as [number, number, number], version: 1 };
    const objects: Renderable[] = [ahead("front", 20), obj];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    const first = sys.update().generation;
    expect(sys.update().generation).toBe(first);
    obj.position = [0, 0, 30];
    obj.version = 2;
    const entered = sys.update().generation;
    expect(entered).not.toBe(first);
    obj.position = [0, 0, 31];
    obj.version = 3;
    expect(sys.update().generation).toBe(entered);
    objects.pop();
    expect(sys.update().generation).not.toBe(entered);
  });

  test("a still object is placed in the spatial index once, and again only when its version changes", () => {
    const index = createSpatialIndex();
    const inserted: string[] = [];
    const insert = index.insert.bind(index);
    index.insert = (id, bounds, dynamic) => {
      inserted.push(id);
      insert(id, bounds, dynamic);
    };
    const mover = { id: "mover", position: [500, 0, 20] as [number, number, number], version: 1 };
    const objects: Renderable[] = [ahead("still", 20), mover];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()], index });
    for (let frame = 0; frame < 3; frame += 1) sys.update();
    expect(inserted).toEqual(["still", "mover"]);
    mover.position = [0, 0, 20];
    mover.version = 2;
    const result = sys.update();
    expect(inserted).toEqual(["still", "mover", "mover"]);
    expect(result.visible.has("mover")).toBe(true);
    expect(result.visible.has("still")).toBe(true);
  });

  test("always-visible objects bypass culling", () => {
    const objects: Renderable[] = [ahead("hud", -20, { alwaysVisible: true })];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("hud")).toBe(true);
  });

  test("per-object cullingDisabled override keeps an out-of-view object", () => {
    const objects: Renderable[] = [ahead("keep", -20, { overrides: { cullingDisabled: true } })];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("keep")).toBe(true);
  });

  test("maxRenderDistance override culls a distant but in-frustum object", () => {
    const objects: Renderable[] = [ahead("far", 150, { overrides: { maxRenderDistance: 50 } })];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
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
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [behind, front] });
    // The object is in front of the main camera even though the rear camera cannot see it.
    expect(sys.update().visible.has("side")).toBe(true);
  });

  test("custom visibility callback overrides the pipeline", () => {
    const objects: Renderable[] = [ahead("scripted", 20, { overrides: { customVisibility: () => false } })];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("scripted")).toBe(false);
  });

  test("disabling culling globally renders everything", () => {
    const objects: Renderable[] = [ahead("behind", -20)];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()], settings: { enabled: false } });
    expect(sys.update().visible.has("behind")).toBe(true);
  });

  test("preload region extends beyond the visible frustum", () => {
    // Just outside the frustum edge but within the preload margin.
    const objects: Renderable[] = [{ id: "edge", position: [18, 0, 20], version: 1 }];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()], settings: { preloadMargin: 40 } });
    const result = sys.update();
    expect(result.visible.has("edge")).toBe(false);
    expect(result.preload.has("edge")).toBe(true);
  });

  test("required assets come from the preload set", () => {
    const objects: Renderable[] = [ahead("tree", 20, { assets: ["tree.glb"] })];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    sys.update();
    expect(sys.requiredAssets().has("tree.glb")).toBe(true);
  });

  test("the culling system reports its own probe without any shell wiring", () => {
    const objects: Renderable[] = [ahead("front", 20), ahead("behind", -20)];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    sys.update();
    const reading = devtools.probes.systems()["render/culling"]!;
    expect(reading.counters).toMatchObject({ totalObjects: 2, visible: 1, culled: 1 });
    expect(reading.timers.cullingMs).toBeGreaterThanOrEqual(0);
    expect(reading.state).toBe("1/2 visible · 1 culled · " + reading.timers.cullingMs + "ms");
    sys.clear();
    expect(devtools.probes.systems()["render/culling"]).toBeUndefined();
  });

  test("removed objects drop out of the index and bounds", () => {
    let objects: Renderable[] = [ahead("a", 20), ahead("b", 20)];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    sys.update();
    expect(sys.index().size()).toBe(2);
    objects = [ahead("a", 20)];
    sys.update();
    expect(sys.index().size()).toBe(1);
    expect(sys.boundsOf("b")).toBeUndefined();
  });

  test("repeated removal clears live state and reused ids receive fresh policy", () => {
    let objects: Renderable[] = [];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    for (let wave = 0; wave < 100; wave += 1) {
      const id = `wave-${wave}`;
      objects = [ahead(id, 20, { assets: [`${id}.glb`] })];
      expect(sys.update().visible.has(id)).toBe(true);
      expect(sys.stats().consideredForRender).toBe(1);
      objects = [];
      sys.update();
      expect(sys.index().size()).toBe(0);
      expect(sys.boundsOf(id)).toBeUndefined();
      expect(sys.isVisible(id)).toBe(false);
      expect(sys.isPreloaded(id)).toBe(false);
      expect(sys.requiredAssets().size).toBe(0);
      objects = [ahead(id, 20, { overrides: { customVisibility: () => false } })];
      expect(sys.update().visible.has(id)).toBe(false);
      expect(sys.stats().consideredForRender).toBe(1);
      objects = [];
      sys.update();
    }
  });

  test("debug snapshot reports frustum corners, partitions, and culled ids", () => {
    const objects: Renderable[] = [ahead("front", 20), ahead("behind", -20)];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [mainCamera()] });
    sys.update();
    const snap = sys.debugSnapshot();
    expect(snap.cameras).toHaveLength(1);
    expect(snap.cameras[0]!.corners).toHaveLength(24);
    expect(snap.culled).toContain("behind");
    expect(snap.partitions.length).toBeGreaterThan(0);
  });
});

describe("visibilitySystem skips unchanged inputs", () => {
  function scattered(count: number): Renderable[] {
    const objects: Renderable[] = [];
    let seed = 7;
    const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let index = 0; index < count; index += 1) {
      objects.push({ id: `o${index}`, position: [next() * 200 - 100, 0, next() * 200 - 100], version: 1 });
    }
    return objects;
  }

  test("a source whose revision holds is not walked again", () => {
    const objects = scattered(20);
    let walks = 0;
    let revision = 0;
    const sys = createVisibilitySystem({
      sources: [{ renderables: () => { walks += 1; return objects; }, revision: () => revision }],
      cameras: () => [mainCamera()],
    });
    sys.update();
    sys.update();
    sys.update();
    expect(walks).toBe(1);
    revision += 1;
    sys.update();
    expect(walks).toBe(2);
  });

  test("skipping gives the same sets, stats and generation as evaluating every update, through hysteresis", () => {
    const objects = scattered(400);
    const view = { position: [0, 0, 0] as [number, number, number], target: [0, 0, 1] as [number, number, number] };
    const camera = (): CameraVisibilityContext => ({ id: "main", view: { kind: "perspective", position: view.position, target: view.target, fovDeg: 60, aspect: 1, near: 0.1, far: 120 } });
    const skipping = createVisibilitySystem({ sources: [{ renderables: () => objects, revision: () => 0 }], cameras: () => [camera()] });
    const full = createVisibilitySystem({ sources: [{ renderables: () => objects }], cameras: () => [camera()] });
    // Turn, hold still for a few frames (the skip), turn back past objects that sit in the hysteresis band.
    const yaws = [0, 0, 0, 0.3, 0.3, 0.3, 0.31, 0.31, 0, 0, 1.2, 1.2, 1.2, 0.9, 0.9];
    for (const yaw of yaws) {
      view.target = [Math.sin(yaw), 0, Math.cos(yaw)];
      const a = skipping.update();
      const b = full.update();
      expect([...a.visible].sort()).toEqual([...b.visible].sort());
      expect([...a.preload].sort()).toEqual([...b.preload].sort());
      expect(a.generation).toBe(b.generation);
      expect(a.stats.visible).toBe(b.stats.visible);
      expect(a.stats.totalObjects).toBe(b.stats.totalObjects);
    }
  });

  test("custom visibility and changed settings still evaluate with unchanged sources", () => {
    let answer = true;
    const objects: Renderable[] = [ahead("scripted", 20, { overrides: { customVisibility: () => answer } }), ahead("plain", 30)];
    const sys = createVisibilitySystem({ sources: [{ renderables: () => objects, revision: () => 0 }], cameras: () => [mainCamera()] });
    expect(sys.update().visible.has("scripted")).toBe(true);
    answer = false;
    expect(sys.update().visible.has("scripted")).toBe(false);
    expect(sys.update().visible.has("plain")).toBe(true);
    sys.setSettings({ defaultMaxRenderDistance: 10 });
    expect(sys.update().visible.has("plain")).toBe(false);
  });
});

describe("visibilitySystem changed ids", () => {
  test("each update lists exactly the ids that entered or left the visible set", () => {
    const objects: Renderable[] = [];
    for (let i = 0; i < 900; i += 1) objects.push({ id: `p${i}`, position: [((i % 30) - 15) * 4, 0, (Math.floor(i / 30) - 15) * 4], version: 1 });
    const view = { position: [0, 2, 0] as [number, number, number], target: [0, 2, 1] as [number, number, number] };
    const sys = createVisibilitySystem({
      sources: [{ renderables: () => objects, revision: () => 0 }],
      cameras: () => [{ id: "main", view: { kind: "perspective", position: view.position, target: view.target, fovDeg: 70, aspect: 16 / 9, near: 0.1, far: 50 } }],
    });
    let before = new Set<string>();
    let flips = 0;
    for (let frame = 0; frame < 160; frame += 1) {
      // Walk and turn, with held frames, so updates both skip and re-evaluate.
      if (frame % 5 !== 0) {
        view.position = [Math.sin(frame * 0.05) * 20, 2, frame * 0.3 - 24];
        view.target = [view.position[0] + Math.sin(frame * 0.07), 2, view.position[2] + Math.cos(frame * 0.07)];
      }
      const result = sys.update();
      const now = new Set(result.visible);
      const expected = [...now].filter((id) => !before.has(id)).concat([...before].filter((id) => !now.has(id))).sort();
      expect([...result.changed].sort()).toEqual(expected);
      flips += expected.length;
      before = now;
    }
    expect(flips).toBeGreaterThan(100);
  });
});
