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
