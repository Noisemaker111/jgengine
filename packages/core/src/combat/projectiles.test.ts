import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createEffectSystem, type CombatSpatialDeps, type ReceiveMap } from "@jgengine/core/combat/effects";
import { createProjectileSystem, type ProjectileSystemDeps, type ProjectileSettleReport } from "@jgengine/core/combat/projectiles";
import { createBallisticSweep, type BallisticSweep } from "@jgengine/core/physics/ballisticSweep";
import { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
import { seedStatValues, type StatCatalog, type StatValueMap } from "@jgengine/core/scene/entityStats";
import { distanceBetween } from "@jgengine/core/scene/spatial";
import type { ShotOriginPolicy } from "@jgengine/core/combat/shotOrigin";

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
  extra: Partial<ProjectileSystemDeps> = {},
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
  const reports: ProjectileSettleReport[] = [];
  const projectiles = createProjectileSystem({
    effects,
    spatial,
    getStat,
    now: () => 0,
    onSettle: (report) => reports.push(report),
    ...extra,
    ...(objects !== undefined
      ? { objects: { list: () => objects, ...(halfExtents !== undefined ? { halfExtents } : {}) } }
      : {}),
    ...(sweepBallistic !== undefined ? { sweepBallistic } : {}),
  });
  return { projectiles, stats, reports };
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

  test("zero-spread pellets independently hit the nearest receiver", () => {
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
    expect(stats["first"]!["health"]!.current).toBe(85);
    expect(stats["second"]!["health"]!.current).toBe(100);
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

  test("settle report marks lobbed/exploding shots ballistic and direct-fire shots not", () => {
    const { projectiles, reports } = createRange({ enemy: target([0, 0, 10]) });
    projectiles.settleProjectile(
      projectiles.fireProjectile({
        from: "shooter",
        via: { item: "pistol" },
        aim: { origin: [0, 0, 0], direction: [0, 0, 1] },
        effect: "damage",
      }),
    );
    projectiles.settleProjectile(
      projectiles.fireProjectile({
        from: "shooter",
        via: { item: "grenade" },
        aim: { origin: [0, 1, 0], direction: [0, 1, 1] },
        effect: "damage",
      }),
    );
    expect(reports.map((r) => r.ballistic)).toEqual([false, true]);
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

describe("sampled per-pellet shooting", () => {
  const spread = 10;
  const offset = Math.tan(spread * Math.PI / 180) * 10;
  const input = {
    from: "shooter",
    via: { item: "breacher" },
    aim: { yaw: 0, pitch: 0, spread },
    effect: "damage",
    originPolicy: { kind: "world" as const, origin: [0, 0.9, 0] as [number, number, number] },
  };
  const entities = () => ({ center: target([0, 0, 10]), right: target([offset, 0, 10]), left: target([-offset, 0, 10]) });
  const samples = () => {
    const values = [0, 0, 1, 0, 1, 0.5];
    let draws = 0;
    return { rng: () => values[draws++]!, draws: () => draws };
  };
  WEAPON_STATS.breacher = { damage: 5, range: 20, pellets: 3, spread };

  test("Scrap Signal's existing fireProjectile/settleProjectile call distributes independent rays", () => {
    const random = samples();
    const { projectiles, stats } = createRange(entities(), [], undefined, undefined, undefined, { rng: random.rng });
    const prediction = projectiles.willHitProjectile(input);
    expect(prediction.firstImpact?.instanceId).toBe("center");
    expect(random.draws()).toBe(0);
    const shot = projectiles.fireProjectile(input);
    expect(random.draws()).toBe(6);
    const result = projectiles.settleProjectile(shot);
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.hits.map((hit) => hit.instanceId)).toEqual(["center", "right", "left"]);
    expect(result.origin).toEqual([0, 0.9, 0]);
    for (const id of ["center", "right", "left"]) expect(stats[id]!.health!.current).toBe(95);
    expect(random.draws()).toBe(6);
    expect(projectiles.settleProjectile(shot).status).toBe("rejected");
    expect(random.draws()).toBe(6);
  });

  test("each pellet respects cover while other rays can reach their receivers", () => {
    const { projectiles, stats } = createRange(
      entities(), [], [{ instanceId: "cover", catalogId: "wall", position: [offset / 2, 0.9, 5] }],
      () => [0.1, 0.5, 0.1], undefined, { rng: samples().rng },
    );
    const result = projectiles.settleProjectile(projectiles.fireProjectile(input));
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.hits.map((hit) => hit.instanceId)).toEqual(["center", "left"]);
    expect(stats.right!.health!.current).toBe(100);
  });

  test("each pellet respects receiver line of sight", () => {
    const { projectiles, stats } = createRange(entities(), ["right"], undefined, undefined, undefined, { rng: samples().rng });
    const result = projectiles.settleProjectile(projectiles.fireProjectile(input));
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.hits.map((hit) => hit.instanceId)).toEqual(["center", "left"]);
    expect(stats.right!.health!.current).toBe(100);
  });

  test("catalog spread is sampled when the caller omits Aim.spread", () => {
    const { projectiles } = createRange(entities(), [], undefined, undefined, undefined, { rng: samples().rng });
    const result = projectiles.settleProjectile(projectiles.fireProjectile({ ...input, aim: { yaw: 0, pitch: 0 } }));
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.hits.map((hit) => hit.instanceId)).toEqual(["center", "right", "left"]);
  });

  test("zero spread consumes no random samples and keeps the explicit aim", () => {
    let draws = 0;
    const { projectiles } = createRange({ center: target([0, 0, 10]) }, [], undefined, undefined, undefined, { rng: () => { draws++; return 1; } });
    const result = projectiles.settleProjectile(projectiles.fireProjectile({
      ...input, aim: { origin: [0, 0.9, 0], direction: [0, 0, 1] },
    }));
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.hits).toHaveLength(3);
    expect(draws).toBe(0);
  });

  test("pellet work is bounded and count is captured at fire time", () => {
    WEAPON_STATS.bounded = { damage: 1, range: 20, pellets: 1_000_000 };
    let rays = 0;
    const { projectiles } = createRange({}, [], undefined, undefined, undefined, { maxPellets: 4, raycast: () => { rays++; return []; } });
    const shot = projectiles.fireProjectile({ ...input, via: { item: "bounded" }, aim: { yaw: 0, pitch: 0, spread: 0 } });
    WEAPON_STATS.bounded.pellets = 1;
    expect(projectiles.settleProjectile(shot).status).toBe("settled");
    expect(rays).toBe(4);
  });

  test("sampled vertical rays stay normalized and retain the resolved muzzle", () => {
    const rays: { aim: Parameters<NonNullable<ProjectileSystemDeps["raycast"]>>[1] }[] = [];
    const { projectiles, reports } = createRange({ shooter: target([2, 0, 3]) }, [], undefined, undefined, undefined, {
      rng: () => 0.5,
      raycast: (_from, aim) => { rays.push({ aim }); return []; },
    });
    const result = projectiles.settleProjectile(projectiles.fireProjectile({
      ...input, aim: { yaw: 0, pitch: Math.PI / 2, spread },
      originPolicy: { kind: "muzzle", offset: [0, 1, 0.2] },
    }));
    expect(result.status).toBe("settled");
    expect(reports[0]!.origin).toEqual([2, 1, 3.2]);
    for (const { aim } of rays) {
      expect("origin" in aim).toBe(true);
      if (!("origin" in aim)) continue;
      expect(aim.origin).toEqual([2, 1, 3.2]);
      expect(Math.hypot(...aim.direction)).toBeCloseTo(1);
    }
  });

  test("named head hitboxes still predict and receive sampled shots", () => {
    const { projectiles, stats } = createRange({ enemy: target([0, 0, 10]) }, [], undefined, undefined, undefined, {
      rng: () => 0,
      entityCollidersOf: () => ({ hitboxes: [{ name: "head", purpose: "damage", shape: { kind: "sphere", radius: 0.2, offset: [0, 1.62, 0] } }] }),
    });
    const headShot = { ...input, via: { item: "pistol" }, originPolicy: { kind: "world" as const, origin: [0, 1.62, 0] as [number, number, number] } };
    expect(projectiles.willHitProjectile(headShot).firstImpact?.colliderName).toBe("head");
    const result = projectiles.settleProjectile(projectiles.fireProjectile(headShot));
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.hits).toHaveLength(1);
    expect(result.at[2]).toBeCloseTo(9.8);
    expect(stats.enemy!.health!.current).toBe(90);
  });

  test("ballistic paths do not consume cone RNG or change their landing", () => {
    let draws = 0;
    const { projectiles } = createRange({}, [], undefined, undefined, undefined, { rng: () => { draws++; return 0.5; } });
    const fire = (spread: number) => projectiles.settleProjectile(projectiles.fireProjectile({
      ...input, via: { item: "grenade" }, aim: { yaw: 0, pitch: 0, spread },
    }));
    const spreadShot = fire(30);
    const centerShot = fire(0);
    expect(spreadShot.status).toBe("settled");
    expect(centerShot.status).toBe("settled");
    if (spreadShot.status !== "settled" || centerShot.status !== "settled") return;
    expect(spreadShot.at).toEqual(centerShot.at);
    expect(draws).toBe(0);
  });
});


