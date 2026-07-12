import { describe, expect, test } from "bun:test";
import { createEffectSystem, type CombatSpatialDeps, type ReceiveMap } from "@jgengine/core/combat/effects";
import { createProjectileSystem } from "@jgengine/core/combat/projectiles";
import { createBallisticSweep, type BallisticSweep } from "@jgengine/core/physics/ballisticSweep";
import { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
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
  sweepBallistic?: BallisticSweep,
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
    ...(sweepBallistic !== undefined ? { sweepBallistic } : {}),
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
    expect(prediction.hits).toHaveLength(1);
    expect(prediction.hits[0]!.kind).toBe("entity");
    expect(prediction.hits[0]!.instanceId).toBe("enemy");
    expect(prediction.hits[0]!.distance).toBeCloseTo(9.65);
    expect(prediction.origin).toEqual([0, 0, 0]);
    expect(prediction.firstImpact?.instanceId).toBe("enemy");
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
    expect(settle.at[2]).toBeCloseTo(9.65);
    expect(settle.origin).toEqual([0, 0, 0]);
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

  test("ballistic settle applies splash damage inside explosion.radius", () => {
    const { projectiles, stats } = createRange({
      near: target([0, 0, 10]),
      far: target([0, 0, 40]),
    });
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { item: "grenade" },
      aim: { origin: [0, 1, 0], direction: [0, 1, 1] },
      effect: "damage",
    });
    const settle = projectiles.settleProjectile(shotId);
    expect(settle.status).toBe("settled");
    if (settle.status !== "settled") return;
    expect(settle.at[0]).toBeCloseTo(0);
    expect(settle.at[1]).toBeCloseTo(0);
    expect(settle.at[2]).toBeGreaterThan(5);
    expect(settle.hits.some((hit) => hit.instanceId === "near")).toBe(true);
    expect(stats["near"]!["health"]!.current).toBeLessThan(100);
    expect(stats["far"]!["health"]!.current).toBe(100);
  });

  test("ballistic settle without explosion.radius still hits entities at the landing point", () => {
    WEAPON_STATS["fuse-orb"] = {
      damage: 20,
      "projectile.speed": 10,
      "projectile.gravity": 0,
      "projectile.fuseTime": 1,
    };
    const landing: [number, number, number] = [0, 0, 10];
    const { projectiles, stats } = createRange({ enemy: target(landing) });
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { item: "fuse-orb" },
      aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
      effect: "damage",
    });
    const settle = projectiles.settleProjectile(shotId);
    expect(settle.status).toBe("settled");
    if (settle.status !== "settled") return;
    expect(settle.at[2]).toBeCloseTo(10);
    expect(settle.hits).toHaveLength(1);
    expect(settle.hits[0]!.instanceId).toBe("enemy");
    expect(stats["enemy"]!["health"]!.current).toBe(80);
  });
});

