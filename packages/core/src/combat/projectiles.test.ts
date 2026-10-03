import { describe, expect, test } from "bun:test";
import type { ProjectileSettledEvent } from "../game/events";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { createEmptyEditorDocument } from "@jgengine/core/editor/document";
import { createEffectSystem, type CombatSpatialDeps, type ReceiveMap } from "@jgengine/core/combat/effects";
import { createProjectileSystem, type ProjectileSystemDeps, type ProjectileSettleReport } from "@jgengine/core/combat/projectiles";
import { createBallisticSweep, sweepMovingSphere, type BallisticSweep } from "@jgengine/core/physics/ballisticSweep";
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

describe("authoritative live projectile travel", () => {
  const aim = { origin: [0, 0.9, 0] as [number, number, number], direction: [0, 0, 1] as [number, number, number] };
  const input = () => ({ from: "shooter", via: { item: "pistol" }, aim: structuredClone(aim), effect: "damage", travel: { speed: 10, lifetime: 2 } });

  test("travels only when authority advances, rechecks moving poses, hits once and expires misses once", () => {
    const entities = { enemy: target([5, 0, 5]) };
    const { projectiles, reports, stats } = createRange(entities, [], undefined, undefined, undefined, { travel: { now: () => 0 } });
    const shot = projectiles.fireProjectile(input());
    expect(projectiles.settleProjectile(shot)).toEqual({ status: "rejected", shotId: shot, reason: "in-flight" });
    projectiles.advanceProjectiles(0.4, 0.4);
    expect(projectiles.activeProjectiles()[0]?.position).toEqual([0, 0.9, 4]);
    entities.enemy.position = [0, 0, 5];
    projectiles.advanceProjectiles(0.2, 0.6);
    expect(stats.enemy?.health?.current).toBe(90);
    expect(reports).toHaveLength(1);
    expect(projectiles.activeProjectiles()).toEqual([]);
    expect(projectiles.advanceProjectiles(10, 10)).toEqual([]);
    expect(reports).toHaveLength(1);
    const miss = projectiles.fireProjectile({ ...input(), aim: { origin: [20, 0.9, 0], direction: [0, 0, 1] } });
    projectiles.advanceProjectiles(2, 2);
    expect(reports).toHaveLength(2);
    expect(reports[1]?.hit).toBe(false);
    expect(projectiles.settleProjectile(miss)).toEqual({ status: "rejected", shotId: miss, reason: "already-settled" });
  });

  test("launch origin freezes before the shooter moves and cover wins before a receiver", () => {
    const entities = { shooter: target([0, 0, 0]), enemy: target([0, 0, 5]) };
    const { projectiles, stats, reports } = createRange(entities, [], [{ instanceId: "cover", catalogId: "wall", position: [0, 0.9, 2] }], undefined, undefined, { travel: { now: () => 0 } });
    const shot = input();
    shot.aim = { origin: [0, 0.9, 0], direction: [0, 0, 1] };
    projectiles.fireProjectile(shot);
    shot.travel.speed = 1000;
    shot.aim.origin[0] = 200;
    entities.shooter.position[0] = 200;
    projectiles.advanceProjectiles(1, 1);
    expect(stats.enemy?.health?.current).toBe(100);
    expect(reports[0]?.origin).toEqual([0, 0.9, 0]);
    expect(reports[0]?.at[2]).toBeCloseTo(1.5);
  });

  test("an injected relative sweep catches targets crossing between endpoints", () => {
    const { projectiles, stats } = createRange({ enemy: target([5, 0, 5]) }, [], undefined, undefined, undefined, {
      travel: { now: () => 0, sweep(from, to) {
        const fraction = sweepMovingSphere(from, to, [-5, 0.9, 5], [5, 0.9, 5], 0.5);
        return fraction === null ? null : { fraction, at: [0, 0.9, to[2] * fraction], target: { kind: "entity", instanceId: "enemy", distance: to[2] * fraction } };
      } },
    });
    projectiles.fireProjectile(input());
    projectiles.advanceProjectiles(1, 1);
    expect(stats.enemy?.health?.current).toBe(90);
  });

  test("snapshot and restore detach live state and reproduce force-driven travel", () => {
    const config: Partial<ProjectileSystemDeps> = { travel: { now: () => 0, acceleration: () => [2, 0, 0], sweep: () => null } };
    const { projectiles } = createRange({}, [], undefined, undefined, undefined, config);
    projectiles.fireProjectile({ ...input(), travel: { speed: 10, lifetime: 2, gravity: [0, -4, 0] } });
    projectiles.advanceProjectiles(0.5, 0.5);
    const state = projectiles.snapshot();
    projectiles.advanceProjectiles(0.5, 1);
    const expected = projectiles.snapshot();
    projectiles.restore(state);
    state.shots[0]!.flights![0]!.position = [999, 999, 999];
    projectiles.advanceProjectiles(0.5, 1);
    expect(projectiles.snapshot()).toEqual(expected);
    const views = projectiles.activeProjectiles();
    (views[0]!.position as number[])[0] = 999;
    expect(projectiles.activeProjectiles()[0]!.position[0]).toBe(1);
  });

  test("malicious finite environmental coupling cannot launch or atomically replace valid live flights", () => {
    let accelerationCalls = 0;
    const { projectiles, reports } = createRange({}, [], undefined, undefined, undefined, {
      travel: { now: () => 0, acceleration: () => { accelerationCalls += 1; return [2, 0, 0]; }, sweep: () => null },
    });
    const valid = { ...input(), travel: { speed: 10, lifetime: 2, windResponse: 1, maxAcceleration: 4 } };
    projectiles.fireProjectile(valid);
    projectiles.fireProjectile(valid);
    projectiles.advanceProjectiles(0.25, 0.25);
    const before = projectiles.snapshot();
    for (const field of ["windResponse", "maxAcceleration"] as const) {
      for (const malicious of [1e12 + 1, 1e308]) {
        expect(() => projectiles.fireProjectile({ ...valid, travel: { ...valid.travel, [field]: malicious } })).toThrow("between 0 and 1e12");
        expect(projectiles.snapshot()).toEqual(before);
        const poisoned = structuredClone(before);
        poisoned.shots[0]!.flights![0]!.position = [123, 456, 789];
        poisoned.shots[1]!.input.travel![field] = malicious;
        expect(() => projectiles.restore(poisoned)).toThrow("between 0 and 1e12");
        expect(projectiles.snapshot()).toEqual(before);
      }
    }
    expect(accelerationCalls).toBe(2);
    projectiles.advanceProjectiles(0.25, 0.5);
    expect(accelerationCalls).toBe(4);
    expect(projectiles.activeProjectiles().map(flight => flight.position)).toEqual([[0.25, 0.9, 5], [0.25, 0.9, 5]]);
    expect(reports).toEqual([]);
    expect(projectiles.fireProjectile({ ...valid, travel: { ...valid.travel, windResponse: 1e12, maxAcceleration: 1e12 } })).toBe("shot_3");
  });

  test("caps environmental acceleration without changing gravity or depending on presentation", () => {
    const { projectiles } = createRange({}, [], undefined, undefined, undefined, { travel: { now: () => 0, acceleration: () => [100, 0, 0], sweep: () => null } });
    projectiles.fireProjectile({ ...input(), travel: { speed: 10, lifetime: 2, maxAcceleration: 2, gravity: [0, -4, 0] } });
    projectiles.advanceProjectiles(1, 1);
    expect(projectiles.activeProjectiles()[0]?.position).toEqual([1, -1.1, 10]);
    expect(projectiles.activeProjectiles()[0]?.velocity).toEqual([2, -4, 10]);
  });

  test("shot and settlement budgets bound memory; new travel never uses a wall clock", () => {
    const { projectiles } = createRange({}, [], undefined, undefined, undefined, { now: () => { throw new Error("wall clock"); }, travel: { now: () => 0, maxActive: 1, maxRetained: 1 } });
    const first = projectiles.fireProjectile(input());
    expect(() => projectiles.fireProjectile(input())).toThrow("budget");
    projectiles.advanceProjectiles(2, 2);
    projectiles.fireProjectile(input());
    projectiles.advanceProjectiles(2, 2);
    expect(projectiles.snapshot().shots).toHaveLength(1);
    expect(projectiles.settleProjectile(first)).toEqual({ status: "rejected", shotId: first, reason: "unknown-shot" });
    expect(() => createRange({}).projectiles.fireProjectile(input())).toThrow("authoritative");
  });

  test("the actual fixed-step context sweeps onTick target motion, pauses, and restores live arrows", () => {
    const runner = createHeadlessRunner({
      definition: defineGameDefinition({ name: "Live moving targets", assets: createAssetCatalog(), multiplayer: "off", simulation: { hz: 10 }, physics: { gravity: 0, jumpVelocity: 0, projectileObstacles: true } }),
      maxStepSeconds: 1,
      content: {
        itemById: () => ({ weapon: { damage: 10, range: 50 } }),
        entityById: () => ({ stats: { health: { max: 100 } }, receive: { damage: { order: ["health"] } }, colliders: { hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 0.1 }, damageEligible: true }] } }),
      },
      loop: { onTick(ctx, dt) {
        const enemy = ctx.scene.entity.get("enemy");
        if (enemy !== null) ctx.scene.entity.setPose("enemy", { position: [enemy.position[0] + 10 * dt, 0.9, 0.5] });
      } },
    });
    const ctx = runner.ctx;
    ctx.scene.entity.spawn("enemy", { id: "enemy", position: [-0.5, 0.9, 0.5] });
    const reports: ProjectileSettledEvent[] = [];
    ctx.game.events.on("projectile.settled", report => reports.push(report));
    const shotId = ctx.scene.entity.fireProjectile(input());
    const state = ctx.state();
    const replay = runner.snapshot();
    ctx.time.pause();
    runner.step(0.1);
    expect(reports).toHaveLength(0);
    ctx.time.play();
    runner.step(0.1);
    expect(ctx.scene.entity.stats.get("enemy", "health")?.current).toBe(90);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.shotId).toBe(shotId);
    expect(reports[0]!.hits).toEqual([{ instanceId: "enemy", effect: "damage", applied: [{ statId: "health", delta: -10 }], lethal: false }]);
    const retainedHits = structuredClone(ctx.scene.entity.projectileState().shots[0]!.hits);
    reports[0]!.hits[0]!.applied[0]!.delta = -999;
    expect(ctx.scene.entity.projectileState().shots[0]!.hits).toEqual(retainedHits);
    ctx.restore(state);
    runner.step(0.1);
    expect(ctx.scene.entity.stats.get("enemy", "health")?.current).toBe(90);
    expect(reports).toHaveLength(2);
    runner.step(0.1);
    expect(reports).toHaveLength(2);
    runner.restore(replay);
    runner.step(0.1);
    expect(ctx.scene.entity.stats.get("enemy", "health")?.current).toBe(90);
    expect(reports).toHaveLength(3);
  });

  test("authored wind and force authority bends live arrows identically with cosmetic emitters disabled", () => {
    const run = (active: boolean, forceMask: number) => {
      const document = createEmptyEditorDocument();
      document.simulation = {
        weather: { wind: { direction: [1, 0], speed: 4, seed: "shared-clock" } },
        forces: [{ center: [0, 0, 0], shape: { kind: "sphere", radius: 100 }, strength: 2, attenuation: 0, directionality: 1, direction: [0, 1, 0], mask: 1 }],
        emitters: [{ id: "cosmetic", position: { x: 0, y: 0, z: 0 }, config: { max: active ? 64 : 1, rate: active ? 32 : 0 }, options: { active } }],
      };
      const runner = createHeadlessRunner({ definition: defineGameDefinition({ name: "Wind authority", assets: createAssetCatalog(), multiplayer: "off", simulation: { hz: 10 }, authoredDocument: document }), maxStepSeconds: 1 });
      runner.ctx.scene.entity.fireProjectile({ ...input(), travel: { speed: 10, lifetime: 2, windResponse: 1, maxAcceleration: 10, forceMask, gravity: [0, -4, 0] } });
      runner.step(0.1);
      return runner.ctx.scene.entity.activeProjectiles()[0]!;
    };
    const visible = run(true, 1);
    expect(run(false, 1)).toEqual(visible);
    expect(visible.position[0]).toBeCloseTo(0.02);
    expect(visible.position[1]).toBeCloseTo(0.89);
    expect(visible.position[2]).toBeCloseTo(1);
    expect(run(false, 0).position[1]).toBeCloseTo(0.88);
  });
});

