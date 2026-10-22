import { describe, expect, test } from "bun:test";

import { devtools } from "../devtools/devtools";
import { seededRng } from "../random/rng";
import { createDamageRuntime, type DamageRuntime } from "./damageRuntime";
import type { DamageTableDef } from "./damageTable";
import type { HitZoneTable } from "./hitZones";
import type { WeaponDefinition } from "./weaponDefinition";
import { createWeaponSystem, type WeaponSystemDeps } from "./weaponSystem";

const damageTable: DamageTableDef = {
  types: [{ id: "kinetic", vs: { flesh: 1, armor: 0.5 } }],
  armor: { halfValue: 100, maxMitigation: 0.9 },
};

const zones: HitZoneTable = {
  zones: [
    { id: "body", multiplier: 1 },
    { id: "head", multiplier: 1.5 },
  ],
  defaultZone: "body",
};

function damageModel(): DamageRuntime {
  const model = createDamageRuntime({ table: damageTable, zones, rng: () => 0.99 });
  model.registerTarget("raider", { resistance: "flesh", armor: 0 });
  return model;
}

const BASE: WeaponDefinition = {
  id: "fixture.base",
  roundsPerMinute: 600,
  fireMode: "auto",
  delivery: { kind: "hitscan", maxRange: 60 },
  magazine: { capacity: 30, reloadMs: 2_000, reserve: 90 },
  handling: {
    spread: { base: 0.002, perShot: 0.0015, max: 0.012, recoverRate: 0.02, recoverDelay: 0.15 },
    recoil: { pattern: [[0.008, 0], [0.009, -0.002], [0.01, 0.002]], recoverRate: 0.6, recoverDelay: 0.12 },
  },
  damage: { type: "kinetic", base: 20 },
};

function fixture(patch: Partial<WeaponDefinition> = {}): WeaponDefinition {
  return { ...BASE, ...patch };
}

const STILL_SPREAD = { spread: { base: 0 } };

function hitscanAt(distance: number, zone?: string): NonNullable<WeaponSystemDeps["raycast"]> {
  return (from, direction) => ({
    target: "raider",
    point: [from[0] + direction[0] * distance, from[1] + direction[1] * distance, from[2] + direction[2] * distance],
    ...(zone === undefined ? {} : { zone }),
  });
}

function planeAt(distance: number, zone?: string): NonNullable<WeaponSystemDeps["sweep"]> {
  return (from, to) => {
    if (from[2] > distance || to[2] < distance || to[2] === from[2]) return null;
    const f = (distance - from[2]) / (to[2] - from[2]);
    return {
      target: "raider",
      point: [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, distance],
      ...(zone === undefined ? {} : { zone }),
    };
  };
}

function makeDeps(patch: Partial<WeaponSystemDeps> = {}): WeaponSystemDeps {
  return {
    rng: seededRng("lane-b-b2.3"),
    damage: damageModel(),
    origin: () => [0, 1.5, 0],
    raycast: () => null,
    sweep: () => null,
    ...patch,
  };
}

