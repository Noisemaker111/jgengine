import { beforeEach, describe, expect, test } from "bun:test";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { campaign, councilPoints, DIFFICULTIES, rankCouncil, setDifficulty, starsFor } from "./campaign";
import { castAt, useAbility } from "./combat/cast";
import { hitDamage, canHurt } from "./combat/damage";
import { strike } from "./combat/strike";
import { tickTowers } from "./combat/towerAI";
import { BEACON_FIRE } from "./combat/abilities";
import { CREEP_CATALOG } from "./entities/enemies/catalog";
import { keep } from "./keep";
import { session } from "./session";
import { advanceKeep, beaconRunner } from "./testing";
import { spawnRaider, tickWaves } from "./waves/director";
import { BUILD_PLOTS, SPAWN_POINT_KEY } from "./world/path";
import { restartDefense } from "./world/setup";

let runner: HeadlessRunner;
const world = () => keep.of(runner.ctx);
const health = (id: string) => runner.ctx.scene.entity.stats.get(id, "health")?.current ?? 0;
const ofKind = (unit: string) => [...session.creeps.values()].filter((creep) => creep.catalogId === unit);

beforeEach(() => {
  runner = beaconRunner("Beacon depth");
});

/** Stand a raider right beside a plot, on the ground (or in the air, for a flyer). */
function raiderAt(unit: string, plotIndex: number): string {
  const id = spawnRaider(runner.ctx, unit, SPAWN_POINT_KEY);
  const plot = BUILD_PLOTS[plotIndex]!.position;
  const lift = CREEP_CATALOG[unit]!.flying === true ? 2.4 : 0;
  runner.ctx.scene.entity.setPose(id, { position: [plot[0] + 1.5, plot[1] + lift, plot[2]] });
  return id;
}

function standTower(kind: string, plotIndex: number): string {
  world().set("keep.gold", 10_000);
  runner.ui.invoke("beacon.place", { kind, slot: BUILD_PLOTS[plotIndex]!.id });
  advanceKeep(runner, 5);
  return world().occupant(BUILD_PLOTS[plotIndex]!.id)!;
}

describe("the damage chart", () => {
  test("arrows glance off bone, shells shatter it, and a shell can't touch a wraith", () => {
    expect(hitDamage({ type: "pierce", base: 100, raider: "bone", armor: 0 })).toBeCloseTo(60);
    expect(hitDamage({ type: "blast", base: 100, raider: "bone", armor: 0 })).toBeCloseTo(140);
    expect(canHurt("blast", "spirit")).toBe(false);
    expect(canHurt("arcane", "spirit")).toBe(true);
  });

  test("40 armor halves a physical hit, a longbow's pierce cuts through it, and frost ignores it", () => {
    expect(hitDamage({ type: "pierce", base: 100, raider: "flesh", armor: 40 })).toBeCloseTo(50);
    expect(hitDamage({ type: "pierce", base: 100, raider: "flesh", armor: 40, pen: 40 })).toBeCloseTo(100);
    expect(hitDamage({ type: "frost", base: 100, raider: "flesh", armor: 40 })).toBeCloseTo(100);
  });
});

describe("raiders that ask for different answers", () => {
  test("a bulwark's ward soaks hits first and grows back once it is left alone", () => {
    const id = raiderAt("raider_bulwark", 0);
    const creep = session.creeps.get(id)!;
    const before = health(id);
    strike(runner.ctx, "test", id, { type: "frost", base: 50 });
    expect(health(id)).toBe(before);
    expect(creep.shield!.current()).toBeCloseTo(30);
    creep.shield!.tick(3);
    expect(creep.shield!.current()).toBeGreaterThan(30);
  });

  test("an ember rite melts a ward faster than it hurts flesh", () => {
    const plain = raiderAt("raider_bulwark", 0);
    const melted = raiderAt("raider_bulwark", 1);
    strike(runner.ctx, "test", plain, { type: "arcane", base: 30 });
    strike(runner.ctx, "test", melted, { type: "arcane", base: 30, shieldMult: 2.5 });
    expect(session.creeps.get(melted)!.shield!.current()).toBeLessThan(session.creeps.get(plain)!.shield!.current());
  });

  test("a hulk breaks into three bonelings where it falls", () => {
    const id = raiderAt("raider_hulk", 0);
    runner.ctx.scene.entity.effect({ from: "test", to: id, effect: "damage", via: { amount: 10_000 } });
    expect(session.creeps.has(id)).toBe(false);
    expect(ofKind("raider_boneling")).toHaveLength(3);
  });

  test("a shaman mends the hurt raiders around it", () => {
    const shaman = raiderAt("raider_shaman", 0);
    const grunt = raiderAt("raider_grunt", 0);
    runner.ctx.scene.entity.stats.set(grunt, "health", { current: 20 });
    session.creeps.get(shaman)!.healIn = 0.1;
    world().set("keep.wave_ready", true);
    tickWaves(runner.ctx, 0.2);
    expect(health(grunt)).toBeGreaterThan(20);
  });

  test("a cannon never fires at a wraith; an archer does", () => {
    const cannon = standTower("tower_cannon", 0);
    const wraith = raiderAt("raider_wraith", 0);
    const full = health(wraith);
    for (let step = 0; step < 10; step += 1) tickTowers(runner.ctx, 0.25);
    expect(health(wraith)).toBe(full);
    runner.ui.invoke("beacon.act", { action: "sell", target: cannon });
    advanceKeep(runner, 0.5);
    standTower("tower_archer", 0);
    for (let step = 0; step < 10; step += 1) tickTowers(runner.ctx, 0.25);
    expect(health(wraith)).toBeLessThan(full);
  });
});

