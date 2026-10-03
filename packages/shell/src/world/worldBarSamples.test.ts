import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createEntityStore } from "@jgengine/core/scene/entityStore";
import { createSceneRaycast, type SceneRaycastDeps, type SceneRaycastInput } from "@jgengine/core/scene/sceneRaycast";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { collectNameplateSamples, collectWorldBarSamples, worldBarOccluded, refreshWorldBarSamples, type NameplateSample, type WorldBarSample, type WorldOverlaySampleOptions } from "./worldBarSamples";

function setup(deps: SceneRaycastDeps = {}) {
  const store = createEntityStore();
  const stats = new Map<string, { current: number; max: number; min: number }>();
  const raycaster = createSceneRaycast({ ...deps, entities: store });
  const rays: SceneRaycastInput[] = [];
  let queries = 0;
  const ctx = {
    player: { userId: "player" },
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

const wall: SceneRaycastDeps = { walls: [{ id: "wall", a: [-3, 5], b: [3, 5], yCenter: 2, halfHeight: 3 }] };
describe("world overlay visibility", () => {
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
    expect(bars(ctx)).toEqual([{ entityId: "enemy", x: 400, y: 300, percent: 0.5 }]);
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