describe("fire modes and cadence", () => {
  test("a held trigger fires at the definition's rate and empties the magazine", () => {
    const weapon = createWeaponSystem(fixture(), makeDeps({ raycast: hitscanAt(20) }));
    const shotTimes: number[] = [];
    let t = 0;
    weapon.setTrigger(true);
    for (let i = 0; i < 200; i += 1) {
      t += 1 / 60;
      const result = weapon.tick(1 / 60);
      for (let shot = 0; shot < result.shots.length; shot += 1) shotTimes.push(t);
    }
    expect(shotTimes.length).toBe(30);
    expect(weapon.ammo().loaded).toBe(0);
    expect(weapon.stats().shots).toBe(30);
    // 600 rpm = 100 ms between shots, so the 30th shot lands 2.9 s after the first.
    expect(shotTimes[29]! - shotTimes[0]!).toBeCloseTo(2.9, 1);
    expect(weapon.ammo().reload).toBe("reloading");
    expect(weapon.stats().dryPulls).toBe(1);
  });

  test("single fire takes one shot per press, not per tick", () => {
    const weapon = createWeaponSystem(fixture({ fireMode: "single" }), makeDeps({ raycast: hitscanAt(20) }));
    weapon.setTrigger(true);
    let shots = 0;
    for (let i = 0; i < 60; i += 1) shots += weapon.tick(1 / 60).shots.length;
    expect(shots).toBe(1);

    weapon.setTrigger(false);
    weapon.setTrigger(true);
    for (let i = 0; i < 60; i += 1) shots += weapon.tick(1 / 60).shots.length;
    expect(shots).toBe(2);
  });

  test("a burst fires its committed count, then waits for a fresh pull", () => {
    const weapon = createWeaponSystem(
      fixture({ fireMode: "burst", burst: { count: 3 } }),
      makeDeps({ raycast: hitscanAt(20) }),
    );
    weapon.setTrigger(true);
    let shots = 0;
    for (let i = 0; i < 60; i += 1) shots += weapon.tick(1 / 60).shots.length;
    expect(shots).toBe(3);
    expect(weapon.ammo().burstRemaining).toBe(0);

    for (let i = 0; i < 60; i += 1) shots += weapon.tick(1 / 60).shots.length;
    expect(shots).toBe(3);

    weapon.setTrigger(false);
    weapon.setTrigger(true);
    for (let i = 0; i < 60; i += 1) shots += weapon.tick(1 / 60).shots.length;
    expect(shots).toBe(6);
    expect(weapon.stats().burstPulls).toBe(2);
  });

  test("one tick catches up at most maxShotsPerTick shots", () => {
    const weapon = createWeaponSystem(fixture(), makeDeps({ raycast: hitscanAt(20), maxShotsPerTick: 2 }));
    weapon.setTrigger(true);
    expect(weapon.tick(1).shots.length).toBe(2);
    expect(weapon.tick(1).shots.length).toBe(2);
    // The remaining budget is kept, not thrown away.
    expect(weapon.stats().shots).toBe(4);
  });
});

describe("recoil and bloom", () => {
  test("recoil climbs the real aim vector, each shot flies down it, and it settles", () => {
    const weapon = createWeaponSystem(fixture(), makeDeps({ raycast: hitscanAt(20) }));
    weapon.setAim(0, 0);
    expect(weapon.aim().pitch).toBe(0);

    weapon.setTrigger(true);
    const directions: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      for (const shot of weapon.tick(1 / 60).shots) directions.push(shot.directions[0]![1]);
    }
    const climb = weapon.aim().pitch;
    expect(climb).toBeGreaterThan(0.02);
    expect(weapon.aim().yaw).not.toBe(0);
    // Every shot left along the aim it had already kicked to, not the pre-recoil aim.
    expect(directions.every((y) => y > 0)).toBe(true);
    expect(directions[directions.length - 1]!).toBeGreaterThan(directions[0]!);

    weapon.setTrigger(false);
    let settleSeconds = 0;
    const peak = weapon.aim().pitch;
    for (let i = 0; i < 120; i += 1) {
      settleSeconds += 1 / 60;
      weapon.tick(1 / 60);
      if (Math.abs(weapon.aim().pitch) <= Math.abs(peak) * 0.05) break;
    }
    expect(settleSeconds).toBeLessThan(1);
    expect(Math.abs(weapon.aim().pitch)).toBeLessThan(Math.abs(peak) * 0.05);
    expect(Math.abs(weapon.aim().yaw)).toBeLessThan(0.002);
  });

  test("spread blooms per shot to its cap and decays back to base", () => {
    const weapon = createWeaponSystem(fixture(), makeDeps({ raycast: hitscanAt(20) }));
    weapon.setTrigger(true);
    const spreads: number[] = [];
    for (let i = 0; i < 180 && spreads.length < 30; i += 1) {
      for (const shot of weapon.tick(1 / 60).shots) spreads.push(shot.spread);
    }
    expect(spreads.length).toBe(30);
    expect(spreads[0]!).toBeCloseTo(0.002, 6);
    for (let i = 1; i < 7; i += 1) expect(spreads[i]!).toBeGreaterThan(spreads[i - 1]!);
    expect(spreads[29]!).toBeCloseTo(0.012, 6);

    weapon.setTrigger(false);
    for (let i = 0; i < 60; i += 1) weapon.tick(1 / 60);
    expect(weapon.handling().frame().spread).toBeCloseTo(0.002, 6);
  });

  test("spread comes from the injected RNG only", () => {
    const fire = (seed: string): number[] => {
      const weapon = createWeaponSystem(
        fixture({ handling: { spread: { base: 0.02 } } }),
        makeDeps({ rng: seededRng(seed), raycast: hitscanAt(20) }),
      );
      const dirs: number[] = [];
      weapon.setTrigger(true);
      for (let i = 0; i < 10; i += 1) {
        for (const shot of weapon.tick(1 / 60).shots) dirs.push(shot.directions[0]![0], shot.directions[0]![1]);
      }
      return dirs;
    };
    expect(fire("seed-a")).toEqual(fire("seed-a"));
    expect(fire("seed-a")).not.toEqual(fire("seed-b"));
  });

  test("zero spread fires the aim direction and draws no randomness", () => {
    const rng = seededRng("no-draws");
    const before = rng.state();
    const weapon = createWeaponSystem(
      fixture({ handling: STILL_SPREAD }),
      makeDeps({ rng, raycast: hitscanAt(20) }),
    );
    weapon.setTrigger(true);
    const shot = weapon.tick(1 / 60).shots[0]!;
    expect(shot.directions[0]![0]).toBe(0);
    expect(shot.directions[0]![1]).toBe(0);
    expect(shot.directions[0]![2]).toBeCloseTo(1, 12);
    expect(rng.state()).toBe(before);
  });
});

