import { describe, expect, test } from "bun:test";
import type { EntityColliderSet } from "@jgengine/core/scene/colliders";
import { createSceneRaycast, firstImpact, hitsUntilBlocked } from "@jgengine/core/scene/sceneRaycast";
import { createProjectileSystem } from "@jgengine/core/combat/projectiles";
import { createEffectSystem, type CombatSpatialDeps, type ReceiveMap } from "@jgengine/core/combat/effects";
import { seedStatValues, type StatCatalog, type StatValueMap } from "@jgengine/core/scene/entityStats";
import { distanceBetween } from "@jgengine/core/scene/spatial";
import {
  anyCollisionLayerOn,
  aimProbeNeeded,
  colliderScanNeeded,
  createCollisionDebugController,
  createDefaultCollisionDebugState,
  projectileListenNeeded,
} from "./collisionDebug";
import {
  classifyAimEndpoint,
  collectDebugShapes,
  computeAimLaser,
  muzzleMarkerFromOrigin,
  shapeWorldCenter,
} from "./collisionDebugMath";
import { resolveColliders } from "@jgengine/core/scene/colliders";

describe("collision debug toggles (#432)", () => {
  test("defaults all layers off — inactive, no scan/aim/listen", () => {
    const ctrl = createCollisionDebugController();
    const layers = ctrl.getState().layers;
    expect(anyCollisionLayerOn(layers)).toBe(false);
    expect(ctrl.isActive()).toBe(false);
    expect(colliderScanNeeded(layers)).toBe(false);
    expect(aimProbeNeeded(layers)).toBe(false);
    expect(projectileListenNeeded(layers)).toBe(false);
  });

  test("independent layer toggles", () => {
    const ctrl = createCollisionDebugController();
    ctrl.setLayer("hitboxes", true);
    expect(ctrl.getState().layers.hitboxes).toBe(true);
    expect(ctrl.getState().layers.bodies).toBe(false);
    expect(colliderScanNeeded(ctrl.getState().layers)).toBe(true);
    expect(aimProbeNeeded(ctrl.getState().layers)).toBe(false);

    ctrl.setLayer("aimLaser", true);
    expect(aimProbeNeeded(ctrl.getState().layers)).toBe(true);

    ctrl.toggleLayer("hitboxes");
    expect(ctrl.getState().layers.hitboxes).toBe(false);
    expect(colliderScanNeeded(ctrl.getState().layers)).toBe(false);
  });

  test("setAllLayers and reset restore zero work", () => {
    const ctrl = createCollisionDebugController();
    ctrl.setAllLayers(true);
    expect(ctrl.isActive()).toBe(true);
    ctrl.reset();
    expect(ctrl.getState()).toEqual(createDefaultCollisionDebugState());
    expect(ctrl.isActive()).toBe(false);
  });

  test("subscribe fires on layer change, not on silent aim probe", () => {
    const ctrl = createCollisionDebugController();
    let n = 0;
    ctrl.subscribe(() => {
      n += 1;
    });
    ctrl.setAimProbe({ from: "hero", aim: { yaw: 0, pitch: 0 } });
    expect(n).toBe(0);
    ctrl.setLayer("bodies", true);
    expect(n).toBe(1);
  });

  test("projectile traces ignored when projectile/muzzle layers off", () => {
    const ctrl = createCollisionDebugController();
    ctrl.pushProjectileTrace({ origin: [0, 0, 0], at: [0, 0, 5], hit: true, nowMs: 0 });
    expect(ctrl.getState().projectileTraces).toHaveLength(0);
    ctrl.setLayer("projectiles", true);
    ctrl.pushProjectileTrace({ origin: [0, 1, 0], at: [0, 1, 8], hit: false, nowMs: 10 });
    expect(ctrl.getState().projectileTraces).toHaveLength(1);
    expect(ctrl.getState().projectileTraces[0]!.at[2]).toBe(8);
  });

  test("prune drops expired traces", () => {
    const ctrl = createCollisionDebugController();
    ctrl.setLayer("muzzles", true);
    ctrl.pushProjectileTrace({ origin: [0, 0, 0], at: [1, 0, 0], hit: true, nowMs: 0 });
    ctrl.pruneProjectileTraces(10_000);
    expect(ctrl.getState().projectileTraces).toHaveLength(0);
  });
});

