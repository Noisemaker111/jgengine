import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { resolvePlayerMovementTuning, stepPlayerMovement } from "../movement/playerMovement";
import { obstacleFromSolid, resolveWalkerStep, solidObstaclesNear } from "../movement/solidObstacles";
import { createNavGrid } from "../nav/navGrid";
import { populateNavGridFromSolids } from "../nav/navFromEnvironment";
import { createPhysicsWorldBackend } from "../physics/physicsWorldBackend";
import { syncWorldColliders } from "../physics/worldColliders";
import { createGameContext, type GameContext } from "../runtime/gameContext";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createSceneRaycast } from "../scene/sceneRaycast";
import { createPerception } from "../sensor/perception";
import { resolveAuthoredSolids, syncAuthoredSolids } from "./authoredSolids";
import { resolveStructureBuildings } from "./environmentSummary";
import { building, environment, type BuildingEnvironmentConfig } from "./features";
import { wallSegments } from "./walls";
import {
  buildingSolids,
  createWorldSolids,
  structureSolids,
  wallSolids,
  worldSolidBounds,
  type WorldSolid,
} from "./worldSolids";

const BOX: WorldSolid = { center: [0, 1, 0], halfExtents: [2, 1, 1] };

describe("createWorldSolids", () => {
  test("finds solids by world AABB overlap, not by center", () => {
    const solids = createWorldSolids({ cellSize: 4 });
    solids.set("a", [{ center: [20, 1, 0], halfExtents: [10, 1, 1] }]);
    expect(solids.inBox([11, 0, -1], [12, 2, 1])).toHaveLength(1);
    expect(solids.inBox([31, 0, -1], [32, 2, 1])).toHaveLength(0);
    expect(solids.inBox([15, 3, -1], [16, 4, 1])).toHaveLength(0);
  });

  test("a solid spanning many cells is returned once, and oversized solids are still found", () => {
    const solids = createWorldSolids({ cellSize: 1 });
    solids.set("a", [{ center: [0, 0, 0], halfExtents: [3, 1, 3] }]);
    solids.set("b", [{ center: [0, 0, 500], halfExtents: [400, 1, 400] }]);
    expect(solids.inBox([-2, 0, -2], [2, 0, 2])).toHaveLength(1);
    expect(solids.inBox([300, 0, 300], [301, 0, 301])).toHaveLength(1);
  });

  test("set replaces a layer, an empty set removes it, and batch notifies once", () => {
    const solids = createWorldSolids();
    let calls = 0;
    solids.subscribe(() => {
      calls += 1;
    });
    solids.set("a", [BOX, BOX]);
    solids.set("a", [BOX]);
    expect(solids.count()).toBe(1);
    solids.set("a", []);
    expect(solids.layers()).toEqual([]);
    calls = 0;
    solids.batch(() => {
      solids.set("x", [BOX]);
      solids.set("y", [BOX]);
      solids.remove("x");
    });
    expect(calls).toBe(1);
    expect(solids.layers()).toEqual(["y"]);
  });

  test("snapshot/restore round-trips every layer", () => {
    const solids = createWorldSolids();
    solids.set("a", [BOX]);
    solids.set("b", [{ ...BOX, rotationY: 0.5 }]);
    const state = solids.snapshot();
    const copy = createWorldSolids();
    copy.restore(JSON.parse(JSON.stringify(state)));
    expect(copy.snapshot()).toEqual(state);
    expect(copy.inBox([-1, 0, -1], [1, 2, 1])).toHaveLength(2);
  });

  test("yaw grows the world AABB to the turned box", () => {
    const { min, max } = worldSolidBounds({ ...BOX, rotationY: Math.PI / 2 });
    expect(max[0] - min[0]).toBeCloseTo(2);
    expect(max[2] - min[2]).toBeCloseTo(4);
  });

  test("ray traversal includes closed cell boundaries, deduplicates boxes and observes live layers", () => {
    const solids = createWorldSolids({ cellSize: 1 });
    const corners: WorldSolid[] = [-0.5, 0.5].flatMap((x) => [-0.5, 0.5].map((z) => ({ center: [x, 1, z], halfExtents: [0.5, 1, 0.5] })));
    const wide: WorldSolid = { center: [8, 1, 8], halfExtents: [5, 1, 5] };
    const oversized: WorldSolid = { center: [-20, 1, -20], halfExtents: [10, 1, 10] };
    solids.set("boxes", [...corners, wide, oversized]);
    expect(new Set(solids.inRay!([0, 1, 0], [1, 0, 1], 0))).toEqual(new Set(corners));
    expect(solids.inRay!([0, 1, 0], [1, 0, 1], 20).filter((solid) => solid === wide)).toHaveLength(1);
    expect(solids.inRay!([-5, 1, -5], [-1, 0, -1], 50)).toContain(oversized);
    expect(solids.inRay!([0, 5, 0], [0, -4, 0], 5)).toHaveLength(4);
    expect(solids.inRay!([0, 5, 0], [1, 0, 1], 100)).toEqual([]);
    expect(solids.inRay!([0, 1, 0], [0, 0, 0], 100)).toEqual([]);
    const saved = solids.snapshot();
    solids.remove("boxes");
    expect(solids.inRay!([0, 1, 0], [1, 0, 1], 100)).toEqual([]);
    solids.restore(saved);
    expect(solids.inRay!([0, 1, 0], [1, 0, 1], 20)).toContain(wide);
  });

  test("indexed ray hits match an all-solid oracle across orientations and ray directions", () => {
    let state = 12345;
    const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    const solids = createWorldSolids({ cellSize: 4 });
    solids.set("scatter", Array.from({ length: 250 }, (): WorldSolid => ({
      center: [(random() - 0.5) * 80, random() * 8, (random() - 0.5) * 80],
      halfExtents: [0.5 + random() * 8, 0.5 + random() * 4, 0.5 + random() * 8],
      rotationY: random() * Math.PI * 2,
    })));
    const indexed = createSceneRaycast({ solids });
    const oracle = createSceneRaycast({ solids: { inBox: () => solids.all() } });
    for (let i = 0; i < 200; i++) {
      const ray = {
        origin: [(random() - 0.5) * 100, random() * 12, (random() - 0.5) * 100] as const,
        direction: [random() - 0.5, (random() - 0.5) * 0.2, random() - 0.5] as const,
        maxDistance: random() * 100,
      };
      expect(indexed.raycastAll(ray)).toEqual(oracle.raycastAll(ray));
    }
  });

  test("crossed-cell work includes corner contacts and counts deduplicated entry visits", () => {
    const solids = createWorldSolids({ cellSize: 1 });
    const wide: WorldSolid = { center: [2, 1, 2], halfExtents: [2, 1, 2] };
    const corner: WorldSolid = { center: [1.5, 1, 0.5], halfExtents: [0.5, 1, 0.5] };
    solids.set("route", [wide, corner]);
    solids.set("off-ray", Array.from({ length: 100 }, (_, i) => ({ center: [100 + i, 1, -100] as const, halfExtents: [0.1, 1, 0.1] as const })));
    const work = { cells: 0, entries: 0, bounds: 0 };
    expect(new Set(solids.inRay!([0.25, 1, 0.25], [1, 0, 1], 2, work))).toEqual(new Set([wide, corner]));
    expect(work.cells).toBeGreaterThan(1);
    expect(work.cells).toBeLessThanOrEqual(10);
    expect(work.bounds).toBe(2);
    expect(work.entries).toBeGreaterThan(work.bounds);
  });

  test("ray traversal rejects unbounded input instead of entering an unbounded cell walk", () => {
    const solids = createWorldSolids();
    for (const maxDistance of [Infinity, NaN, -1]) expect(() => solids.inRay!([0, 0, 0], [1, 0, 0], maxDistance)).toThrow(RangeError);
    expect(() => solids.inRay!([Infinity, 0, 0], [1, 0, 0], 10)).toThrow(RangeError);
    expect(() => solids.inRay!([0, 0, 0], [NaN, 0, 0], 10)).toThrow(RangeError);
    expect(() => solids.inRay!([0, 0, 0], [Number.MAX_VALUE, Number.MAX_VALUE, 0], 10)).toThrow(RangeError);
    for (const cellSize of [0, -1, NaN, Infinity]) expect(() => createWorldSolids({ cellSize })).toThrow(RangeError);
  });

  test("far, tiny-cell and huge-coordinate rays bound indexed work without dropping blockers", () => {
    const cases = [
      { cellSize: 1, center: [0, 1, 0] as const, origin: [-1e12, 1, 0] as const, distance: 2e12 },
      { cellSize: Number.MIN_VALUE, center: [1, 1, 1] as const, origin: [0, 1, 1] as const, distance: 2 },
      { cellSize: 1, center: [1e20, 1, 1e20] as const, origin: [1e20, 1, 1e20] as const, distance: 100 },
    ];
    for (const fixture of cases) {
      const solids = createWorldSolids({ cellSize: fixture.cellSize });
      const blocker: WorldSolid = { center: fixture.center, halfExtents: [0.25, 1, 0.25] };
      solids.set("blocker", [blocker]);
      const work = { cells: -1, entries: -1, bounds: -1 };
      expect(solids.inRay!(fixture.origin, [1, 0, 0], fixture.distance, work)).toContain(blocker);
      expect(work).toEqual({ cells: 0, entries: 1, bounds: 1 });
      expect(solids.inRay!([fixture.origin[0], 10, fixture.origin[2]], [1, 0, 0], fixture.distance, work)).toEqual([]);
      expect(work).toEqual({ cells: 0, entries: 1, bounds: 1 });
    }
  });
});

