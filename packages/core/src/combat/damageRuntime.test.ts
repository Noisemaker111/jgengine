import { describe, expect, it } from "bun:test";
import { devtools } from "../devtools/devtools";
import { createGameEvents, type DamageAppliedEvent } from "../game/events";
import { createDamageRuntime, UnknownTargetProfileError, type DamageRuntimeConfig } from "./damageRuntime";
import type { StatusDef } from "./statusRuntime";

const statuses: StatusDef[] = [
  { id: "burn", stack: { kind: "stack", max: 3 }, durationMs: 3_000, intervalMs: 500, magnitude: 4, effect: { kind: "damage", channel: "fire" } },
  { id: "shock", stack: { kind: "refresh" }, durationMs: 2_000, intervalMs: 250, magnitude: 3, effect: { kind: "damage", channel: "shock" } },
  { id: "slow", stack: { kind: "ignore" }, durationMs: 2_500, intervalMs: 500, magnitude: -0.2, effect: { kind: "stat", stat: "moveSpeed" } },
  { id: "corrode", stack: { kind: "stack", max: 5 }, durationMs: 4_000, intervalMs: 1_000, magnitude: -40, effect: { kind: "stat", stat: "armor" } },
];

const config: DamageRuntimeConfig = {
  table: {
    types: [
      { id: "kinetic", vs: { flesh: 0.75, shield: 1, armor: 0.5 } },
      { id: "fire", vs: { flesh: 1.5, shield: 0.75, armor: 0.75 } },
      { id: "shock", vs: { flesh: 0.75, shield: 2, armor: 0.5 } },
      { id: "corrosion", vs: { flesh: 0.5, shield: 0.5, armor: 2 } },
    ],
    armor: { halfValue: 100, maxMitigation: 0.9 },
  },
  zones: {
    zones: [
      { id: "body", multiplier: 1 },
      { id: "limb", multiplier: 0.75 },
      { id: "head", multiplier: 1.5, critChance: 0.25, critMultiplier: 2.5 },
    ],
    defaultZone: "body",
    critChance: 0.05,
    critMultiplier: 2,
  },
  statuses,
  rng: () => 0.99,
};

function model(overrides?: Partial<DamageRuntimeConfig>) {
  const next = createDamageRuntime({ ...config, ...overrides });
  next.registerTarget("raider", { resistance: "flesh", armor: 0 });
  next.registerTarget("trooper", { resistance: "armor", armor: 60 });
  next.registerTarget("warden", { resistance: "armor", armor: 200 });
  return next;
}

describe("hit resolution", () => {
  it("applies zone, type, and armor in one readable resolution", () => {
    const damage = model();
    const result = damage.hit({ target: "trooper", type: "kinetic", base: 25 });
    expect(result.zone.multiplier).toBe(1);
    expect(result.multiplier).toBe(0.5);
    expect(result.armor).toBe(60);
    expect(result.mitigation).toBeCloseTo(0.375, 10);
    expect(result.damage).toBeCloseTo(25 * 1 * 0.5 * 0.625, 10);
  });

  it("multiplies a crit zone once, not zone × crit", () => {
    const damage = model({ rng: () => 0 });
    const crit = damage.hit({ target: "raider", type: "kinetic", base: 25, zone: "head" });
    expect(crit.zone.crit).toBe(true);
    expect(crit.zone.multiplier).toBe(2.5);
    expect(crit.damage).toBeCloseTo(25 * 2.5 * 0.75, 10);
    const normal = model().hit({ target: "raider", type: "kinetic", base: 25, zone: "head" });
    expect(normal.zone.crit).toBe(false);
    expect(normal.damage).toBeCloseTo(25 * 1.5 * 0.75, 10);
  });

  it("rejects a hit on a target that was never registered", () => {
    expect(() => model().hit({ target: "ghost", type: "kinetic", base: 10 })).toThrow(UnknownTargetProfileError);
  });
});