describe("physics-integrated ballistic settle", () => {
  const grenadeShot = {
    from: "shooter",
    via: { item: "grenade" },
    aim: { origin: [0, 1, 0] as [number, number, number], direction: [0, 1, 1] as [number, number, number] },
    effect: "damage",
  };

  function settleGrenade(sweepBallistic?: BallisticSweep): [number, number, number] {
    const { projectiles } = createRange({}, [], undefined, undefined, sweepBallistic);
    const shotId = projectiles.fireProjectile(grenadeShot);
    const settle = projectiles.settleProjectile(shotId);
    if (settle.status !== "settled") throw new Error(settle.reason);
    return settle.at;
  }

  test("a sweep hit settles the shot at the impact point", () => {
    const at = settleGrenade(() => ({ point: [1, 2, 3], time: 0.5 }));
    expect(at).toEqual([1, 2, 3]);
  });

  test("a sweep returning null falls back to the closed-form landing", () => {
    const closedForm = settleGrenade();
    const withNullSweep = settleGrenade(() => null);
    expect(withNullSweep).toEqual(closedForm);
  });

  test("the sweep receives the arc parameters and flight cap", () => {
    const calls: { origin: readonly number[]; velocity: readonly number[]; gravity: number; maxTime: number }[] = [];
    settleGrenade((origin, velocity, gravity, maxTime) => {
      calls.push({ origin, velocity, gravity, maxTime });
      return null;
    });
    expect(calls).toHaveLength(1);
    const captured = calls[0]!;
    expect(captured.origin).toEqual([0, 1, 0]);
    expect(captured.velocity[1]!).toBeCloseTo(10 / Math.sqrt(2), 4);
    expect(captured.velocity[2]!).toBeCloseTo(10 / Math.sqrt(2), 4);
    expect(captured.gravity).toBeCloseTo(9.8, 5);
    expect(captured.maxTime).toBeGreaterThan(1.5);
    expect(captured.maxTime).toBeLessThan(1.7);
  });

  test("a PhysicsWorld wall in the arc settles the shot at the wall, not the closed-form landing", () => {
    const world = new PhysicsWorld({
      capacity: 16,
      bounds: { min: [-20, 0, -20], max: [20, 40, 20] },
      cellSize: 1,
    });
    world.addBody({ position: [0, 2, 5], halfExtents: [4, 3, 0.25], static: true });
    const closedForm = settleGrenade();
    expect(closedForm[2]).toBeGreaterThan(10);
    const at = settleGrenade(createBallisticSweep(world));
    expect(at[2]).toBeGreaterThan(4);
    expect(at[2]).toBeLessThan(5.5);
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
    expect(prediction.hits).toHaveLength(1);
    expect(prediction.hits[0]).toMatchObject({ kind: "object", instanceId: "wallA", catalogId: "wall", distance: 4.5 });
    expect(prediction.blocked).toBe(true);

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
    expect(prediction.hits).toHaveLength(1);
    expect(prediction.hits[0]!.instanceId).toBe("enemy");

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
    expect(missPrediction.hits).toHaveLength(1);
    expect(missPrediction.hits[0]!.instanceId).toBe("enemy");

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
    expect(hitPrediction.hits[0]!.kind).toBe("object");
    expect(hitPrediction.hits[0]!.instanceId).toBe("wallC");
    expect(hitPrediction.hits[0]!.distance).toBeCloseTo(4);
    expect(hitPrediction.blocked).toBe(true);
  });

  test("muzzle origin policy shifts the resolved shot origin", () => {
    const { projectiles } = createRange({ enemy: target([0, 0, 10]) });
    const withMuzzle = createProjectileSystem({
      effects: createEffectSystem({
        resolveReceive: () => ({ damage: { order: ["health"] } }),
        resolveStats: () => ({ health: { current: 100, max: 100 } }),
        getStat: (itemId, stat) => WEAPON_STATS[itemId]?.[stat] ?? null,
        spatial: {
          inRadius: () => ["enemy"],
          hasLineOfSight: () => true,
          positionOf: (id) => (id === "shooter" ? [0, 0, 0] : [0, 0, 10]),
        },
      }),
      spatial: {
        inRadius: (center, radius) =>
          distanceBetween(center, [0, 0, 10]) <= radius ? ["enemy"] : [],
        hasLineOfSight: () => true,
        positionOf: (id) => (id === "shooter" ? [0, 0, 0] : id === "enemy" ? [0, 0, 10] : undefined),
      },
      getStat: (itemId, stat) => WEAPON_STATS[itemId]?.[stat] ?? null,
      rotationYOf: () => 0,
      now: () => 0,
    });
    const prediction = withMuzzle.willHitProjectile({
      from: "shooter",
      via: { item: "pistol" },
      aim: { yaw: 0, pitch: 0 },
      effect: "damage",
      originPolicy: { kind: "muzzle", offset: [0, 0, 1] },
    });
    expect(prediction.origin).toEqual([0, 0, 1]);
    expect(projectiles).toBeDefined();
  });

  test("prediction and settlement share the same first impact", () => {
    const { projectiles, stats } = createRange({ enemy: target([0, 0, 10]) }, [], [wallInPath]);
    const input = {
      from: "shooter",
      via: { item: "pistol" as const },
      aim: { origin: [0, 0, 0] as [number, number, number], direction: [0, 0, 1] as [number, number, number] },
      effect: "damage",
    };
    const prediction = projectiles.willHitProjectile(input);
    const shotId = projectiles.fireProjectile(input);
    const settle = projectiles.settleProjectile(shotId);
    expect(settle.status).toBe("settled");
    if (settle.status !== "settled") return;
    expect(prediction.firstImpact?.kind).toBe("object");
    expect(settle.at[2]).toBeCloseTo(prediction.firstImpact!.distance);
    expect(settle.hits).toEqual([]);
    expect(stats["enemy"]!["health"]!.current).toBe(100);
  });
});