describe("solid derivers", () => {
  test("a building solid covers its footprint from the ground up through its floors", () => {
    const [generated] = resolveStructureBuildings(
      building({ count: 1, footprint: { w: 8, d: 6 }, stories: [3, 3], storyHeight: 3, seed: "s" }),
    );
    const [solid] = buildingSolids([generated!], () => 2);
    expect(solid!.halfExtents[0] * 2).toBeCloseTo(generated!.bounds.maxX - generated!.bounds.minX);
    expect(solid!.center[1] - solid!.halfExtents[1]).toBeCloseTo(2);
    expect(solid!.center[1] + solid!.halfExtents[1]).toBeCloseTo(2 + generated!.floors * generated!.floorHeight);
  });

  test("solid: false keeps a structure render-only", () => {
    const config: BuildingEnvironmentConfig = { count: 3, seed: "s" };
    expect(structureSolids(environment({ structures: building(config) }))).toHaveLength(3);
    expect(structureSolids(environment({ structures: building({ ...config, solid: false }) }))).toHaveLength(0);
  });

  test("a diagonal wall solid lies along its segment", () => {
    const [solid] = wallSolids(wallSegments([[0, 0], [10, 10]], false), { height: 3, thickness: 0.4 });
    const obstacle = obstacleFromSolid(solid!);
    expect(obstacle.boxes!.length).toBeGreaterThan(1);
    const blocks = (x: number, z: number) =>
      obstacle.boxes!.some(
        (box) =>
          x >= solid!.center[0] + box.min[0] &&
          x <= solid!.center[0] + box.max[0] &&
          z >= solid!.center[2] + box.min[2] &&
          z <= solid!.center[2] + box.max[2],
      );
    expect(blocks(5, 5)).toBe(true);
    expect(blocks(1, 1)).toBe(true);
    expect(blocks(8, 2)).toBe(false);
  });
});

