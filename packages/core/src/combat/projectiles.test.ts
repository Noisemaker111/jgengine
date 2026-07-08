import { describe, expect, test } from "bun:test";
import { createEffectSystem, type CombatSpatialDeps, type ReceiveMap } from "@jgengine/core/combat/effects";
import { createProjectileSystem } from "@jgengine/core/combat/projectiles";
import { seedStatValues, type StatCatalog, type StatValueMap } from "@jgengine/core/scene/entityStats";
import { distanceBetween } from "@jgengine/core/scene/spatial";

interface RangeEntity {
  stats: StatCatalog;
  receive: ReceiveMap;
  position: [number, number, number];
}

const WEAPON_STATS: Record<string, Record<string, number>> = {
  pistol: { damage: 10, range: 50 },
  shotgun: { damage: 5, range: 20, pellets: 3 },
  grenade: {
    damage: 30,
    "projectile.speed": 10,
    "projectile.gravity": 1,
    "projectile.fuseTime": 2,
    "explosion.radius": 6,
  },
};

interface RangeObject {
  instanceId: string;
  catalogId: string;
  position: [number, number, number];
}

function createRange(
  entities: Record<string, RangeEntity>,
  losBlocked: string[] = [],
  objects?: RangeObject[],
  halfExtents?: (catalogId: string) => [number, number, number] | null,
) {
  const stats: Record<string, StatValueMap> = {};
  for (const [instanceId, entity] of Object.entries(entities)) {
    stats[instanceId] = seedStatValues(entity.stats);
  }
  const spatial: CombatSpatialDeps = {
    inRadius: (center, radius) =>
      Object.keys(entities).filter((instanceId) => {
        const entity = entities[instanceId];
        return entity !== undefined && distanceBetween(center, entity.position) <= radius;
      }),
    hasLineOfSight: (_from, to) => !losBlocked.includes(to),
    positionOf: (instanceId) => entities[instanceId]?.position,
  };
  const getStat = (itemId: string, stat: string) => WEAPON_STATS[itemId]?.[stat] ?? null;
  const effects = createEffectSystem({
    resolveReceive: (instanceId) => entities[instanceId]?.receive,
    resolveStats: (instanceId) => stats[instanceId],
    getStat,
    spatial,
  });
  const projectiles = createProjectileSystem({
    effects,
    spatial,
    getStat,
    now: () => 0,
    ...(objects !== undefined
      ? { objects: { list: () => objects, ...(halfExtents !== undefined ? { halfExtents } : {}) } }
      : {}),
  });
  return { projectiles, stats };
}

const target = (position: [number, number, number]): RangeEntity => ({
  stats: { health: { max: 100 } },
  receive: { damage: { order: ["health"] } },
  position,
});

