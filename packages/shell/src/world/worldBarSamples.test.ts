import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createEntityStore } from "@jgengine/core/scene/entityStore";
import { createSceneRaycast, type SceneRaycastDeps, type SceneRaycastInput } from "@jgengine/core/scene/sceneRaycast";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createPossession } from "@jgengine/core/scene/possession";
import { building, environment } from "@jgengine/core/world/features";
import { collectNameplateSamples, collectWorldBarSamples, createOverlayRangeWarn, deriveWorldBarRange, nearestOverlayTargetDistance, paintWorldBarSamples, worldBarOccluded, worldBarSize, refreshWorldBarSamples, worldBarTargetFilter, type NameplateSample, type WorldBarSample, type WorldOverlaySampleOptions } from "./worldBarSamples";

function setup(deps: SceneRaycastDeps = {}) {
  const store = createEntityStore();
  const stats = new Map<string, { current: number; max: number; min: number }>();
  const raycaster = createSceneRaycast({ ...deps, entities: store });
  const rays: SceneRaycastInput[] = [];
  let queries = 0;
  const ctx = {
    player: { userId: "player", possession: createPossession({ entities: store }) },
    scene: {
      entity: {
        get: store.get,
        list: () => { throw new Error("Overlay sampling must use the nearby spatial query"); },
        stats: { get: (id: string, stat: string) => stat === "health" ? stats.get(id) ?? null : null },
        inRadius: (origin: readonly [number, number, number], radius: number) => {
          queries++;
          return [...store.list().filter((e) => Math.hypot(...e.position.map((p, i) => p - origin[i]!)) <= radius).map((e) => e.id), "despawned"];
        },
      },
      raycast: (input: SceneRaycastInput) => { rays.push(input); return raycaster.raycast(input); },
    },
  } as unknown as GameContext;
  const spawn = (id: string, position: [number, number, number], name = "Guard", current: number | null = 5) => {
    store.spawn(name, { id, position });
    if (current !== null) stats.set(id, { current, max: 10, min: 0 });
  };
  spawn("player", [0, 0, 0], "Hero", 10);
  return { ctx, store, spawn, rays, queries: () => queries };
}

function cameraAt(position: [number, number, number] = [0, 2, 10], target: [number, number, number] = [0, 2, 0]) {
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(...position);
  camera.lookAt(...target);
  camera.updateMatrixWorld();
  return camera;
}

const viewport = { width: 800, height: 600 };
function bars(ctx: GameContext, camera = cameraAt(), occlude = true, options: WorldOverlaySampleOptions = {}, maxDistance = 60) {
  const out: WorldBarSample[] = [];
  collectWorldBarSamples(ctx, "health", 2, undefined, undefined, camera, viewport, out, new THREE.Vector3(), maxDistance, occlude, options);
  return out;
}
function plates(ctx: GameContext, camera = cameraAt(), occlude = true, options: WorldOverlaySampleOptions = {}, maxDistance = 40) {
  const out: NameplateSample[] = [];
  collectNameplateSamples(ctx, "health", 2, undefined, undefined, camera, viewport, out, new THREE.Vector3(), maxDistance, occlude, options);
  return out;
}

/** Collect with the engine-derived range, as a game that configures no `maxDistance` gets. */
function derivedBars(ctx: GameContext, camera = cameraAt(), occlude = true, options: WorldOverlaySampleOptions = {}) {
  const out: WorldBarSample[] = [];
  collectWorldBarSamples(ctx, "health", 2, undefined, undefined, camera, viewport, out, new THREE.Vector3(), undefined, occlude, options);
  return out;
}

/** A canvas stub that counts painted bar outlines, so a still-rendered bar is observable. */
function paintedBars(samples: readonly WorldBarSample[], dpr = 1): { outlines: number; fills: number } {
  const tally = { outlines: 0, fills: 0 };
  const context = {
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => { tally.fills++; },
    strokeRect: () => { tally.outlines++; },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  };
  paintWorldBarSamples({ width: 800 * dpr, height: 600 * dpr, getContext: () => context as unknown as CanvasRenderingContext2D }, samples, dpr);
  return tally;
}

/** A camera and target pair 76 units apart, like Beacon Bastion's arena under its 70-unit camera. */
function beaconCamera() {
  return cameraAt([0, 70, 30], [0, 0, 0]);
}