describe("fire-time shot detachment", () => {
  test("Scrap Signal's delayed settlement keeps its fired cone and world origin after caller reuse", () => {
    const offset = Math.tan(10 * Math.PI / 180) * 10;
    const aim = { yaw: 0, pitch: 0, spread: 10 };
    const origin: [number, number, number] = [0, 0.9, 0];
    const originPolicy: ShotOriginPolicy = { kind: "world", origin };
    const values = [0, 0, 1, 0, 1, 0.5];
    let draws = 0;
    const { projectiles } = createRange({ center: target([0, 0, 10]), right: target([offset, 0, 10]), left: target([-offset, 0, 10]) }, [], undefined, undefined, undefined, { rng: () => values[draws++]! });
    const shot = projectiles.fireProjectile({ from: "shooter", via: { item: "breacher" }, aim, effect: "damage", originPolicy });
    aim.yaw = Math.PI / 2;
    aim.pitch = 0.5;
    aim.spread = 0;
    origin[0] = 50;
    const result = projectiles.settleProjectile(shot);
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.origin).toEqual([0, 0.9, 0]);
    expect(result.hits.map((hit) => hit.instanceId)).toEqual(["center", "right", "left"]);
    expect(draws).toBe(6);
  });

  test.each(["pistol", "grenade"])("explicit %s origin and direction survive vector mutation and replacement", (item) => {
    const aim = { origin: [0, 0.9, 0] as [number, number, number], direction: [0, 0, 1] as [number, number, number] };
    const { projectiles } = createRange({ enemy: target([0, 0, 10]) });
    const input = { from: "shooter", via: { item }, aim, effect: "damage" };
    const expected = projectiles.settleProjectile(projectiles.fireProjectile(input));
    const shot = projectiles.fireProjectile(input);
    aim.origin[0] = 50;
    aim.direction[0] = 1;
    aim.direction[2] = 0;
    aim.origin = [100, 0, 0];
    aim.direction = [-1, 0, 0];
    const result = projectiles.settleProjectile(shot);
    expect(result.status).toBe("settled");
    expect(expected.status).toBe("settled");
    if (result.status !== "settled" || expected.status !== "settled") return;
    expect(result.origin).toEqual(expected.origin);
    expect(result.at).toEqual(expected.at);
    expect(result.hits.map((hit) => hit.instanceId)).toEqual(expected.hits.map((hit) => hit.instanceId));
  });

  test.each(["world", "camera", "muzzle", "entityOffset", "converge"] as const)("%s policy vectors are detached for explicit and default policies", (kind) => {
    for (const useDefault of [false, true]) {
      const origin: [number, number, number] = [1, 0.9, 2];
      const direction: [number, number, number] = [0, 0, 1];
      const offset: [number, number, number] = [0.1, 1, 0.2];
      const policy: ShotOriginPolicy = kind === "world" || kind === "camera"
        ? { kind, origin, direction }
        : kind === "converge" ? { kind, muzzle: offset } : { kind, offset };
      const { projectiles } = createRange({ shooter: target([0, 0, 0]) }, [], undefined, undefined, undefined, useDefault ? { defaultOriginPolicy: policy } : {});
      const input = { from: "shooter", via: { item: "pistol" }, aim: { yaw: 0, pitch: 0, spread: 0 }, effect: "damage", ...(!useDefault ? { originPolicy: policy } : {}) };
      const expected = projectiles.settleProjectile(projectiles.fireProjectile(input));
      const shot = projectiles.fireProjectile(input);
      origin[0] = 50;
      direction[0] = 1;
      direction[2] = 0;
      offset[0] = 50;
      const result = projectiles.settleProjectile(shot);
      expect(result.status).toBe("settled");
      expect(expected.status).toBe("settled");
      if (result.status !== "settled" || expected.status !== "settled") return;
      expect(result.origin).toEqual(expected.origin);
      expect(result.at).toEqual(expected.at);
    }
  });

  test("caller mutation inside injected RNG cannot change the fire-time aim or policy", () => {
    const aim = { yaw: 0, pitch: 0, spread: 10 };
    const policy: ShotOriginPolicy = { kind: "world", origin: [0, 0.9, 0] };
    const { projectiles } = createRange({ enemy: target([0, 0, 10]) }, [], undefined, undefined, undefined, { rng: () => {
      aim.yaw = Math.PI;
      aim.spread = 0;
      policy.origin[0] = 50;
      return 0;
    } });
    const result = projectiles.settleProjectile(projectiles.fireProjectile({ from: "shooter", via: { item: "pistol" }, aim, effect: "damage", originPolicy: policy }));
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.origin).toEqual([0, 0.9, 0]);
    expect(result.hits.map((hit) => hit.instanceId)).toEqual(["enemy"]);
  });
});

