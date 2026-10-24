import { describe, expect, test } from "bun:test";
import { createEffectSystem, type CombatSpatialDeps, type ReceiveMap } from "./effects";
import { createProjectileSystem, type ProjectileSettleReport } from "./projectiles";
import {
  DEFAULT_SHOT_RANGE,
  DEFAULT_SHOT_RADIUS,
  DEFAULT_SHOT_SPEED,
  SHOT_GRAVITY,
  resolveShotSpec,
  shotArc,
  shotFalloffAt,
  shotHitOutcome,
  shotSpecFromStats,
  type ShotSpec,
} from "./shotSpec";
import { seedStatValues, type StatCatalog } from "../scene/entityStats";
import { distanceBetween } from "../scene/spatial";

interface RangeEntity {
  stats: StatCatalog;
  receive: ReceiveMap;
  position: [number, number, number];
}

const target = (position: [number, number, number]): RangeEntity => ({
  stats: { health: { max: 100 } },
  receive: { damage: { order: ["health"] } },
  position,
});

function createRange(entities: Record<string, RangeEntity>) {
  const stats: Record<string, ReturnType<typeof seedStatValues>> = {};
  for (const [instanceId, entity] of Object.entries(entities)) stats[instanceId] = seedStatValues(entity.stats);
  const spatial: CombatSpatialDeps = {
    inRadius: (center, radius) => Object.keys(entities).filter((instanceId) => distanceBetween(center, entities[instanceId]!.position) <= radius),
    hasLineOfSight: () => true,
    positionOf: (instanceId) => entities[instanceId]?.position,
  };
  const getStat = () => null;
  const effects = createEffectSystem({
    resolveReceive: (instanceId) => entities[instanceId]?.receive,
    resolveStats: (instanceId) => stats[instanceId],
    getStat,
    spatial,
  });
  const reports: ProjectileSettleReport[] = [];
  const projectiles = createProjectileSystem({ effects, spatial, getStat, now: () => 0, onSettle: (report) => reports.push(report) });
  return { projectiles, stats, reports };
}

const aim = (direction: [number, number, number], origin: [number, number, number] = [0, 0, 0]) => ({
  origin,
  direction,
});