const wall: SceneRaycastDeps = { walls: [{ id: "wall", a: [-3, 5], b: [3, 5], yCenter: 2, halfHeight: 3 }] };
describe("world overlay visibility", () => {
  test("live generated and rotated world layers occlude both overlay kinds through GameContext", () => {
    const ctx = createGameContext({
      definition: defineGameDefinition({ name: "World overlay cover", assets: createAssetCatalog(), multiplayer: "off", persist: false,
        world: environment({ structures: building({ count: 1, position: [0, 5], footprint: { w: 4, d: 2 }, stories: [2, 2], seed: "overlay-cover" }) }),
      }),
      content: { entityById: () => ({ stats: { health: { max: 10 } } }) },
      player: { userId: "player", isNew: true },
    });
    ctx.scene.entity.spawn("Guard", { id: "enemy", position: [0, 0, 0] });
    ctx.scene.entity.stats.delta("enemy", "health", -5);
    const rays: SceneRaycastInput[] = [];
    const raycast = ctx.scene.raycast;
    ctx.scene.raycast = (input) => { rays.push(input); return raycast(input); };
    const camera = cameraAt();
    const policy = { maxSamples: 1 };
    expect(ctx.world.solids.count()).toBe(1);
    expect(bars(ctx, camera, true, policy)).toEqual([]);
    expect(plates(ctx, camera, true, policy)).toEqual([]);
    expect(rays).toHaveLength(2);
    expect(rays[0]?.origin).toEqual([0, 2, 10]);
    expect(rays[0]?.maxDistance).toBeCloseTo(9.999);
    ctx.world.solids.remove("environment:structures");
    expect(bars(ctx, camera, true, policy)[0]?.percent).toBe(0.5);
    expect(plates(ctx, camera, true, policy)[0]?.name).toBe("Guard");
    expect(rays).toHaveLength(4);
    ctx.world.solids.set("rotated-wall", [{ center: [0, 2, 5], halfExtents: [3, 2, 0.3], rotationY: Math.PI / 4 }]);
    expect(bars(ctx, camera, true, policy)).toEqual([]);
    expect(plates(ctx, camera, true, policy)).toEqual([]);
    expect(rays).toHaveLength(6);
    ctx.world.solids.remove("rotated-wall");
    expect(bars(ctx, camera, true, policy)).toHaveLength(1);
    expect(plates(ctx, camera, true, policy)).toHaveLength(1);
    expect(rays).toHaveLength(8);
  });

  test("a wall hides bars and names; explicit reveal skips rays", () => {
    const { ctx, spawn, rays } = setup(wall);
    spawn("enemy", [0, 0, 0]);
    expect(bars(ctx)).toEqual([]);
    expect(plates(ctx)).toEqual([]);
    expect(rays).toHaveLength(2);
    expect(bars(ctx, cameraAt(), false)).toHaveLength(1);
    expect(plates(ctx, cameraAt(), false)).toHaveLength(1);
    expect(rays).toHaveLength(2);
  });

  test("a clear view displays live health and statless named actors without self occlusion", () => {
    const { ctx, spawn, rays } = setup();
    spawn("enemy", [0, 0, 0], "Wolf");
    spawn("npc", [1, 0, 0], "Innkeeper", null);
    expect(bars(ctx)).toEqual([{ entityId: "enemy", x: 400, y: 300, percent: 0.5, pxPerMeter: expect.any(Number) }]);
    expect(plates(ctx).map((p) => [p.name, p.percent])).toEqual([["Wolf", 0.5], ["Innkeeper", null]]);
    expect(rays.every((r) => r.filter?.entities === false)).toBe(true);
  });

  test("third-person visibility follows camera rather than player's clear sightline", () => {
    const { ctx, spawn, rays } = setup(wall);
    spawn("enemy", [0, 0, 0]);
    expect(worldBarOccluded(ctx, [0, 2, 1], [0, 2, 0])).toBe(false);
    expect(bars(ctx, cameraAt([0, 2, 10]))).toHaveLength(0);
    expect(plates(ctx, cameraAt([0, 2, 1]))).toHaveLength(1);
    expect(rays[1]?.origin).toEqual([0, 2, 10]);
    expect(rays[1]?.maxDistance).toBeCloseTo(9.999);
  });

  test("world-space camera translation works under a transformed parent", () => {
    const { ctx, spawn, rays } = setup(wall);
    spawn("enemy", [0, 0, 0]);
    const camera = cameraAt([0, 2, 1]);
    const rig = new THREE.Group();
    rig.position.z = 9;
    rig.add(camera);
    rig.updateMatrixWorld(true);
    expect(bars(ctx, camera)).toHaveLength(0);
    expect(rays[0]?.origin).toEqual([0, 2, 10]);
  });

  test("terrain and blocking object geometry also hide overlays", () => {
    for (const deps of [
      { terrain: { sampleHeight: (_x: number, z: number) => z > 4 && z < 6 ? 4 : -10 } },
      { objects: { list: () => [{ instanceId: "building", catalogId: "building", position: [0, 2, 5] as const, rotationY: 0 }], halfExtentsOf: () => [3, 3, 1] as const } },
    ]) {
      const { ctx, spawn } = setup(deps);
      spawn("enemy", [0, 0, 0]);
      expect(bars(ctx)).toHaveLength(0);
      expect(plates(ctx)).toHaveLength(0);
    }
  });

  test("dead, hidden, renderer nonmembers, off-screen, behind-camera and distant actors never cast visibility rays", () => {
    const { ctx, store, spawn, rays } = setup();
    spawn("dead", [0, 0, 0], "Dead", 0);
    spawn("hidden", [0, 0, 0]);
    store.update("hidden", { hidden: true });
    spawn("nonmember", [0, 0, 0]);
    spawn("behind", [0, 0, 11]);
    spawn("offscreen", [50, 0, 0]);
    spawn("far", [0, 0, -100]);
    const options = { isVisible: (id: string) => id !== "nonmember" };
    expect(bars(ctx, cameraAt(), true, options)).toHaveLength(0);
    expect(plates(ctx, cameraAt(), true, options)).toHaveLength(0);
    expect(rays).toHaveLength(0);
  });

  test("distance is measured from the render camera even without a local entity", () => {
    const { ctx, store, spawn } = setup();
    store.despawn("player");
    spawn("near", [0, 0, 0]);
    expect(bars(ctx, cameraAt(), true, {}, 5)).toHaveLength(0);
    expect(plates(ctx, cameraAt(), true, {}, 15)[0]?.distance).toBeCloseTo(Math.sqrt(104));
  });

  test("internal IDs require authored names; an explicit resolver can label lowercase names", () => {
    const { ctx, spawn } = setup();
    spawn("mob-a", [0, 0, 0], "mob-a");
    spawn("catalog-wolf", [0, 0, 0], "wolf_npc_2");
    spawn("catalog-slug", [0, 0, 0], "town-guard");
    expect(plates(ctx)).toHaveLength(0);
    expect(plates(ctx, cameraAt(), true, { resolveName: (e) => e.id === "catalog-wolf" ? "wolf" : null }).map((p) => p.name)).toEqual(["wolf"]);
  });

  test("roles are filtered before raycasting", () => {
    const { ctx, spawn, rays } = setup();
    spawn("enemy", [0, 0, 0]);
    spawn("npc", [0, 0, 0]);
    const out: NameplateSample[] = [];
    collectNameplateSamples(ctx, "health", 2, ["enemy"], (e) => e.id === "enemy" ? "enemy" : "npc", cameraAt(), viewport, out, new THREE.Vector3());
    expect(out.map((p) => p.id)).toEqual(["enemy"]);
    expect(rays).toHaveLength(1);
  });

  test("retained bars track live anchors smoothly without extra queries or rays", () => {
    const { ctx, spawn, store, rays, queries } = setup();
    spawn("enemy", [0, 0, 0]);
    const samples = bars(ctx);
    store.setPose("enemy", { position: [1, 0, 0] });
    refreshWorldBarSamples(ctx, 2, cameraAt(), viewport, samples, new THREE.Vector3());
    expect(samples[0]?.x).toBeGreaterThan(400);
    expect(rays).toHaveLength(1);
    expect(queries()).toBe(1);
    store.despawn("enemy");
    refreshWorldBarSamples(ctx, 2, cameraAt(), viewport, samples, new THREE.Vector3());
    expect(samples).toHaveLength(0);
    expect(rays).toHaveLength(1);
  });

  test("large groups bound rays per refresh and never reveal unchecked entities", () => {
    const { ctx, spawn, rays, queries } = setup(wall);
    for (let i = 0; i < 500; i++) spawn(`enemy-${i}`, [0, 0, 0]);
    expect(bars(ctx)).toHaveLength(0);
    expect(rays).toHaveLength(64);
    expect(plates(ctx, cameraAt(), true, { maxSamples: 12 })).toHaveLength(0);
    expect(rays).toHaveLength(76);
    expect(queries()).toBe(2);
    expect(bars(ctx, cameraAt(), false, { maxSamples: 12 })).toHaveLength(12);
    expect(rays).toHaveLength(76);
  });
});