describe("delivery", () => {
  test("hitscan and projectile land the same number through the damage runtime", () => {
    const model = damageModel();
    const ray = createWeaponSystem(fixture({ damage: { type: "kinetic", base: 20 } }), makeDeps({ damage: model, raycast: hitscanAt(20, "head") }));
    ray.setTrigger(true);
    const hitscan = ray.tick(1 / 60).impacts[0]!;

    const bullet = createWeaponSystem(
      fixture({
        handling: STILL_SPREAD,
        delivery: { kind: "projectile", speed: 60, lifetime: 2 },
        damage: { type: "kinetic", base: 20 },
      }),
      makeDeps({ damage: model, sweep: planeAt(20, "head") }),
    );
    bullet.setTrigger(true);
    bullet.tick(1 / 60);
    let projectile;
    for (let i = 0; i < 60 && projectile === undefined; i += 1) projectile = bullet.tick(1 / 60).impacts[0];
    expect(projectile).toBeDefined();
    expect(projectile!.resolution.damage).toBe(hitscan.resolution.damage);
    expect(hitscan.resolution.damage).toBeCloseTo(30, 10);
    expect(projectile!.zone).toBe("head");
    expect(projectile!.distance).toBeCloseTo(20, 6);
  });

  test("falloff scales the hit by distance, not at the muzzle", () => {
    const model = damageModel();
    const near = createWeaponSystem(
      fixture({ falloff: { start: 10, end: 40, endScale: 0.4 } }),
      makeDeps({ damage: model, raycast: hitscanAt(5) }),
    );
    near.setTrigger(true);
    expect(near.tick(1 / 60).impacts[0]!.resolution.damage).toBeCloseTo(20, 10);

    const far = createWeaponSystem(
      fixture({ falloff: { start: 10, end: 40, endScale: 0.4 } }),
      makeDeps({ damage: model, raycast: hitscanAt(30) }),
    );
    far.setTrigger(true);
    const impact = far.tick(1 / 60).impacts[0]!;
    expect(impact.falloff).toBeCloseTo(0.6, 10);
    expect(impact.resolution.damage).toBeCloseTo(12, 10);
  });

  test("geometry with no target stops the pellet without dealing damage", () => {
    const weapon = createWeaponSystem(fixture(), makeDeps({ raycast: (from, direction) => ({ point: [from[0] + direction[0] * 5, from[1] + direction[1] * 5, from[2] + direction[2] * 5] }) }));
    weapon.setTrigger(true);
    const result = weapon.tick(1 / 60);
    expect(result.shots.length).toBe(1);
    expect(result.impacts).toEqual([]);
    expect(weapon.stats().impacts).toBe(0);
  });

  test("a projectile falls under gravity and expires on its lifetime", () => {
    const weapon = createWeaponSystem(
      fixture({ handling: STILL_SPREAD, delivery: { kind: "projectile", speed: 30, gravity: 9.81, lifetime: 1 } }),
      makeDeps(),
    );
    weapon.setTrigger(true);
    weapon.tick(1 / 60);
    weapon.setTrigger(false);
    expect(weapon.pellets().length).toBe(1);

    weapon.tick(0.5);
    const pellet = weapon.pellets()[0]!;
    // One semi-implicit Euler step: gravity applied first, so 0.5 s at 9.81 m/s² drops 2.45 m.
    expect(pellet.position[1]).toBeCloseTo(1.5 - 9.81 * 0.5 * 0.5, 6);
    expect(pellet.position[2]).toBeCloseTo(15, 6);
    expect(pellet.age).toBeCloseTo(0.5, 10);

    weapon.tick(0.6);
    expect(weapon.pellets()).toEqual([]);
    expect(weapon.stats().projectilesExpired).toBe(1);
  });

  test("live pellets are capped by maxInFlight and the drop is reported", () => {
    const weapon = createWeaponSystem(
      fixture({
        handling: STILL_SPREAD,
        pellets: 8,
        maxInFlight: 4,
        delivery: { kind: "projectile", speed: 60, lifetime: 5 },
      }),
      makeDeps(),
    );
    weapon.setTrigger(true);
    weapon.tick(1 / 60);
    expect(weapon.pellets().length).toBe(4);
    expect(weapon.stats().pelletsDropped).toBe(4);
    expect(weapon.stats().pelletsFired).toBe(8);
  });
});