describe("projectile restore policy", () => {
  const input = (radius = 0) => ({ from: "shooter", via: { item: "pistol" }, effect: "damage",
    aim: { origin: [0, 0.9, 0] as [number, number, number], direction: [0, 0, 1] as [number, number, number] },
    travel: { speed: 10, lifetime: 2, radius } });
  const wide = () => createRange({ enemy: target([0.75, 0, 3]) }, [], undefined, undefined, undefined, {
    travel: { now: () => 0, sweep(from, to, step) {
      const fraction = sweepMovingSphere(from, to, [0.75, 0.9, 3], [0.75, 0.9, 3], 0.5 + step.radius);
      return fraction === null ? null : { fraction,
        at: [from[0] + (to[0] - from[0]) * fraction, 0.9, from[2] + (to[2] - from[2]) * fraction],
        target: { kind: "entity", instanceId: "enemy", distance: 0 } };
    } },
  });
  function populated(maxPellets = 64) {
    const owner = createRange({}, [], undefined, undefined, undefined, { maxPellets, travel: { now: () => 0 } });
    owner.projectiles.settleProjectile(owner.projectiles.fireProjectile({ ...input(), travel: undefined }));
    owner.projectiles.fireProjectile(input());
    return owner;
  }

  test("cold radius restore rejects a missing sweep before changing active or retained shots", () => {
    const original = wide(); original.projectiles.fireProjectile(input(1));
    const saved = JSON.parse(JSON.stringify(original.projectiles.snapshot()));
    const cold = populated(); const before = cold.projectiles.snapshot();
    expect(() => cold.projectiles.fireProjectile(input(1))).toThrow("radius-aware sweep");
    expect(() => cold.projectiles.restore(saved)).toThrow("radius-aware sweep");
    expect(cold.projectiles.snapshot()).toEqual(before);
    expect(cold.projectiles.fireProjectile(input())).toBe("shot_3");
  });

  test("a valid wider pellet snapshot cannot bypass the receiving owner's per-shot limit", () => {
    const original = createRange({}, [], undefined, undefined, undefined, {
      maxPellets: 8, getStat: (_item, stat) => stat === "pellets" ? 8 : stat === "range" ? 50 : null,
      travel: { now: () => 0 },
    });
    original.projectiles.fireProjectile(input());
    const saved = JSON.parse(JSON.stringify(original.projectiles.snapshot()));
    expect(saved.shots[0].flights).toHaveLength(8);
    const cold = populated(1); const before = cold.projectiles.snapshot();
    expect(() => cold.projectiles.restore(saved)).toThrow("pellet");
    expect(cold.projectiles.snapshot()).toEqual(before);
  });

  test("inconsistent captured pellet counts reject atomically", () => {
    const original = populated(); const saved = original.projectiles.snapshot();
    for (const count of [0, -1, 1.5, NaN, Infinity, 257]) {
      const invalid = structuredClone(saved); invalid.shots[1]!.pellets = count;
      invalid.shots[0]!.input.aim = { yaw: 1, pitch: 1 };
      expect(() => original.projectiles.restore(invalid)).toThrow("pellet");
      expect(original.projectiles.snapshot()).toEqual(saved);
    }
  });

  test("missing, extra and non-travel flights reject without dropping valid pending work", () => {
    const original = populated(); const saved = original.projectiles.snapshot();
    for (const change of [
      (shot: typeof saved.shots[number]) => { shot.flights = []; },
      (shot: typeof saved.shots[number]) => { shot.flights!.push(structuredClone(shot.flights![0]!)); },
      (shot: typeof saved.shots[number]) => { delete shot.flights; },
      (shot: typeof saved.shots[number]) => { delete shot.input.travel; },
    ]) {
      const invalid = structuredClone(saved); change(invalid.shots[1]!);
      expect(() => original.projectiles.restore(invalid)).toThrow("flight");
      expect(original.projectiles.snapshot()).toEqual(saved);
    }
  });

  test("extra saved cone samples cannot bypass the per-shot work bound", () => {
    const original = populated(); const saved = original.projectiles.snapshot();
    const invalid = structuredClone(saved); invalid.shots[1]!.coneSamples = [[0, 0], [0, 0]];
    expect(() => original.projectiles.restore(invalid)).toThrow("sample count");
    expect(original.projectiles.snapshot()).toEqual(saved);
  });

  test("compatible cold radius restore preserves real off-center impact and exactly one settlement", () => {
    const original = wide(); original.projectiles.fireProjectile(input(1));
    const cold = wide(); cold.projectiles.restore(JSON.parse(JSON.stringify(original.projectiles.snapshot())));
    const saved = cold.projectiles.snapshot(); saved.shots[0]!.flights![0]!.position[0] = 999;
    for (const owner of [original, cold]) {
      owner.projectiles.advanceProjectiles(0.4, 0.4);
      owner.projectiles.advanceProjectiles(1, 1.4);
      expect(owner.stats.enemy!.health!.current).toBe(90);
      expect(owner.reports).toHaveLength(1);
      expect(owner.reports[0]!.shotId).toBe("shot_1");
    }
    expect(cold.projectiles.snapshot()).toEqual(original.projectiles.snapshot());
    expect(cold.reports).toEqual(original.reports);
  });

  test("compatible cold centerline restore keeps cover ahead of a receiver", () => {
    const create = () => createRange({ enemy: target([0, 0, 5]) }, [],
      [{ instanceId: "cover", catalogId: "wall", position: [0, 0.9, 2] }],
      undefined, undefined, { travel: { now: () => 0 } });
    const original = create(); original.projectiles.fireProjectile(input());
    const cold = create(); cold.projectiles.restore(JSON.parse(JSON.stringify(original.projectiles.snapshot())));
    for (const owner of [original, cold]) {
      owner.projectiles.advanceProjectiles(1, 1);
      expect(owner.stats.enemy!.health!.current).toBe(100);
      expect(owner.reports).toHaveLength(1);
      expect(owner.reports[0]!.hits).toEqual([]);
      expect(owner.reports[0]!.at[2]).toBeCloseTo(1.5);
    }
    expect(cold.projectiles.snapshot()).toEqual(original.projectiles.snapshot());
  });

  test("compatible cold moving-target impacts settle death and loot once through the game API", () => {
    const create = () => createHeadlessRunner({
      definition: defineGameDefinition({ name: "Cold live loot", assets: createAssetCatalog(), multiplayer: "off",
        simulation: { hz: 10 }, inventories: { backpack: { slots: 9 } },
        physics: { gravity: 0, jumpVelocity: 0, projectileObstacles: true } }),
      player: { userId: "shooter", isNew: true }, maxStepSeconds: 1,
      content: {
        itemById: () => ({ weapon: { damage: 10, range: 50 } }),
        entityById: id => ({ stats: { health: { max: id === "enemy" ? 10 : 100 } }, receive: { damage: { order: ["health"] } },
          ...(id === "enemy" ? { onDeath: { drops: [{ table: "reward", when: { reason: "player_kill" } }] } } : {}),
          colliders: { hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 0.1, offset: [0, 0.9, 0] } }] } }),
      },
      loop: { onTick(ctx, dt) {
        const enemy = ctx.scene.entity.get("enemy");
        if (enemy !== null) ctx.scene.entity.setPose("enemy", { position: [enemy.position[0] + 10 * dt, 0, 0.5] });
      } },
    });
    const live = create();
    live.ctx.scene.entity.spawn("hero", { id: "shooter", position: [0, 0, 0] });
    live.ctx.scene.entity.spawn("enemy", { id: "enemy", position: [-0.5, 0, 0.5] });
    live.ctx.scene.entity.fireProjectile(input());
    const saved = JSON.parse(JSON.stringify(live.ctx.state()));
    const cold = create(); cold.ctx.restore(saved);
    for (const runner of [live, cold]) {
      const settled: ProjectileSettledEvent[] = [], deaths: unknown[] = [], grants: unknown[] = [];
      runner.ctx.game.loot.register({ id: "reward", entries: [{ item: "proof-token", count: 2, weight: 1 }] });
      runner.ctx.game.events.on("projectile.settled", event => settled.push(event));
      runner.ctx.game.events.on("entity.died", event => deaths.push(event));
      runner.ctx.game.events.on("loot.granted", event => grants.push(event));
      runner.step(0.1); runner.step(1);
      expect(runner.ctx.scene.entity.get("enemy")).toBeNull();
      expect(runner.ctx.player.inventory.count("backpack", "proof-token")).toBe(2);
      expect(deaths).toHaveLength(1); expect(grants).toHaveLength(1); expect(settled).toHaveLength(1);
      expect(settled[0]!.hits[0]!.lethal).toBe(true);
      expect(settled[0]!.shotId).toBe("shot_1");
      expect(runner.ctx.scene.entity.activeProjectiles()).toEqual([]);
    }
    expect(cold.ctx.scene.entity.projectileState()).toEqual(live.ctx.scene.entity.projectileState());
  });

  test("zero retained budget preserves every compatible restored completion", () => {
    const original = createRange({}, [], undefined, undefined, undefined, { travel: { now: () => 0, maxActive: 3, maxRetained: 0 } });
    for (let i = 0; i < 3; i++) original.projectiles.fireProjectile(input());
    const cold = createRange({}, [], undefined, undefined, undefined, { travel: { now: () => 0, maxActive: 3, maxRetained: 0 } });
    cold.projectiles.restore(JSON.parse(JSON.stringify(original.projectiles.snapshot())));
    const results = cold.projectiles.advanceProjectiles(2, 2);
    expect(results.map(result => result.shotId)).toEqual(["shot_1", "shot_2", "shot_3"]);
    expect(cold.reports.map(report => report.shotId)).toEqual(["shot_1", "shot_2", "shot_3"]);
    expect(cold.projectiles.snapshot().shots).toEqual([]);
    expect(cold.projectiles.advanceProjectiles(2, 4)).toEqual([]);
  });
});

describe("projectile system", () => {
  test("zero-magnitude live contacts defer game damage policy until the actual impact target", () => {
    const { projectiles, stats, reports } = createRange({ interceptor: target([0, 0, 3]), intended: target([0, 0, 8]) }, [], undefined, undefined, undefined, { travel: { now: () => 0 } });
    const id = projectiles.fireProjectile({ from: "shooter", effect: "damage", via: { item: "pistol", amount: 0 }, aim: { origin: [0, 0.9, 0], direction: [0, 0, 1] }, travel: { speed: 10, lifetime: 2 } });
    projectiles.advanceProjectiles(0.5, 0.5);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.shotId).toBe(id);
    expect(reports[0]!.hits).toEqual([{ instanceId: "interceptor", effect: "damage", applied: [], lethal: false }]);
    expect(stats.interceptor!.health!.current).toBe(100);
    expect(stats.intended!.health!.current).toBe(100);
    projectiles.advanceProjectiles(1, 1.5);
    expect(reports).toHaveLength(1);
  });
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