function worldContext(config: BuildingEnvironmentConfig): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({
      name: "Solids",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { players: true },
      world: environment({ structures: building(config) }),
    }),
    content: { entityById: (id) => (id === "hero" ? { stats: { health: { max: 10 } } } : null) },
    player: { userId: "p", isNew: true },
  });
  ctx.game.players?.join("p", true);
  ctx.scene.entity.spawn("hero", { id: "p", position: [0, 0, 0] });
  return ctx;
}

const TOWER: BuildingEnvironmentConfig = {
  count: 1,
  position: [0, 10],
  footprint: { w: 8, d: 8 },
  stories: [2, 2],
  seed: "tower",
};

/** Z of the tower face the player at the origin walks into. */
function nearFace(ctx: GameContext): number {
  return worldSolidBounds(ctx.world.solids.layer("environment:structures")[0]!).min[2];
}

describe("environment structures are solid to every system that reads ctx.world.solids", () => {
  test("the building fills the structures layer", () => {
    expect(worldContext(TOWER).world.solids.layer("environment:structures")).toHaveLength(1);
    expect(worldContext({ ...TOWER, solid: false }).world.solids.count()).toBe(0);
  });

  test("the player walks into it and stops at its face", () => {
    const tuning = resolvePlayerMovementTuning({});
    const blocked = worldContext(TOWER);
    const open = worldContext({ ...TOWER, solid: false });
    for (let i = 0; i < 240; i++) {
      stepPlayerMovement(blocked, "p", { held: ["moveForward"], pointer: null }, 1 / 60, tuning, 0);
      stepPlayerMovement(open, "p", { held: ["moveForward"], pointer: null }, 1 / 60, tuning, 0);
    }
    expect(blocked.scene.entity.get("p")!.position[2]).toBeLessThan(nearFace(blocked));
    expect(open.scene.entity.get("p")!.position[2]).toBeGreaterThan(nearFace(blocked) + 1);
  });

  test("a walking NPC's step is cut at the same face", () => {
    const ctx = worldContext(TOWER);
    const from = nearFace(ctx) - 1;
    expect(solidObstaclesNear(ctx, [0, 0, from], 1, 1).length).toBeGreaterThan(0);
    expect(resolveWalkerStep(ctx, [0, 0, from], 0, 2).stepZ).toBeLessThan(1);
    expect(resolveWalkerStep(ctx, [20, 0, from], 0, 2).stepZ).toBe(2);
  });

  test("scene movement prediction and commit stop at the player's world-solid face", () => {
    const ctx = worldContext(TOWER);
    const from: [number, number, number] = [0, 0, nearFace(ctx) - 1];
    ctx.scene.entity.setPose("p", { position: from });
    const expected = resolveWalkerStep(ctx, from, 0, 2);
    const target: [number, number, number] = [0, 0, from[2] + 2];
    const predicted = ctx.scene.entity.moveToward("p", target, { speed: 2, dt: 1 });
    expect(predicted).toEqual([from[0] + expected.stepX, 0, from[2] + expected.stepZ]);
    expect(ctx.scene.entity.get("p")!.position).toEqual(from);
    expect(ctx.scene.entity.moveToward("p", target, { speed: 2, dt: 1, avoidSolids: false })).toEqual(target);
    expect(ctx.scene.entity.moveTowardCommit("p", target, { speed: 2, dt: 1, face: true })).toEqual(predicted);
    expect(ctx.scene.entity.get("p")!.position[2]).toBeLessThan(nearFace(ctx));
    ctx.world.solids.remove("environment:structures");
    expect(ctx.scene.entity.moveTowardCommit("p", target, { speed: 2, dt: 1 })).toEqual(target);
  });

  test("generated and placed walls block the same scene ray and perception sight line", () => {
    const generated = worldContext(TOWER);
    const placed = worldContext({ ...TOWER, solid: false });
    const solid = generated.world.solids.layer("environment:structures")[0]!;
    placed.scene.object.place("wall", ...solid.center, { instanceId: "placed-wall" });
    placed.scene.object.setColliders("placed-wall", {
      body: { purpose: "physical", shape: { kind: "aabb", halfExtents: solid.halfExtents } },
    });
    const ray = { origin: [0, 1, 0] as const, direction: [0, 0, 1] as const, maxDistance: 20, filter: { entities: false, terrain: false } };
    const placedHit = placed.scene.raycast(ray)!;
    expect(placedHit?.blocks).toBe(true);
    const generatedHit = generated.scene.raycast(ray)!;
    expect(generatedHit).not.toBeNull();
    expect(generatedHit).toMatchObject({ targetKind: "wall", purpose: "physical", damageEligible: false, blocks: true });
    expect(generatedHit.distance).toBeCloseTo(placedHit.distance);
    expect(generatedHit.point).toEqual(placedHit.point);
    expect(generatedHit.normal).toEqual(placedHit.normal);

    for (const ctx of [generated, placed]) {
      const senses = createPerception({ sightRange: 30, sightConeDeg: 360, hearingRange: 0, memorySeconds: 1,
        occluded: (from, to) => ctx.scene.raycast({ ...ray, origin: from,
          direction: [to[0] - from[0], to[1] - from[1], to[2] - from[2]], maxDistance: Math.hypot(...to.map((v, i) => v - from[i]!)),
          accept: (hit) => hit.blocks,
        }) !== null,
      });
      const observer = { id: "observer", position: ray.origin, yaw: 0 };
      const targets = [{ id: "target", position: [0, 1, 20] as const }];
      senses.observe(observer, targets, 0);
      expect(senses.memory("observer")).toEqual([]);
      ctx.world.solids.remove("environment:structures");
      ctx.scene.object.remove("placed-wall");
      senses.observe(observer, targets, 100);
      expect(senses.memory("observer")[0]?.targetId).toBe("target");
    }
  });

  test("projectiles use generated cover under the existing projectile obstacle policy", () => {
    for (const projectileObstacles of [true, false]) {
      const ctx = createGameContext({
        definition: defineGameDefinition({ name: "Generated cover", assets: createAssetCatalog(), multiplayer: "off",
          world: environment({ structures: building(TOWER) }), physics: { gravity: -30, jumpVelocity: 8, projectileObstacles },
        }),
        content: {
          itemById: () => ({ weapon: { damage: 7, range: 30, pellets: 1, spread: 0 } }),
          entityById: () => ({ stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } } }),
        },
        player: { userId: "shooter", isNew: true },
      });
      ctx.scene.entity.spawn("shooter", { id: "shooter", position: [0, 0, 0] });
      ctx.scene.entity.spawn("target", { id: "target", position: [0, 0, 20] });
      const shoot = () => ctx.scene.entity.settleProjectile(ctx.scene.entity.fireProjectile({
        from: "shooter", via: { item: "weapon" }, aim: { yaw: 0, pitch: 0 }, effect: "damage",
        originPolicy: { kind: "world", origin: [0, 1, 0] },
      }));
      const covered = shoot();
      expect(covered.status).toBe("settled");
      if (covered.status !== "settled") throw new Error(covered.reason);
      expect(covered.hits.map((hit) => hit.instanceId)).toEqual(projectileObstacles ? [] : ["target"]);
      expect(ctx.scene.entity.stats.get("target", "health")?.current).toBe(projectileObstacles ? 100 : 93);
      if (projectileObstacles) expect(covered.at[2]).toBeCloseTo(nearFace(ctx));
      ctx.world.solids.remove("environment:structures");
      const open = shoot();
      expect(open.status).toBe("settled");
      if (open.status !== "settled") throw new Error(open.reason);
      expect(open.hits.map((hit) => hit.instanceId)).toEqual(["target"]);
      expect(ctx.scene.entity.stats.get("target", "health")?.current).toBe(projectileObstacles ? 93 : 86);
    }
  });

  test("a physics backend gets it as a static body", () => {
    const ctx = worldContext(TOWER);
    const backend = createPhysicsWorldBackend({ capacity: 8, bounds: { min: [-40, -40, -40], max: [40, 40, 40] }, warn: false });
    const sync = syncWorldColliders(backend, ctx);
    const hit = backend.raycast({ origin: [0, 1, 0], direction: [0, 0, 1], maxDistance: 20 });
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(nearFace(ctx), 3);
    expect(backend.userDataOf(hit!.body)).toEqual({ kind: "solid", layer: "environment:structures" });
    ctx.world.solids.remove("environment:structures");
    expect(backend.raycast({ origin: [0, 1, 0], direction: [0, 0, 1], maxDistance: 20 })).toBeNull();
    sync.dispose();
    backend.dispose();
  });

  test("a nav grid blocks its footprint", () => {
    const ctx = worldContext(TOWER);
    const grid = createNavGrid({ bounds: { minX: -20, minZ: -10, maxX: 20, maxZ: 30 }, cellSize: 1 });
    expect(populateNavGridFromSolids(grid, ctx.world.solids)).toBe(1);
    const inside = grid.cellAt([0, 10]);
    const outside = grid.cellAt([0, 0]);
    expect(grid.isWalkable(inside.col, inside.row)).toBe(false);
    expect(grid.isWalkable(outside.col, outside.row)).toBe(true);
  });
});

