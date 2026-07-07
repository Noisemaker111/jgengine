import { describe, expect, test } from "bun:test";
import {
  createEffectSystem,
  type CombatSpatialDeps,
  type EffectSystemDeps,
  type ReceiveMap,
} from "@jgengine/core/combat/effects";
import { seedStatValues, type StatCatalog, type StatValueMap } from "@jgengine/core/scene/entityStats";
import { distanceBetween } from "@jgengine/core/scene/spatial";
import { createSpatialApi } from "@jgengine/core/scene/spatial";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import {
  predictAreaEffect,
  predictArcEffect,
  predictTiles,
} from "@jgengine/core/tactics/predictiveQuery";

interface WorldEntity {
  stats: StatCatalog;
  receive: ReceiveMap;
  position: EntityPosition;
}

function createWorld(entities: Record<string, WorldEntity>, losBlocked: string[] = []) {
  const stats: Record<string, StatValueMap> = {};
  for (const [id, entity] of Object.entries(entities)) stats[id] = seedStatValues(entity.stats);
  const spatial: CombatSpatialDeps = {
    inRadius: (center, radius) =>
      Object.keys(entities).filter((id) => distanceBetween(center, entities[id]!.position) <= radius),
    hasLineOfSight: (_from, to) => !losBlocked.includes(to as string),
    positionOf: (id) => entities[id]?.position,
  };
  const deps: EffectSystemDeps = {
    resolveReceive: (id) => entities[id]?.receive,
    resolveStats: (id) => stats[id],
    getStat: () => null,
    spatial,
  };
  return { system: createEffectSystem(deps), spatial, stats };
}

const world = {
  near: { stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } }, position: [0, 0, 5] as EntityPosition },
  hidden: { stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } }, position: [0, 0, 2] as EntityPosition },
  far: { stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } }, position: [0, 0, 25] as EntityPosition },
  invuln: { stats: { health: { max: 100 } }, receive: {}, position: [0, 0, 4] as EntityPosition },
};

describe("predictAreaEffect parity with applyEffect", () => {
  test("would-hit set equals the set the effect actually drains (los + falloff + receive)", () => {
    const { system, spatial } = createWorld(world, ["hidden"]);
    const input = { at: [0, 0, 0] as EntityPosition, radius: 10, effect: "damage", falloff: "linear" as const, via: { amount: 40 } };
    const predicted = predictAreaEffect({ spatial, queryArc: () => [], canReceive: system.canReceive }, input);
    const actual = system.applyEffect(input);
    expect(predicted.map((p) => p.instanceId).sort()).toEqual(actual.map((r) => r.instanceId).sort());
    expect(predicted.map((p) => p.instanceId)).toEqual(["near"]);
  });

  test("predicted falloff scale matches the applied fraction", () => {
    const fresh = createWorld(world);
    const input = { at: [0, 0, 0] as EntityPosition, radius: 10, effect: "damage", falloff: "linear" as const, via: { amount: 40 } };
    const predicted = predictAreaEffect(
      { spatial: fresh.spatial, queryArc: () => [], canReceive: fresh.system.canReceive },
      input,
    );
    const nearScale = predicted.find((p) => p.instanceId === "near")!.scale;
    expect(nearScale).toBeCloseTo(0.5, 5);
  });

  test("prediction never mutates state; repeated calls are stable", () => {
    const { system, spatial, stats } = createWorld(world);
    const input = { at: [0, 0, 0] as EntityPosition, radius: 30, effect: "damage", via: { amount: 10 } };
    const first = predictAreaEffect({ spatial, queryArc: () => [], canReceive: system.canReceive }, input);
    const second = predictAreaEffect({ spatial, queryArc: () => [], canReceive: system.canReceive }, input);
    expect(first).toEqual(second);
    expect(stats["near"]!["health"]!.current).toBe(100);
  });
});

describe("predictArcEffect", () => {
  test("uses queryArc and gates on canReceive", () => {
    const positions: Record<string, EntityPosition> = {
      hero: [0, 0, 0],
      front: [0, 0, 5],
      wall: [0, 0, 6],
    };
    const spatial = createSpatialApi({
      resolvePosition: (id) => positions[id],
      candidates: () => Object.keys(positions),
    });
    const receive: Record<string, boolean> = { front: true, wall: false };
    const predicted = predictArcEffect(
      {
        spatial: {
          inRadius: () => [],
          hasLineOfSight: () => true,
          positionOf: (id) => positions[id],
        },
        queryArc: (options) => spatial.queryArc(options),
        canReceive: (id) => (receive[id] ? null : "not-receivable"),
      },
      { from: "hero", aim: { yaw: 0, pitch: 0 }, radius: 10, effect: "damage" },
    );
    expect(predicted.map((p) => p.instanceId)).toEqual(["front"]);
  });
});

describe("predictTiles", () => {
  test("returns the grid tiles inside a radius for an overlay", () => {
    const tiles = predictTiles({ at: [0, 0, 0], radius: 1, originTile: [3, 3], tileSize: 1 });
    const keys = tiles.map((t) => `${t[0]},${t[1]}`).sort();
    expect(keys).toEqual(["2,3", "3,2", "3,3", "3,4", "4,3"]);
  });
});