describe("GameContext projectile adopter", () => {
  const create = (seed: string, rng?: () => number) => createGameContext({
    definition: defineGameDefinition({ name: "Portable shooter", assets: createAssetCatalog(), multiplayer: "off" }),
    content: {
      itemById: () => ({ weapon: { damage: 5, pellets: 3, range: 20, spread: 10 } }),
      entityById: () => ({ stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } } }),
    },
    player: { userId: "shooter", isNew: true },
    seed,
    rng,
  });
  const shot = {
    from: "shooter",
    via: { item: "breacher" },
    aim: { yaw: 0, pitch: 0 },
    effect: "damage",
  };

  test("entity firing forwards caller-owned RNG and keeps center prediction pure", () => {
    let draws = 0;
    const ctx = create("unused", () => { draws++; return 0; });
    ctx.scene.entity.spawn("shooter", { id: "shooter", position: [0, 0, 0] });
    ctx.scene.entity.spawn("target", { id: "target", position: [0, 0, 10] });
    ctx.scene.entity.willHitProjectile(shot);
    expect(draws).toBe(0);
    const result = ctx.scene.entity.settleProjectile(ctx.scene.entity.fireProjectile(shot));
    expect(draws).toBe(6);
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.hits.map((hit) => hit.instanceId)).toEqual(["target", "target", "target"]);
    expect(ctx.scene.entity.stats.get("target", "health")?.current).toBe(85);
  });

  test("identically seeded worlds settle the same rays through the existing game API", () => {
    const fire = (seed: string) => {
      const ctx = create(seed);
      ctx.scene.entity.spawn("shooter", { id: "shooter", position: [0, 0, 0] });
      const result = ctx.scene.entity.settleProjectile(ctx.scene.entity.fireProjectile(shot));
      if (result.status !== "settled") throw new Error(result.reason);
      return result;
    };
    const first = fire("scrap-signal-authority");
    expect(first.origin).toEqual([0, 1.4, 0.35]);
    expect(fire("scrap-signal-authority")).toEqual(first);
    expect(fire("different-authority").at).not.toEqual(first.at);
  });

  test("Scrap Signal's entity API keeps a delayed Breacher shot independent of reused input", () => {
    const ctx = create("scrap-signal-delayed", () => 0);
    ctx.scene.entity.spawn("shooter", { id: "shooter", position: [0, 0, 0] });
    ctx.scene.entity.spawn("target", { id: "target", position: [0, 0, 10] });
    const input = { ...shot, aim: { yaw: 0, pitch: 0, spread: 10 }, originPolicy: { kind: "world" as const, origin: [0, 1.4, 0] as [number, number, number] } };
    const fired = ctx.scene.entity.fireProjectile(input);
    input.aim.yaw = Math.PI;
    input.aim.pitch = 1;
    input.aim.spread = 0;
    input.originPolicy.origin[0] = 50;
    const result = ctx.scene.entity.settleProjectile(fired);
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;
    expect(result.origin).toEqual([0, 1.4, 0]);
    expect(result.hits.map((hit) => hit.instanceId)).toEqual(["target", "target", "target"]);
    expect(ctx.scene.entity.stats.get("target", "health")?.current).toBe(85);
  });
});