describe("armor and time to kill", () => {
  it("armor changes time to kill", () => {
    const damage = model();
    const unarmored = damage.timeToKill({ target: "raider", type: "kinetic", base: 25, hp: 150, intervalSeconds: 0.15 });
    const armored = damage.timeToKill({ target: "warden", type: "kinetic", base: 25, hp: 150, intervalSeconds: 0.15 });
    expect(unarmored.shots).toBe(8);
    expect(unarmored.seconds).toBeCloseTo(1.05, 10);
    expect(armored.shots).toBe(36);
    expect(armored.seconds).toBeCloseTo(5.25, 10);
    expect(armored.shots).toBeGreaterThan(unarmored.shots * 4);
  });

  it("quotes a crit explicitly rather than rolling it", () => {
    const damage = model({ rng: () => 0.99 });
    const plain = damage.timeToKill({ target: "raider", type: "kinetic", base: 25, hp: 150, intervalSeconds: 0.15, zone: "head" });
    const crit = damage.timeToKill({ target: "raider", type: "kinetic", base: 25, hp: 150, intervalSeconds: 0.15, zone: "head", crit: true });
    expect(plain.damagePerShot).toBeCloseTo(28.125, 10);
    expect(crit.damagePerShot).toBeCloseTo(46.875, 10);
    expect(crit.seconds).toBeLessThan(plain.seconds);
  });

  it("reads the whole table with armor mitigation", () => {
    const lines = model().table({ base: 25, armor: { flesh: 0, armor: 60 } });
    const text = lines.map((row) => `${row.type} ${row.resistance} ${row.damage?.toFixed(2)}`);
    expect(text).toContain("corrosion armor 31.25");
    expect(text).toContain("kinetic armor 7.81");
  });
});

describe("statuses on the model", () => {
  it("stacks two burns by the declared rule and deals two magnitudes", () => {
    const damage = model();
    damage.hit({ target: "trooper", type: "kinetic", base: 1, statuses: ["burn", "burn"] });
    expect(damage.statusesOf("trooper")[0]?.stacks).toBe(2);
    const ticks = damage.tick(0.5).filter((event) => event.kind === "damage");
    expect(ticks.length).toBe(1);
    const burn = ticks[0];
    expect(burn?.kind === "damage" ? burn.amount : 0).toBe(8);
    expect(burn?.kind === "damage" ? burn.dealt : 0).toBeCloseTo(8 * 0.75 * 0.625, 10);
  });

  it("resolves a status tick through the same type table and armor as a hit", () => {
    const damage = model();
    damage.applyStatus("trooper", "burn");
    const [tick] = damage.tick(0.5).filter((event) => event.kind === "damage");
    expect(tick?.kind === "damage" ? tick.dealt : 0).toBeCloseTo(4 * 0.75 * 0.625, 10);
  });

  it("shreds armor with corrode and raises a later hit", () => {
    const damage = model();
    const before = damage.hit({ target: "warden", type: "kinetic", base: 25 });
    damage.applyStatus("warden", "corrode");
    damage.applyStatus("warden", "corrode");
    const after = damage.hit({ target: "warden", type: "kinetic", base: 25 });
    expect(after.armor).toBe(120);
    expect(after.damage).toBeGreaterThan(before.damage);
  });

  it("ignores a status the target already carries when its rule says so", () => {
    const damage = model();
    damage.applyStatus("raider", "slow");
    damage.tick(1);
    const remaining = damage.statusesOf("raider")[0]?.remainingMs ?? 0;
    damage.applyStatus("raider", "slow");
    expect(damage.statusesOf("raider")[0]?.remainingMs).toBe(remaining);
  });
});