describe("collider debug shapes (#432)", () => {
  test("hidden state performs zero scans", () => {
    const counters = { scans: 0, shapes: 0 };
    const shapes = collectDebugShapes({
      layers: createDefaultCollisionDebugState().layers,
      entities: [{ id: "a", position: [0, 0, 0], rotationY: 0 }],
      counters,
    });
    expect(shapes).toEqual([]);
    expect(counters.scans).toBe(0);
    expect(counters.shapes).toBe(0);
  });

  test("renders every declared shape including multiple named hitboxes", () => {
    const colliders: EntityColliderSet = {
      body: {
        name: "hull",
        purpose: "physical",
        shape: { kind: "aabb", halfExtents: [0.5, 1, 0.4] },
      },
      hitboxes: [
        { name: "torso", purpose: "damage", shape: { kind: "sphere", radius: 0.4 } },
        {
          name: "head",
          purpose: "damage",
          shape: { kind: "sphere", radius: 0.2, offset: [0, 1.6, 0] },
        },
      ],
    };
    const layers = { ...createDefaultCollisionDebugState().layers, hitboxes: true, bodies: true };
    const shapes = collectDebugShapes({
      layers,
      entities: [{ id: "soldier", position: [1, 0, 2], rotationY: 0, name: "soldier" }],
      entityCollidersOf: () => colliders,
    });
    expect(shapes.map((s) => s.name).sort()).toEqual(["head", "hull", "torso"]);
    expect(shapes.filter((s) => s.style === "hitbox")).toHaveLength(2);
    expect(shapes.filter((s) => s.style === "body")).toHaveLength(1);
    expect(shapes.every((s) => s.label.includes(":"))).toBe(true);
  });

  test("independent layer filters purpose", () => {
    const colliders: EntityColliderSet = {
      body: {
        name: "hull",
        purpose: "physical",
        shape: { kind: "aabb", halfExtents: [1, 1, 1] },
      },
      hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 0.5 } }],
    };
    const hitOnly = collectDebugShapes({
      layers: { ...createDefaultCollisionDebugState().layers, hitboxes: true },
      entities: [{ id: "e", position: [0, 0, 0], rotationY: 0 }],
      entityCollidersOf: () => colliders,
    });
    expect(hitOnly.map((s) => s.name)).toEqual(["body"]);

    const bodyOnly = collectDebugShapes({
      layers: { ...createDefaultCollisionDebugState().layers, bodies: true },
      entities: [{ id: "e", position: [0, 0, 0], rotationY: 0 }],
      entityCollidersOf: () => colliders,
    });
    expect(bodyOnly.map((s) => s.name)).toEqual(["hull"]);
  });

  test("transform matching: rotated offset centers", () => {
    const colliders: EntityColliderSet = {
      hitboxes: [
        {
          name: "head",
          purpose: "damage",
          shape: { kind: "sphere", radius: 0.2, offset: [0, 1.5, 0.3] },
        },
      ],
    };
    const rotationY = Math.PI / 2;
    const position: [number, number, number] = [10, 0, 20];
    const layers = { ...createDefaultCollisionDebugState().layers, hitboxes: true };
    const shapes = collectDebugShapes({
      layers,
      entities: [{ id: "e", position, rotationY }],
      entityCollidersOf: () => colliders,
    });
    const resolved = resolveColliders(colliders)[0]!;
    const expected = shapeWorldCenter(resolved, position, rotationY);
    expect(shapes[0]!.shape.center[0]).toBeCloseTo(expected[0], 5);
    expect(shapes[0]!.shape.center[1]).toBeCloseTo(expected[1], 5);
    expect(shapes[0]!.shape.center[2]).toBeCloseTo(expected[2], 5);
    expect(shapes[0]!.shape.center[1]).toBeCloseTo(1.5, 5);
  });

  test("lifecycle: spawn and despawn change shape set", () => {
    const layers = { ...createDefaultCollisionDebugState().layers, hitboxes: true };
    const entities = [
      { id: "a", position: [0, 0, 0] as [number, number, number], rotationY: 0 },
      { id: "b", position: [2, 0, 0] as [number, number, number], rotationY: 0 },
    ];
    expect(collectDebugShapes({ layers, entities }).map((s) => s.instanceId).sort()).toEqual(["a", "b"]);
    expect(collectDebugShapes({ layers, entities: entities.slice(0, 1) }).map((s) => s.instanceId)).toEqual([
      "a",
    ]);
  });

  test("muzzle marker is exact small red circle at world origin", () => {
    const mark = muzzleMarkerFromOrigin([3, 1.4, 5]);
    expect(mark.center).toEqual([3, 1.4, 5]);
    expect(mark.radius).toBeLessThan(0.15);
    expect(mark.color).toBe("#ef4444");
  });
});