describe("derived overlay range", () => {
  test("a 70-unit camera still reaches the raider it looks at and paints a bar (Beacon case)", () => {
    const { ctx, spawn } = setup();
    spawn("raider", [0, 0, 0], "Raider", 4);
    const camera = beaconCamera();
    expect(bars(ctx, camera, true, {}, 60)).toHaveLength(0);
    const samples = derivedBars(ctx, camera);
    expect(samples).toHaveLength(1);
    expect(samples[0]?.percent).toBeCloseTo(0.4, 5);
    expect(paintedBars(samples).outlines).toBe(1);
  });

  test("the derived range covers the ground the camera looks down through", () => {
    const camera = beaconCamera();
    const range = deriveWorldBarRange(camera, viewport, 2);
    expect(range).toBeGreaterThan(Math.hypot(70, 30));
    expect(range).toBeLessThanOrEqual(camera.far);
    const flat = cameraAt([0, 2, 10]);
    expect(deriveWorldBarRange(flat, viewport, 2)).toBeGreaterThan(20);
  });

  test("the derived range stays inside the camera's far plane", () => {
    const camera = new THREE.PerspectiveCamera(55, 800 / 600, 0.1, 40);
    camera.position.set(0, 70, 30);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    expect(deriveWorldBarRange(camera, viewport, 2)).toBeLessThanOrEqual(40);
  });

  test("an explicit range still wins over the derived one", () => {
    const { ctx, spawn } = setup();
    spawn("raider", [0, 0, 0], "Raider", 4);
    const camera = beaconCamera();
    expect(bars(ctx, camera, true, {}, 30)).toHaveLength(0);
    expect(bars(ctx, camera, true, {}, 80)).toHaveLength(1);
  });

  test("an explicit range that excludes every on-screen target warns exactly once with the measured distance", () => {
    const { ctx, spawn } = setup();
    spawn("raider", [0, 0, 0], "Raider", 4);
    const camera = beaconCamera();
    expect(collectWorldBarSamples(ctx, "health", 2, undefined, undefined, camera, viewport, [], new THREE.Vector3(), 30)).toBe(0);
    const nearest = nearestOverlayTargetDistance(
      ctx,
      camera,
      2,
      deriveWorldBarRange(camera, viewport, 2),
      new THREE.Vector3(),
      {},
      worldBarTargetFilter(ctx, "health", undefined, undefined),
    );
    expect(nearest).toBeCloseTo(76.16, 1);
    const warn = createOverlayRangeWarn();
    const messages = [0, 1, 2].map(() => warn("worldHealthBars", 30, nearest!)).filter((message): message is string => message !== null);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("worldHealthBars.maxDistance 30");
    expect(messages[0]).toContain("76.2");
    expect(messages[0]).toContain("Raise worldHealthBars.maxDistance to about 78");
  });

  test("a hidden range over an empty view stays silent", () => {
    const { ctx } = setup();
    const nearest = nearestOverlayTargetDistance(
      ctx,
      beaconCamera(),
      2,
      deriveWorldBarRange(beaconCamera(), viewport, 2),
      new THREE.Vector3(),
      {},
      worldBarTargetFilter(ctx, "health", undefined, undefined),
    );
    expect(nearest).toBeNull();
  });

  test("retained bars drop once the target leaves the derived range", () => {
    const { ctx, spawn, store } = setup();
    spawn("raider", [0, 0, 0], "Raider", 4);
    const camera = beaconCamera();
    const samples = derivedBars(ctx, camera);
    expect(samples).toHaveLength(1);
    store.setPose("raider", { position: [0, 0, -400] });
    refreshWorldBarSamples(ctx, 2, camera, viewport, samples, new THREE.Vector3());
    expect(samples).toHaveLength(0);
  });
});

describe("world bar size", () => {
  test("a far or zoomed-out actor gets a smaller bar than a near one", () => {
    const { ctx, spawn } = setup();
    spawn("enemy", [0, 0, 0], "Wolf");
    const near = bars(ctx, cameraAt([0, 2, 6]))[0]!.pxPerMeter!;
    const far = bars(ctx, cameraAt([0, 2, 40]))[0]!.pxPerMeter!;
    expect(near).toBeGreaterThan(far * 4);
    expect(worldBarSize(near).width).toBeGreaterThan(worldBarSize(far).width);
  });

  test("spans about 1.4 m on screen, clamped between a readable minimum and the maximum", () => {
    expect(worldBarSize(40)).toEqual({ width: 56, height: 5 });
    expect(worldBarSize(2)).toEqual({ width: 28, height: 4 });
    expect(worldBarSize(500)).toEqual({ width: 112, height: 10 });
  });

  test("caller-painted samples without a scale keep the configured size", () => {
    expect(worldBarSize(undefined)).toEqual({ width: 112, height: 10 });
    expect(worldBarSize(undefined, 80, 8)).toEqual({ width: 80, height: 8 });
  });
});