const CITY_DOCUMENT = {
  markers: [],
  paths: [],
  volumes: [
    {
      id: "downtown",
      kind: "city",
      center: { x: 0, y: 0, z: 0 },
      halfExtents: { x: 120, y: 40, z: 120 },
      meta: {},
    },
  ],
};

describe("studio solids", () => {
  test("a city volume's buildings resolve to solids, and solid: false turns them off", () => {
    const solids = resolveAuthoredSolids(CITY_DOCUMENT).get("downtown");
    expect(solids?.length ?? 0).toBeGreaterThan(10);
    const off = { ...CITY_DOCUMENT, volumes: [{ ...CITY_DOCUMENT.volumes[0]!, meta: { solid: false } }] };
    expect(resolveAuthoredSolids(off).size).toBe(0);
  });

  test("syncAuthoredSolids owns one layer per object and drops layers the document lost", () => {
    const solids = createWorldSolids();
    solids.set("environment:structures", [BOX]);
    syncAuthoredSolids(solids, CITY_DOCUMENT);
    expect(solids.layers().sort()).toEqual(["authored:downtown", "environment:structures"]);
    syncAuthoredSolids(solids, { markers: [], paths: [], volumes: [] });
    expect(solids.layers()).toEqual(["environment:structures"]);
  });

  test("city solids stand on the ground they are sampled against", () => {
    const flat = resolveAuthoredSolids(CITY_DOCUMENT).get("downtown")!;
    const raised = resolveAuthoredSolids(CITY_DOCUMENT, () => 30).get("downtown")!;
    expect(raised).toHaveLength(flat.length);
    expect(raised[0]!.center[1] - flat[0]!.center[1]).toBeCloseTo(30);
  });
});