/** The nine archetypes Jon named, each written as data and asserted by what it does. */
describe("every weapon is a shot spec", () => {
  test("rifle: instant trace with falloff over distance", () => {
    const rifle = resolveShotSpec({
      delivery: { kind: "trace", range: 120 },
      contact: { damage: { type: "kinetic", base: 24 }, falloff: { start: 25, end: 75, endScale: 0.4 } },
    });
    expect(rifle.mode).toBe("trace");
    expect(rifle.trace).toEqual({ range: 120 });
    expect(rifle.contact.splash).toBeNull();
    expect(shotFalloffAt(rifle, 10)).toBeCloseTo(1);
    expect(shotFalloffAt(rifle, 50)).toBeCloseTo(0.7);
    expect(shotFalloffAt(rifle, 500)).toBeCloseTo(0.4);
    expect(shotHitOutcome(rifle, 50, 0)).toEqual({ applies: true, scale: 0.7 });
    expect(shotHitOutcome(rifle, 50, 1).applies).toBe(false);
  });

  test("sniper: instant trace punching through two extra targets", () => {
    const sniper = resolveShotSpec({
      delivery: { kind: "trace", range: 300 },
      contact: { damage: { type: "kinetic", base: 90 }, penetration: { count: 2 } },
    });
    expect(sniper.mode).toBe("trace");
    expect(shotHitOutcome(sniper, 80, 0)).toEqual({ applies: true, scale: 1 });
    expect(shotHitOutcome(sniper, 80, 1)).toEqual({ applies: true, scale: 1 });
    expect(shotHitOutcome(sniper, 80, 2)).toEqual({ applies: true, scale: 1 });
    expect(shotHitOutcome(sniper, 80, 3)).toEqual({ applies: false, scale: 0 });
  });

  test("grenade: a lobbed body on a 2 s fuse, bounces and splashes", () => {
    const grenade = resolveShotSpec({
      delivery: { kind: "body", speed: 12, gravity: 0.5, fuse: 2, radius: 0.1 },
      contact: { splash: { radius: 5 }, ricochet: { count: 1 } },
    });
    expect(grenade.mode).toBe("body");
    expect(grenade.body!.fuse).toBe(2);
    expect(grenade.contact.splash).toEqual({ radius: 5, falloff: "linear", damageScale: 1 });
    expect(grenade.contact.ricochet!.count).toBe(1);
    const arc = shotArc(grenade, [0, 1.5, 0], [0, Math.SQRT1_2, Math.SQRT1_2]);
    expect(arc.flightTime).toBeCloseTo(2);
    expect(arc.landing[1]).toBeCloseTo(1.5 + 8.485 * 2 - 0.5 * 4.9 * 4);
    expect(arc.landing[2]).toBeCloseTo(Math.SQRT1_2 * 12 * 2);
  });

  test("grenade launcher: a fast flat body that bursts on the first contact", () => {
    const launcher = resolveShotSpec({
      delivery: { kind: "body", speed: 60, gravity: 0, range: 90 },
      contact: { splash: { radius: 4 } },
    });
    expect(launcher.body!.fuse).toBe("impact");
    const arc = shotArc(launcher, [0, 1, 0], [0, 0, 1]);
    expect(arc.flightTime).toBeCloseTo(1.5);
    expect(arc.landing[2]).toBeCloseTo(90);
    expect(arc.apex).toBe(0);
  });

  test("mortar: a slow high arc that drops onto the ground", () => {
    const mortar = resolveShotSpec({
      delivery: { kind: "body", speed: 40, gravity: 2, range: 100 },
      contact: { splash: { radius: 6 } },
    });
    const arc = shotArc(mortar, [0, 0, 0], [0, 0.6, 0.8]);
    const rise = 0.6 * 40;
    const acceleration = SHOT_GRAVITY * 2;
    expect(arc.gravity).toBeCloseTo(19.6);
    expect(arc.apex).toBeCloseTo(rise * rise / (2 * acceleration));
    expect(arc.apex).toBeGreaterThan(14);
    expect(arc.flightTime).toBeCloseTo(2 * rise / acceleration);
    expect(arc.landing[1]).toBeCloseTo(0);
  });

  test("slow explosive: a drifting body that times out and splashes wide", () => {
    const slow = resolveShotSpec({
      delivery: { kind: "body", speed: 6, fuse: 3, radius: 0.4 },
      contact: { splash: { radius: 6, falloff: "none" } },
    });
    const arc = shotArc(slow, [0, 1.2, 0], [0, 0, 1]);
    expect(arc.flightTime).toBeCloseTo(3);
    expect(arc.landing[2]).toBeCloseTo(18);
    expect(arc.landing[1]).toBeCloseTo(1.2);
    expect(slow.contact.splash!.falloff).toBe("none");
  });

  test("hitscan explosive: an instant trace that splashes, never a lobbed body", () => {
    const explosive = resolveShotSpec({
      delivery: { kind: "trace", range: 50 },
      contact: { damage: { type: "kinetic", base: 10 }, splash: { radius: 4 } },
    });
    expect(explosive.mode).toBe("trace");
    expect(explosive.body).toBeNull();
    expect(explosive.contact.splash!.radius).toBe(4);
    expect(explosive.contact.falloff).toBeNull();
  });

  test("arrow: a slow body that drops over distance", () => {
    const arrow = resolveShotSpec({ delivery: { kind: "body", speed: 45, gravity: 1, range: 80 } });
    const range = 80;
    const flight = range / 45;
    const arc = shotArc(arrow, [0, 20, 0], [0, 0, 1]);
    expect(arc.landing[2]).toBeCloseTo(range);
    expect(20 - arc.landing[1]).toBeCloseTo(0.5 * SHOT_GRAVITY * flight * flight);
    expect(20 - arc.landing[1]).toBeGreaterThan(15);
  });

  test("fast steel arrow: a quick body with little gravity that punches through one target", () => {
    const steel = resolveShotSpec({
      delivery: { kind: "body", speed: 120, gravity: 0.15, range: 60 },
      contact: { damage: { type: "kinetic", base: 70 }, penetration: { count: 1 } },
    });
    const flight = 60 / 120;
    const arc = shotArc(steel, [0, 20, 0], [0, 0, 1]);
    expect(20 - arc.landing[1]).toBeCloseTo(0.5 * SHOT_GRAVITY * 0.15 * flight * flight);
    expect(20 - arc.landing[1]).toBeLessThan(0.2);
    expect(shotHitOutcome(steel, 60, 1).applies).toBe(true);
    expect(shotHitOutcome(steel, 60, 2).applies).toBe(false);
  });
});