describe("the clock between waves", () => {
  test("once a wave is out the clock runs; let it run out and the next wave marches for nothing", () => {
    runner.ui.invoke("wave.send", {});
    for (let elapsed = 0; elapsed < 21; elapsed += 0.5) tickWaves(runner.ctx, 0.5);
    expect(world().fact("keep.wave_ready")).toBe(true);
    tickWaves(runner.ctx, 0.1);
    expect(session.countdown.view().armed).toBe(true);
    const gold = world().num("keep.gold");
    for (let elapsed = 0; elapsed < 26; elapsed += 0.5) tickWaves(runner.ctx, 0.5);
    expect(session.encounter.view().wave).toBe(2);
    expect(world().num("keep.last_bonus")).toBe(0);
    expect(world().num("keep.gold")).toBeGreaterThanOrEqual(gold);
  });
});

describe("the beacon's rites", () => {
  test("Beacon Fire arms, falls where the player points after its telegraph, then waits out its cooldown", () => {
    // The road moves a raider by its path, so aim a little ahead of where it walks from.
    const grunt = spawnRaider(runner.ctx, "raider_grunt", SPAWN_POINT_KEY);
    const start = session.creeps.get(grunt)!.path.position;
    const at: [number, number, number] = [start[0], start[1], start[2]];
    const full = health(grunt);
    expect(useAbility(runner.ctx, "beacon_fire")).toBe(true);
    expect(session.armedAbility).toBe("beacon_fire");
    expect(castAt(runner.ctx, at)).toBe(true);
    world().set("keep.wave_ready", true);
    tickWaves(runner.ctx, 0.5);
    expect(health(grunt)).toBe(full);
    tickWaves(runner.ctx, BEACON_FIRE.delayMs / 1000);
    expect(health(grunt)).toBeLessThan(full);
    expect(runner.ui.tryInvoke("ability.beacon_fire", {})).toMatchObject({ status: "rejected", reason: "ability-not-ready" });
  });

  test("the Frost Bell slows every raider on the road at once", () => {
    const a = raiderAt("raider_grunt", 0);
    const b = raiderAt("raider_scout", 3);
    runner.ui.invoke("abilityBell", {});
    const now = runner.ctx.time.now() * 1000;
    for (const id of [a, b]) {
      const creep = session.creeps.get(id)!;
      expect(creep.speedStats.get("speed", now)).toBeCloseTo(CREEP_CATALOG[creep.catalogId]!.speed * 0.4);
    }
  });
});

describe("the campaign", () => {
  test("Warlord opens with fewer lives and tougher raiders; a clean hold earns four stars", () => {
    setDifficulty(runner.ctx, "warlord");
    restartDefense(runner.ctx);
    expect(world().num("keep.lives")).toBe(DIFFICULTIES.warlord.lives);
    const id = spawnRaider(runner.ctx, "raider_grunt", SPAWN_POINT_KEY);
    expect(runner.ctx.scene.entity.stats.get(id, "health")?.max).toBe(Math.round(CREEP_CATALOG.raider_grunt!.health * DIFFICULTIES.warlord.health));
    expect(starsFor(true, 10, 10, "warlord")).toBe(4);
    expect(starsFor(true, 4, 10, "knight")).toBe(1);
    expect(starsFor(false, 10, 10, "knight")).toBe(0);
  });

  test("stars are the council's points: no stars, no seats; a hold buys one", () => {
    expect(rankCouncil(runner.ctx, "war_chest")).toBe(false);
    campaign.write(runner.ctx, { ...campaign.read(runner.ctx), stars: { squire: 0, knight: 3, warlord: 0 } });
    expect(councilPoints(campaign.read(runner.ctx))).toBe(3);
    expect(rankCouncil(runner.ctx, "war_chest")).toBe(true);
    restartDefense(runner.ctx);
    expect(world().num("keep.gold")).toBeGreaterThanOrEqual(150 + 25);
  });
});