describe("projectile system", () => {
  test("willHitProjectile predicts without changing state", () => {
    const { projectiles, stats } = createRange({ enemy: target([0, 0, 10]) });
    const prediction = projectiles.willHitProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    expect(prediction.hits).toEqual([{ kind: "entity", instanceId: "enemy", distance: 10 }]);
    expect(prediction.blocked).toBeUndefined();
    expect(stats["enemy"]!["health"]!.current).toBe(100);
  });

  test("willHitProjectile reports blocked when the only hit lacks line of sight", () => {
    const { projectiles } = createRange({ enemy: target([0, 0, 10]) }, ["enemy"]);
    const prediction = projectiles.willHitProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    expect(prediction.hits).toEqual([]);
    expect(prediction.blocked).toBe(true);
  });

  test("settle applies the effect to the nearest receivable target", () => {
    const { projectiles, stats } = createRange({
      enemy: target([0, 0, 10]),
      behind: target([0, 0, 20]),
    });
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    const settle = projectiles.settleProjectile(shotId);
    expect(settle.status).toBe("settled");
    if (settle.status !== "settled") return;
    expect(settle.at).toEqual([0, 0, 10]);
    expect(settle.hits).toHaveLength(1);
    expect(settle.hits[0]!.instanceId).toBe("enemy");
    expect(stats["enemy"]!["health"]!.current).toBe(90);
    expect(stats["behind"]!["health"]!.current).toBe(100);
  });

  test("pellets distribute round-robin across receivable hits", () => {
    const { projectiles, stats } = createRange({
      first: target([0, 0, 5]),
      second: target([0, 0, 10]),
    });
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { item: "shotgun" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    const settle = projectiles.settleProjectile(shotId);
    expect(settle.status).toBe("settled");
    if (settle.status !== "settled") return;
    expect(settle.hits).toHaveLength(3);
    expect(stats["first"]!["health"]!.current).toBe(90);
    expect(stats["second"]!["health"]!.current).toBe(95);
  });

  test("settling twice rejects and unknown shots reject", () => {
    const { projectiles } = createRange({ enemy: target([0, 0, 10]) });
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    expect(projectiles.settleProjectile(shotId).status).toBe("settled");
    expect(projectiles.settleProjectile(shotId)).toEqual({
      status: "rejected",
      shotId,
      reason: "already-settled",
    });
    expect(projectiles.settleProjectile("shot_99")).toEqual({
      status: "rejected",
      shotId: "shot_99",
      reason: "unknown-shot",
    });
  });

  test("ballistic settle returns a landing point with no hits", () => {
    const { projectiles, stats } = createRange({ enemy: target([0, 0, 10]) });
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { item: "grenade" },
      aim: { origin: [0, 1, 0], direction: [0, 1, 1] },
      effect: "damage",
    });
    const settle = projectiles.settleProjectile(shotId);
    expect(settle.status).toBe("settled");
    if (settle.status !== "settled") return;
    expect(settle.hits).toEqual([]);
    expect(settle.at[0]).toBeCloseTo(0);
    expect(settle.at[1]).toBeCloseTo(0);
    expect(settle.at[2]).toBeGreaterThan(5);
    expect(stats["enemy"]!["health"]!.current).toBe(100);
  });
});

describe("object-aware raycast", () => {
  const wallInPath: RangeObject = { instanceId: "wallA", catalogId: "wall", position: [0, 0, 5] };

  test("an object blocks a shot before the entity behind it", () => {
    const { projectiles, stats } = createRange({ enemy: target([0, 0, 10]) }, [], [wallInPath]);
    const prediction = projectiles.willHitProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    expect(prediction.hits).toEqual([{ kind: "object", instanceId: "wallA", catalogId: "wall", distance: 4.5 }]);

    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    const settle = projectiles.settleProjectile(shotId);
    expect(settle.status).toBe("settled");
    if (settle.status !== "settled") return;
    expect(settle.hits).toEqual([]);
    expect(settle.at).toEqual([0, 0, 4.5]);
    expect(stats["enemy"]!["health"]!.current).toBe(100);
  });

  test("an object off the ray path is a miss and the entity behind it is still hit", () => {
    const offPath: RangeObject = { instanceId: "wallB", catalogId: "wall", position: [5, 0, 5] };
    const { projectiles, stats } = createRange({ enemy: target([0, 0, 10]) }, [], [offPath]);
    const prediction = projectiles.willHitProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    expect(prediction.hits).toEqual([{ kind: "entity", instanceId: "enemy", distance: 10 }]);

    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    const settle = projectiles.settleProjectile(shotId);
    expect(settle.status).toBe("settled");
    if (settle.status !== "settled") return;
    expect(settle.hits).toHaveLength(1);
    expect(stats["enemy"]!["health"]!.current).toBe(90);
  });

  test("half-extents are respected: default box misses, a wider resolved box hits", () => {
    const offsetObject: RangeObject = { instanceId: "wallC", catalogId: "bigwall", position: [0.6, 0, 5] };

    const withDefaults = createRange({ enemy: target([0, 0, 10]) }, [], [offsetObject]);
    const missPrediction = withDefaults.projectiles.willHitProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    expect(missPrediction.hits).toEqual([{ kind: "entity", instanceId: "enemy", distance: 10 }]);

    const withWideBox = createRange(
      { enemy: target([0, 0, 10]) },
      [],
      [offsetObject],
      (catalogId) => (catalogId === "bigwall" ? [1, 1, 1] : null),
    );
    const hitPrediction = withWideBox.projectiles.willHitProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    expect(hitPrediction.hits).toEqual([{ kind: "object", instanceId: "wallC", catalogId: "bigwall", distance: 4 }]);
  });
});