describe("defaults keep a plain gun three lines", () => {
  test("a trace with damage needs no other field", () => {
    const spec: ShotSpec = { delivery: { kind: "trace" }, contact: { damage: { type: "kinetic", base: 24 } } };
    const gun = resolveShotSpec(spec);
    expect(gun.mode).toBe("trace");
    expect(gun.range).toBe(DEFAULT_SHOT_RANGE);
    expect(gun.contact.penetration).toEqual({ count: 0, keepDamage: true });
    expect(gun.contact.splash).toBeNull();
    expect(gun.contact.falloff).toBeNull();
  });

  test("a body with no fields flies straight at the default speed", () => {
    const gun = resolveShotSpec({ delivery: { kind: "body" } });
    expect(gun.body).toEqual({
      speed: DEFAULT_SHOT_SPEED,
      gravity: 0,
      drag: 0,
      lifetime: DEFAULT_SHOT_RANGE / DEFAULT_SHOT_SPEED,
      radius: DEFAULT_SHOT_RADIUS,
      fuse: "impact",
      homing: 0,
    });
  });

  test("a trace has no trajectory and says so", () => {
    const rifle = resolveShotSpec({ delivery: { kind: "trace" } });
    expect(() => shotArc(rifle, [0, 0, 0], [0, 0, 1])).toThrow(/trajectory/);
  });

  test("penetration that does not keep damage leaves later targets unharmed", () => {
    const shot = resolveShotSpec({
      delivery: { kind: "trace" },
      contact: { damage: { type: "kinetic", base: 10 }, penetration: { count: 2, keepDamage: false } },
    });
    expect(shotHitOutcome(shot, 5, 0).scale).toBe(1);
    expect(shotHitOutcome(shot, 5, 1).scale).toBe(0);
    expect(shotHitOutcome(shot, 5, 3).applies).toBe(false);
  });

  test("old numeric stats adapt once, and a splash radius never makes a trace a body", () => {
    const stats = (values: Record<string, number>) => (stat: string) => values[stat] ?? null;
    expect(resolveShotSpec(shotSpecFromStats(stats({ damage: 10, range: 50, "explosion.radius": 6 }))).mode).toBe("trace");
    const grenade = resolveShotSpec(shotSpecFromStats(stats({ "projectile.speed": 10, "projectile.fuseTime": 2, "explosion.radius": 6 })));
    expect(grenade.mode).toBe("body");
    expect(grenade.body!.fuse).toBe(2);
    expect(grenade.contact.splash!.radius).toBe(6);
  });
});

describe("firing paths read the spec", () => {
  test("a 2 s fuse flies past a target at 5 m and detonates at the landing point", () => {
    const entities = { near: target([0, 0, 5]), far: target([0, 0, 20]) };
    const { projectiles, stats } = createRange(entities);
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { amount: 40 },
      aim: aim([0, 0, 1]),
      effect: "damage",
      spec: { delivery: { kind: "body", speed: 10, gravity: 0, fuse: 2 }, contact: { splash: { radius: 4 } } },
    });
    const settled = projectiles.settleProjectile(shotId);
    expect(settled.status).toBe("settled");
    expect(stats.near?.health?.current).toBe(100);
    expect(stats.far?.health?.current).toBe(60);
  });

  test("the same body on an impact fuse hits what it meets first", () => {
    const entities = { near: target([0, 0, 5]), far: target([0, 0, 20]) };
    const { projectiles, stats } = createRange(entities);
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { amount: 40 },
      aim: aim([0, 0, 1]),
      effect: "damage",
      spec: { delivery: { kind: "body", speed: 10, gravity: 0 }, contact: { splash: { radius: 4 } } },
    });
    projectiles.settleProjectile(shotId);
    expect(stats.near?.health?.current).toBeLessThan(100);
    expect(stats.far?.health?.current).toBe(100);
    expect(stats.near?.health?.current).toBeGreaterThan(60);
  });

  test("#2272: a trace with splash lands on the same tick and hits everything inside it", () => {
    const entities = { left: target([-2, 0, 20]), right: target([2, 0, 20]), behind: target([0, 0, 40]) };
    const { projectiles, stats, reports } = createRange(entities);
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { amount: 25 },
      aim: aim([0, 0, 1]),
      effect: "damage",
      spec: { delivery: { kind: "trace", range: 20 }, contact: { splash: { radius: 3 } } },
    });
    expect(projectiles.activeProjectiles()).toEqual([]);
    expect(projectiles.settleProjectile(shotId)).toEqual({
      status: "settled",
      shotId,
      at: [0, 0, 20],
      origin: [0, 0, 0],
      hits: expect.any(Array),
    });
    expect(stats.left?.health?.current).toBeCloseTo(100 - 25 / 3);
    expect(stats.right?.health?.current).toBeCloseTo(100 - 25 / 3);
    expect(stats.behind?.health?.current).toBe(100);
    expect(reports[0]?.ballistic).toBe(false);
  });

  test("penetration resolves every target the ray meets, in order", () => {
    const entities = { first: target([0, 0, 5]), second: target([0, 0, 10]), third: target([0, 0, 15]) };
    const { projectiles, stats } = createRange(entities);
    const shotId = projectiles.fireProjectile({
      from: "shooter",
      via: { amount: 20 },
      aim: aim([0, 0, 1]),
      effect: "damage",
      spec: { delivery: { kind: "trace", range: 30 }, contact: { damage: { type: "kinetic", base: 20 }, penetration: { count: 1 } } },
    });
    projectiles.settleProjectile(shotId);
    expect(stats.first?.health?.current).toBe(80);
    expect(stats.second?.health?.current).toBe(80);
    expect(stats.third?.health?.current).toBe(100);
  });
});