describe("aim laser debugger (#433)", () => {
  function setupScene(colliders: Record<string, EntityColliderSet>, positions: Record<string, [number, number, number]>) {
    return createSceneRaycast({
      entities: {
        list: () =>
          Object.entries(positions).map(([id, position]) => ({ id, position, rotationY: 0 })),
        collidersOf: (id) => colliders[id],
        get: (id) => {
          const position = positions[id];
          if (position === undefined) return null;
          return { id, position, rotationY: 0 };
        },
      },
    });
  }

  test("zero aim-probe work when hidden", () => {
    const api = setupScene({}, { hero: [0, 0, 0] });
    const counters = { queries: 0 };
    const result = computeAimLaser({
      layers: createDefaultCollisionDebugState().layers,
      sceneRaycast: api,
      positionOf: () => [0, 0, 0],
      from: "hero",
      aim: { origin: [0, 1, 0], direction: [0, 0, 1] },
      maxDistance: 50,
      counters,
    });
    expect(result).toBeNull();
    expect(counters.queries).toBe(0);
  });

  test("enemy-before-wall: damage endpoint (X)", () => {
    const api = setupScene(
      {
        enemy: {
          hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 0.5 } }],
        },
        wall: {
          body: {
            name: "wall",
            purpose: "physical",
            shape: { kind: "aabb", halfExtents: [2, 2, 0.2] },
          },
        },
      },
      { enemy: [0, 0, 5], wall: [0, 0, 12] },
    );
    const laser = computeAimLaser({
      layers: { ...createDefaultCollisionDebugState().layers, aimLaser: true },
      sceneRaycast: api,
      positionOf: (id) => (id === "hero" ? [0, 0, 0] : undefined),
      from: "hero",
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      originPolicy: { kind: "legacy" },
      maxDistance: 40,
    });
    expect(laser).not.toBeNull();
    expect(laser!.kind).toBe("damage");
    expect(laser!.nearest?.instanceId).toBe("enemy");
    expect(classifyAimEndpoint(laser!.nearest)).toBe("damage");
    expect(laser!.end[2]).toBeCloseTo(laser!.nearest!.point[2], 5);
  });

  test("wall-before-enemy: solid circle endpoint", () => {
    const api = setupScene(
      {
        wall: {
          body: {
            name: "wall",
            purpose: "physical",
            shape: { kind: "aabb", halfExtents: [2, 2, 0.2] },
          },
        },
        enemy: {
          hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 0.5 } }],
        },
      },
      { wall: [0, 0, 4], enemy: [0, 0, 10] },
    );
    const laser = computeAimLaser({
      layers: { ...createDefaultCollisionDebugState().layers, aimLaser: true },
      sceneRaycast: api,
      positionOf: () => [0, 0, 0],
      from: "hero",
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      maxDistance: 40,
    });
    expect(laser!.kind).toBe("solid");
    expect(laser!.nearest?.instanceId).toBe("wall");
    expect(laser!.nearest?.damageEligible).toBe(false);
  });

  test("multiple hitboxes: nearest named box wins", () => {
    const api = setupScene(
      {
        soldier: {
          hitboxes: [
            { name: "torso", purpose: "damage", shape: { kind: "sphere", radius: 0.4 } },
            {
              name: "head",
              purpose: "damage",
              shape: { kind: "sphere", radius: 0.25, offset: [0, 1.5, 0] },
            },
          ],
        },
      },
      { soldier: [0, 0, 8] },
    );
    const head = computeAimLaser({
      layers: { ...createDefaultCollisionDebugState().layers, aimLaser: true },
      sceneRaycast: api,
      positionOf: () => [0, 0, 0],
      from: "hero",
      aim: { origin: [0, 1.5, 0], direction: [0, 0, 1] },
      maxDistance: 40,
    });
    expect(head!.nearest?.colliderName).toBe("head");
    expect(head!.kind).toBe("damage");
  });

  test("moving target updates first collision", () => {
    const positions: Record<string, [number, number, number]> = { enemy: [0, 0, 6] };
    const api = createSceneRaycast({
      entities: {
        list: () => [{ id: "enemy", position: positions.enemy!, rotationY: 0 }],
        collidersOf: () => ({
          hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 0.5 } }],
        }),
      },
    });
    const layers = { ...createDefaultCollisionDebugState().layers, aimLaser: true };
    const first = computeAimLaser({
      layers,
      sceneRaycast: api,
      positionOf: () => [0, 0, 0],
      from: "hero",
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      maxDistance: 40,
    });
    positions.enemy = [0, 0, 12];
    const second = computeAimLaser({
      layers,
      sceneRaycast: api,
      positionOf: () => [0, 0, 0],
      from: "hero",
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      maxDistance: 40,
    });
    expect(first!.end[2]).toBeLessThan(second!.end[2]);
  });

  test("miss and maximum range end at maxDistance", () => {
    const api = setupScene({}, {});
    const laser = computeAimLaser({
      layers: { ...createDefaultCollisionDebugState().layers, aimLaser: true },
      sceneRaycast: api,
      positionOf: () => [0, 0, 0],
      from: "hero",
      aim: { origin: [0, 1, 0], direction: [0, 0, 1] },
      maxDistance: 25,
    });
    expect(laser!.kind).toBe("miss");
    expect(laser!.nearest).toBeNull();
    expect(laser!.end[2]).toBeCloseTo(25, 5);
    expect(classifyAimEndpoint(null)).toBe("miss");
  });

  test("prediction parity: firstImpact matches projectile willHitProjectile", () => {
    const entities: Record<
      string,
      { stats: StatCatalog; receive: ReceiveMap; position: [number, number, number] }
    > = {
      enemy: {
        stats: { health: { max: 100 } },
        receive: { damage: { order: ["health"] } },
        position: [0, 0, 10],
      },
    };
    const stats: Record<string, StatValueMap> = {};
    for (const [id, entity] of Object.entries(entities)) {
      stats[id] = seedStatValues(entity.stats);
    }
    const spatial: CombatSpatialDeps = {
      inRadius: (center, radius) =>
        Object.keys(entities).filter((id) => distanceBetween(center, entities[id]!.position) <= radius),
      hasLineOfSight: () => true,
      positionOf: (id) => (id === "hero" ? [0, 0, 0] : entities[id]?.position),
    };
    const effects = createEffectSystem({
      resolveReceive: (id) => entities[id]?.receive,
      resolveStats: (id) => stats[id],
      getStat: (itemId, stat) => (itemId === "pistol" && stat === "range" ? 50 : itemId === "pistol" && stat === "damage" ? 10 : null),
      spatial,
    });
    const colliders: Record<string, EntityColliderSet> = {
      enemy: {
        hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 0.5 } }],
      },
    };
    const sceneRaycast = createSceneRaycast({
      entities: {
        list: () => [
          { id: "hero", position: [0, 0, 0], rotationY: 0 },
          { id: "enemy", position: entities.enemy!.position, rotationY: 0 },
        ],
        collidersOf: (id) => colliders[id],
        get: (id) => {
          if (id === "hero") return { id, position: [0, 0, 0], rotationY: 0 };
          if (id === "enemy") return { id, position: entities.enemy!.position, rotationY: 0 };
          return null;
        },
      },
    });
    const projectiles = createProjectileSystem({
      effects,
      spatial,
      getStat: (itemId, stat) =>
        itemId === "pistol" && stat === "range" ? 50 : itemId === "pistol" && stat === "damage" ? 10 : null,
      sceneRaycast,
      entityCollidersOf: (id) => colliders[id],
    });
    const aim = { origin: [0, 0, 0] as [number, number, number], direction: [0, 0, 1] as [number, number, number] };
    const prediction = projectiles.willHitProjectile({
      from: "hero",
      via: { item: "pistol" },
      aim,
      effect: "damage",
    });
    const laser = computeAimLaser({
      layers: { ...createDefaultCollisionDebugState().layers, aimLaser: true },
      sceneRaycast,
      positionOf: spatial.positionOf,
      from: "hero",
      aim,
      maxDistance: 50,
    });
    expect(prediction.firstImpact?.instanceId).toBe("enemy");
    expect(laser!.firstImpact?.instanceId).toBe(prediction.firstImpact?.instanceId);
    expect(laser!.firstImpact?.colliderName).toBe(prediction.firstImpact?.colliderName ?? "body");
    const all = sceneRaycast.raycastAll({
      origin: aim.origin,
      direction: aim.direction,
      maxDistance: 50,
      excludeInstanceIds: ["hero"],
    });
    expect(firstImpact(hitsUntilBlocked(all))?.instanceId).toBe(laser!.firstImpact?.instanceId);
  });

  test("laser draws only to first collision, not through", () => {
    const api = setupScene(
      {
        near: {
          body: {
            name: "crate",
            purpose: "physical",
            shape: { kind: "aabb", halfExtents: [0.5, 0.5, 0.5] },
          },
        },
        far: {
          hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 0.5 } }],
        },
      },
      { near: [0, 0, 3], far: [0, 0, 15] },
    );
    const laser = computeAimLaser({
      layers: { ...createDefaultCollisionDebugState().layers, aimLaser: true },
      sceneRaycast: api,
      positionOf: () => [0, 0, 0],
      from: "hero",
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      maxDistance: 100,
    });
    expect(laser!.end[2]).toBeLessThan(5);
    expect(laser!.nearest?.instanceId).toBe("near");
  });

  test("muzzle origin policy resolves shot origin for laser", () => {
    const api = setupScene({}, {});
    const laser = computeAimLaser({
      layers: { ...createDefaultCollisionDebugState().layers, aimLaser: true },
      sceneRaycast: api,
      positionOf: (id) => (id === "hero" ? [2, 0, 4] : undefined),
      rotationYOf: () => 0,
      from: "hero",
      aim: { yaw: 0, pitch: 0 },
      originPolicy: { kind: "muzzle" },
      maxDistance: 10,
    });
    expect(laser!.origin[1]).toBeCloseTo(1.4);
    expect(laser!.origin[0]).toBeCloseTo(2);
    expect(laser!.origin[2]).toBeCloseTo(4 + 0.35);
  });
});