describe("reload states and ammo economy", () => {
  test("an interrupted reload keeps its progress and resumes where it stopped", () => {
    const weapon = createWeaponSystem(fixture(), makeDeps({ raycast: hitscanAt(20) }));
    weapon.setTrigger(true);
    for (let i = 0; i < 60; i += 1) weapon.tick(1 / 60);
    weapon.setTrigger(false);
    const spent = weapon.stats().roundsSpent;
    expect(spent).toBe(11);
    expect(weapon.ammo().loaded).toBe(30 - spent);

    expect(weapon.reload()).toBe(true);
    weapon.tick(1);
    expect(weapon.ammo().reload).toBe("reloading");
    expect(weapon.ammo().reloadFraction).toBeCloseTo(0.5, 6);

    expect(weapon.interruptReload()).toBe(true);
    expect(weapon.ammo().reload).toBe("interrupted");
    expect(weapon.ammo().reloadFraction).toBeCloseTo(0.5, 6);
    expect(weapon.ammo().loaded).toBe(30 - spent);

    // An interrupted reload neither advances nor lets the weapon fire.
    weapon.setTrigger(true);
    for (let i = 0; i < 30; i += 1) {
      expect(weapon.tick(1 / 60).shots).toEqual([]);
    }
    expect(weapon.ammo().reloadFraction).toBeCloseTo(0.5, 6);
    weapon.setTrigger(false);

    expect(weapon.resumeReload()).toBe(true);
    weapon.tick(1);
    expect(weapon.ammo().loaded).toBe(30);
    expect(weapon.ammo().reserve).toBe(90 - spent);
    expect(weapon.ammo().reload).toBe("idle");
    expect(weapon.stats().reloadsInterrupted).toBe(1);
    expect(weapon.stats().reloadsCompleted).toBe(1);
  });

  test("the trigger pulled dry reloads with the live reserve and reports the economy", () => {
    const weapon = createWeaponSystem(
      fixture({ magazine: { capacity: 4, reloadMs: 1_000, reserve: 6 } }),
      makeDeps({ raycast: hitscanAt(20) }),
    );
    weapon.setTrigger(true);
    for (let i = 0; i < 40; i += 1) weapon.tick(1 / 60);
    weapon.setTrigger(false);
    expect(weapon.stats().roundsSpent).toBe(4);
    expect(weapon.ammo()).toMatchObject({ loaded: 0, capacity: 4, reserve: 6, reload: "reloading" });
    expect(weapon.stats().damage).toBeCloseTo(80, 10);

    for (let i = 0; i < 90; i += 1) weapon.tick(1 / 60);
    expect(weapon.ammo()).toMatchObject({ loaded: 4, reserve: 2, reload: "idle" });
    expect(weapon.stats().reloadsCompleted).toBe(1);
  });
});