test("a nonblocking receiver before cover takes the shot; receivers behind cover do not", () => {
  const { projectiles, stats } = createRange(
    { near: target([0, 0, 5]), behind: target([0, 0, 15]) }, [],
    [{ instanceId: "cover", catalogId: "wall", position: [0, 0.9, 10] }],
  );
  const result = projectiles.settleProjectile(projectiles.fireProjectile({
    from: "shooter", via: { item: "pistol" },
    aim: { origin: [0, 0.9, 0], direction: [0, 0, 1] }, effect: "damage",
  }));
  expect(result.status).toBe("settled");
  if (result.status !== "settled") return;
  expect(result.hits.map((hit) => hit.instanceId)).toEqual(["near"]);
  expect(stats.near!.health!.current).toBe(90);
  expect(stats.behind!.health!.current).toBe(100);
});

test("detached spread inputs still observe cover added after firing", () => {
  const objects: RangeObject[] = [];
  const { projectiles, stats } = createRange({ enemy: target([0, 0, 10]) }, [], objects, undefined, undefined, { rng: () => 0 });
  const shot = projectiles.fireProjectile({
    from: "shooter", via: { item: "pistol" }, aim: { yaw: 0, pitch: 0, spread: 10 },
    originPolicy: { kind: "world", origin: [0, 0.9, 0] }, effect: "damage",
  });
  objects.push({ instanceId: "late-cover", catalogId: "wall", position: [0, 0.9, 5] });
  const result = projectiles.settleProjectile(shot);
  expect(result.status).toBe("settled");
  if (result.status !== "settled") return;
  expect(result.hits).toEqual([]);
  expect(result.at[2]).toBeLessThan(10);
  expect(stats.enemy!.health!.current).toBe(100);
});

test("detached spread inputs still observe receiver LOS changed after firing", () => {
  const blocked: string[] = [];
  const { projectiles, stats } = createRange({ enemy: target([0, 0, 10]) }, blocked, undefined, undefined, undefined, { rng: () => 0 });
  const shot = projectiles.fireProjectile({
    from: "shooter", via: { item: "pistol" }, aim: { yaw: 0, pitch: 0, spread: 10 },
    originPolicy: { kind: "world", origin: [0, 0.9, 0] }, effect: "damage",
  });
  blocked.push("enemy");
  const result = projectiles.settleProjectile(shot);
  expect(result.status).toBe("settled");
  if (result.status !== "settled") return;
  expect(result.hits).toEqual([]);
  expect(stats.enemy!.health!.current).toBe(100);
});