describe("state out and back", () => {
  it("continues statuses identically after snapshot and restore", () => {
    const damage = model();
    damage.hit({ target: "trooper", type: "kinetic", base: 1, statuses: ["burn", "burn"] });
    damage.tick(0.6);
    const saved = damage.snapshot();
    const ahead = damage.tick(1.0);
    damage.restore(saved);
    expect(damage.tick(1.0)).toEqual(ahead);
    expect(damage.snapshot().targets.length).toBe(3);
  });

  it("retunes the table without dropping targets or carried statuses", () => {
    const damage = model();
    damage.applyStatus("trooper", "burn");
    const before = damage.hit({ target: "trooper", type: "kinetic", base: 25 }).damage;
    damage.retune({ table: { types: [{ id: "kinetic", vs: { armor: 2 } }], armor: { halfValue: 100 } } });
    const after = damage.hit({ target: "trooper", type: "kinetic", base: 25 }).damage;
    expect(after).toBeGreaterThan(before * 3);
    expect(damage.statusesOf("trooper").length).toBe(1);
  });

  it("serializes as plain data", () => {
    const damage = model();
    damage.applyStatus("raider", "corrode");
    const saved = damage.snapshot();
    expect(saved.targets).toEqual([
      { id: "raider", resistance: "flesh", armor: 0 },
      { id: "trooper", resistance: "armor", armor: 60 },
      { id: "warden", resistance: "armor", armor: 200 },
    ]);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  it("reports a devtools probe line", () => {
    const damage = model({ devtoolsName: "combat/damage-test" });
    damage.hit({ target: "raider", type: "fire", base: 25, zone: "head" });
    const line = String(devtools.snapshot().probes["combat/damage-test"]);
    expect(line).toContain("3 targets");
    expect(line).toContain("1 hits");
    expect(line).toContain("last fire 25.0");
    damage.dispose();
  });
});

describe("damage events", () => {
  function commanded(devtoolsName?: string) {
    const events = createGameEvents();
    const seen: DamageAppliedEvent[] = [];
    events.on("combat.damage", (event) => seen.push(event));
    const pools = new Map<string, number>([["hero", 380], ["keep", 1_600]]);
    const damage = createDamageRuntime({
      ...config,
      events,
      healthOf: (id) => pools.get(id) ?? null,
      ...(devtoolsName === undefined ? {} : { devtoolsName }),
    });
    damage.registerTarget("hero", { resistance: "flesh", armor: 0 });
    damage.registerTarget("keep", { resistance: "armor", armor: 200 });
    return { damage, seen, pools };
  }

  it("announces one event per application with target, source, amount and remaining", () => {
    const { damage, seen } = commanded();
    const resolution = damage.hit({ target: "hero", type: "kinetic", base: 40, source: "raider:1" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      target: "hero",
      source: "raider:1",
      type: "kinetic",
      amount: resolution.damage,
      absorbed: 40 - resolution.damage,
      remaining: 380 - resolution.damage,
      lethal: false,
    });
  });

  it("keeps a hero and a keep on their own events, health and death", () => {
    const { damage, seen, pools } = commanded();
    const keepHit = damage.hit({ target: "keep", type: "kinetic", base: 100, source: "raider:1" });
    const heroHit = damage.hit({ target: "hero", type: "kinetic", base: 40, source: "raider:1" });

    expect(seen.map((event) => event.target)).toEqual(["keep", "hero"]);
    const [keep, hero] = seen;
    expect(keep?.remaining).toBe(1_600 - keepHit.damage);
    expect(hero?.remaining).toBe(380 - heroHit.damage);
    expect(keep?.absorbed).toBeGreaterThan(hero?.absorbed ?? Number.POSITIVE_INFINITY);
    expect(keep?.lethal).toBe(false);
    expect(hero?.lethal).toBe(false);
    // The runtime reads a pool; it never writes one target's damage into another's.
    expect(pools.get("keep")).toBe(1_600);
    expect(pools.get("hero")).toBe(380);

    pools.set("hero", 20);
    damage.hit({ target: "hero", type: "kinetic", base: 40, source: "raider:2" });
    damage.hit({ target: "keep", type: "kinetic", base: 100, source: "raider:2" });
    const [heroDeath, keepAfter] = seen.slice(-2);
    expect(heroDeath).toMatchObject({ target: "hero", source: "raider:2", remaining: 0, lethal: true });
    expect(keepAfter).toMatchObject({ target: "keep", lethal: false });
    expect(keepAfter?.remaining).toBeGreaterThan(1_000);
  });

  it("names the status and who lit it when a carried status ticks", () => {
    const { damage, seen } = commanded();
    damage.applyStatus("hero", "burn", { source: "raider:3" });
    damage.tick(0.5);
    const tick = seen.find((event) => event.status === "burn");
    expect(tick).toMatchObject({ target: "hero", source: "raider:3", type: "fire", status: "burn" });
    expect(tick?.amount).toBeGreaterThan(0);
    expect(tick?.remaining).toBe(380 - (tick?.amount ?? 0));
  });

  it("reports no remaining health when the caller supplied no health reader", () => {
    const damage = model();
    damage.hit({ target: "raider", type: "kinetic", base: 10 });
    expect(damage.recentDamage()).toEqual([
      { target: "raider", type: "kinetic", amount: 7.5, absorbed: 2.5, remaining: null, lethal: false },
    ]);
  });

  it("makes the event stream readable from the devtools probe", () => {
    const { damage } = commanded("combat/damage-events-test");
    damage.hit({ target: "keep", type: "kinetic", base: 100, source: "raider:1" });
    damage.hit({ target: "hero", type: "kinetic", base: 40, source: "raider:1" });
    const line = String(devtools.snapshot().probes["combat/damage-events-test"]);
    expect(line).toContain("events");
    expect(line).toContain("keep -");
    expect(line).toContain("from raider:1");
    expect(line).toContain("hero -");
    expect(damage.recentDamage(1)).toHaveLength(1);
    expect(damage.recentDamage(1)[0]?.target).toBe("hero");
    damage.dispose();
  });
});

describe("bounded cost", () => {
  it("ticks 200 targets with four statuses each inside a frame budget", () => {
    const damage = model();
    for (let index = 0; index < 200; index += 1) {
      const id = `unit-${index}`;
      damage.registerTarget(id, { resistance: "armor", armor: 100 });
      for (const status of statuses) damage.applyStatus(id, status.id);
    }
    const started = performance.now();
    for (let tick = 0; tick < 600; tick += 1) damage.tick(1 / 60);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(400);
  });
});