describe("state, retune and probes", () => {
  test("snapshot restores aim, ammo, burst and pellets and continues identically", () => {
    const definition = fixture({
      fireMode: "burst",
      burst: { count: 4 },
      delivery: { kind: "projectile", speed: 60, lifetime: 4 },
    });
    const rngA = seededRng("restore");
    const a = createWeaponSystem(definition, makeDeps({ rng: rngA, sweep: planeAt(20) }));
    a.setAim(0.1, 0.05);
    a.setTrigger(true);
    for (let i = 0; i < 20; i += 1) a.tick(1 / 60);

    const saved = JSON.parse(JSON.stringify(a.snapshot()));
    const rngB = seededRng("restore");
    const b = createWeaponSystem(definition, makeDeps({ rng: rngB, sweep: planeAt(20) }));
    expect(b.restore(saved)).toBe(true);
    rngB.restore(rngA.state());

    expect(b.ammo()).toEqual(a.ammo());
    expect(b.aim()).toEqual(a.aim());
    expect(b.pellets()).toEqual(a.pellets());
    expect(b.stats()).toEqual(a.stats());

    for (let i = 0; i < 60; i += 1) {
      const left = a.tick(1 / 60);
      const right = b.tick(1 / 60);
      expect(right.shots).toEqual(left.shots);
      expect(right.impacts.map((impact) => impact.resolution)).toEqual(left.impacts.map((impact) => impact.resolution));
    }
    expect(b.pellets()).toEqual(a.pellets());
  });

  test("restore refuses state from a different ammo model", () => {
    const withMagazine = createWeaponSystem(fixture(), makeDeps({ raycast: hitscanAt(20) }));
    const saved = withMagazine.snapshot();
    const noMagazine = createWeaponSystem(fixture({ magazine: undefined }), makeDeps({ raycast: hitscanAt(20) }));
    expect(noMagazine.restore(saved)).toBe(false);
  });

  test("retune changes rate and capacity without losing ammo or aim", () => {
    const weapon = createWeaponSystem(fixture(), makeDeps({ raycast: hitscanAt(20) }));
    weapon.setAim(0.2, 0.1);
    weapon.setTrigger(true);
    for (let i = 0; i < 20; i += 1) weapon.tick(1 / 60);
    weapon.setTrigger(false);
    const spent = weapon.stats().roundsSpent;

    expect(weapon.retune(fixture({ roundsPerMinute: 1_200, magazine: { capacity: 10, reloadMs: 1_500, reserve: 90 } }))).toBe(true);
    expect(weapon.ammo().capacity).toBe(10);
    expect(weapon.ammo().loaded).toBe(10);
    expect(weapon.stats().roundsSpent).toBe(spent);
    expect(weapon.aim().yaw).toBeCloseTo(0.2, 1);

    weapon.reset();
    weapon.setTrigger(true);
    let shots = 0;
    for (let i = 0; i < 30; i += 1) shots += weapon.tick(1 / 60).shots.length;
    // 1200 rpm is 50 ms, so half a second holds ten shots.
    expect(shots).toBe(10);
  });

  test("a devtools probe reports the weapon in one line", () => {
    const weapon = createWeaponSystem(fixture(), makeDeps({ raycast: hitscanAt(20), devtoolsName: "combat/weapon-test" }));
    weapon.setTrigger(true);
    weapon.tick(1 / 60);
    const line = String(devtools.snapshot().probes["combat/weapon-test"]);
    expect(line).toContain("fixture.base");
    expect(line).toContain("1 shots");
    weapon.dispose();
    expect(devtools.snapshot().probes["combat/weapon-test"]).toBeUndefined();
  });

  test("a delivery with no world query fails at construction", () => {
    const model = damageModel();
    expect(() => createWeaponSystem(fixture(), { rng: seededRng("x"), damage: model, origin: () => [0, 0, 0] })).toThrow(/raycast/);
    expect(() =>
      createWeaponSystem(fixture({ delivery: { kind: "projectile", speed: 10, lifetime: 1 } }), {
        rng: seededRng("x"),
        damage: model,
        origin: () => [0, 0, 0],
      }),
    ).toThrow(/sweep/);
  });
});
