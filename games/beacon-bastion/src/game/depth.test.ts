import { beforeEach, describe, expect, test } from "bun:test";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { campaign, councilPoints, DIFFICULTIES, rankCouncil, setDifficulty, starsFor } from "./campaign";
import { castAt, useAbility } from "./combat/cast";
import { hitDamage, canHurt, WET_SHOCK_MULT } from "./combat/damage";
import { sendNotification, spotWorker } from "./combat/distraction";
import { strike } from "./combat/strike";
import { isDistracted, tickTowers } from "./combat/towerAI";
import { BLACKOUT } from "./combat/abilities";
import { CREEP_CATALOG } from "./entities/enemies/catalog";
import { TOWER_CATALOG } from "./entities/towers/catalog";
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
  // Plots sit beside the street; stand the tech right next to one.
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
  test("coffee shorts out gadgets, a jackhammer splits hardware, and a pitchfork downs wireless kit", () => {
    expect(hitDamage({ type: "hot", base: 100, raider: "gadget", armor: 0 })).toBeCloseTo(140);
    expect(hitDamage({ type: "blunt", base: 100, raider: "hardware", armor: 0 })).toBeCloseTo(140);
    expect(hitDamage({ type: "pierce", base: 100, raider: "wireless", armor: 0 })).toBeCloseTo(130);
    expect(canHurt("water", "vehicle")).toBe(true);
  });

  test("40 armor halves a physical hit; legal and analog ignore it; shock lands 2.5x on Wet tech", () => {
    expect(hitDamage({ type: "pierce", base: 100, raider: "gadget", armor: 40 })).toBeCloseTo(50);
    expect(hitDamage({ type: "pierce", base: 100, raider: "gadget", armor: 40, pen: 40 })).toBeCloseTo(100);
    expect(hitDamage({ type: "legal", base: 100, raider: "hardware", armor: 40 })).toBeCloseTo(100);
    expect(hitDamage({ type: "shock", base: 100, raider: "gadget", armor: 0, wet: true })).toBeCloseTo(100 * WET_SHOCK_MULT);
    expect(hitDamage({ type: "hot", base: 100, raider: "gadget", armor: 0, wet: true })).toBeCloseTo(140);
  });
});

describe("tech that asks for different answers", () => {
  test("a smart fridge's shield soaks hits first and grows back once it is left alone", () => {
    const id = raiderAt("tech_fridge", 0);
    const creep = session.creeps.get(id)!;
    const before = health(id);
    strike(runner.ctx, "test", id, { type: "legal", base: 50 });
    expect(health(id)).toBe(before);
    const left = creep.shield!.current();
    expect(left).toBeLessThan(CREEP_CATALOG.tech_fridge!.shield!.max);
    creep.shield!.tick(4);
    expect(creep.shield!.current()).toBeGreaterThan(left);
  });

  test("a plumber soaks tech and an electrician then hits it far harder", () => {
    const dry = raiderAt("tech_router", 0);
    const soaked = raiderAt("tech_router", 1);
    session.statuses.apply(soaked, "wet");
    strike(runner.ctx, "test", dry, { type: "shock", base: 20 });
    strike(runner.ctx, "test", soaked, { type: "shock", base: 20 });
    expect(health(soaked)).toBeLessThan(health(dry));
  });

  test("a wrecked self-driving car lets two e-scooters out where it stopped", () => {
    const id = raiderAt("tech_car", 0);
    runner.ctx.scene.entity.effect({ from: "test", to: id, effect: "damage", via: { amount: 10_000 } });
    expect(session.creeps.has(id)).toBe(false);
    expect(ofKind("tech_scooter")).toHaveLength(2);
  });

  test("the Data Center shrugs off most damage on mains power, and dying it migrates to The Cloud", () => {
    const id = raiderAt("boss_datacenter", 0);
    const creep = session.creeps.get(id)!;
    const full = health(id);
    strike(runner.ctx, "test", id, { type: "legal", base: 100 });
    const powered = full - health(id);
    creep.power = 0;
    strike(runner.ctx, "test", id, { type: "legal", base: 100 });
    expect(full - health(id) - powered).toBeGreaterThan(powered * 2);
    runner.ctx.scene.entity.effect({ from: "test", to: id, effect: "damage", via: { amount: 100_000 } });
    expect(ofKind("boss_cloud")).toHaveLength(1);
    expect(session.boss?.unitId).toBe("boss_cloud");
    expect(CREEP_CATALOG.boss_cloud!.flying).toBe(true);
  });

  test("an Electrician standing near the Data Center drains its power", () => {
    standTower("worker_electrician", 4);
    const id = raiderAt("boss_datacenter", 4);
    const creep = session.creeps.get(id)!;
    world().set("keep.wave_ready", true);
    const before = creep.power!;
    tickWaves(runner.ctx, 0.5);
    expect(creep.power!).toBeLessThan(before);
  });

  test("a router patches the hurt tech around it", () => {
    const router = raiderAt("tech_router", 0);
    const phone = raiderAt("tech_phone", 0);
    runner.ctx.scene.entity.stats.set(phone, "health", { current: 20 });
    session.creeps.get(router)!.healIn = 0.1;
    world().set("keep.wave_ready", true);
    tickWaves(runner.ctx, 0.2);
    expect(health(phone)).toBeGreaterThan(20);
  });

  test("a barista never reaches a drone; a farmer does", () => {
    const barista = standTower("worker_barista", 0);
    const drone = raiderAt("tech_drone", 0);
    const full = health(drone);
    for (let step = 0; step < 10; step += 1) tickTowers(runner.ctx, 0.25);
    expect(health(drone)).toBe(full);
    runner.ui.invoke("beacon.act", { action: "sell", target: barista });
    advanceKeep(runner, 0.5);
    standTower("worker_farmer", 0);
    for (let step = 0; step < 10; step += 1) tickTowers(runner.ctx, 0.25);
    expect(health(drone)).toBeLessThan(full);
  });
});

describe("distraction: technology fights back without shooting", () => {
  test("a phone's notification distracts the nearest worker, who stops working until it wears off", () => {
    const worker = standTower("worker_barista", 0);
    const phone = raiderAt("tech_phone", 0);
    expect(sendNotification(runner.ctx, session.creeps.get(phone)!)).toBe(1);
    expect(isDistracted(worker)).toBe(true);
    const shots = session.towerShots.get(worker) ?? 0;
    tickTowers(runner.ctx, 0.5);
    expect(session.towerShots.get(worker) ?? 0).toBe(shots);
    for (let step = 0; step < 12; step += 1) tickTowers(runner.ctx, 0.25);
    expect(isDistracted(worker)).toBe(false);
  });

  test("a Librarian's SHHH stops notifications, and a Monk keeps the workers near him present", () => {
    standTower("worker_librarian", 0);
    const phone = raiderAt("tech_phone", 0);
    expect(sendNotification(runner.ctx, session.creeps.get(phone)!)).toBe(0);
    const fresh = beaconRunner("Monk");
    runner = fresh;
    const worker = standTower("worker_barista", 6);
    standTower("worker_monk", 8);
    const other = raiderAt("tech_phone", 6);
    sendNotification(runner.ctx, session.creeps.get(other)!);
    expect(isDistracted(worker)).toBe(false);
  });

  test("a Teacher snaps distracted workers back to work and confiscates phones for cash", () => {
    const worker = standTower("worker_barista", 6);
    standTower("worker_teacher", 8);
    session.workers.apply(worker, "distracted", { durationScale: 10 });
    tickTowers(runner.ctx, 0.1);
    expect(isDistracted(worker)).toBe(false);
    const phone = raiderAt("tech_phone", 8);
    const gold = world().num("keep.gold");
    for (let step = 0; step < 40 && session.creeps.has(phone); step += 1) tickTowers(runner.ctx, 0.25);
    expect(session.creeps.has(phone)).toBe(false);
    expect(world().num("keep.gold")).toBeGreaterThan(gold);
  });

  test("a Flock camera spots a worker, and every notification goes for them first, for longer", () => {
    const near = standTower("worker_barista", 6);
    const far = standTower("worker_farmer", 8);
    const camera = raiderAt("tech_flock", 8);
    expect(spotWorker(runner.ctx, session.creeps.get(camera)!)).toBe(far);
    const phone = raiderAt("tech_phone", 6);
    sendNotification(runner.ctx, session.creeps.get(phone)!);
    expect(isDistracted(far)).toBe(true);
    expect(isDistracted(near)).toBe(false);
  });

  test("a distracted worker says so in a speech bubble, and the gadget's ping hangs over the gadget", () => {
    const worker = standTower("worker_barista", 0);
    const phone = raiderAt("tech_phone", 0);
    sendNotification(runner.ctx, session.creeps.get(phone)!);
    expect(session.bubbles.some((bubble) => bubble.at === worker && bubble.kind === "voice")).toBe(true);
    expect(session.bubbles.some((bubble) => bubble.at === phone && bubble.kind === "ping")).toBe(true);
    expect(TOWER_CATALOG.worker_barista!.voice.distracted).toContain(session.bubbles.find((bubble) => bubble.at === worker)!.text);
  });

  test("Do Not Disturb snaps every worker out of their phone", () => {
    const worker = standTower("worker_barista", 0);
    session.workers.apply(worker, "distracted", { durationScale: 10 });
    runner.ui.invoke("abilityQuiet", {});
    expect(isDistracted(worker)).toBe(false);
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

describe("the town's two big buttons", () => {
  test("Blackout arms, lands where the player points after its telegraph, then waits out its cooldown", () => {
    // The road moves a raider by its path, so aim a little ahead of where it walks from.
    const grunt = spawnRaider(runner.ctx, "tech_phone", SPAWN_POINT_KEY);
    const start = session.creeps.get(grunt)!.path.position;
    const at: [number, number, number] = [start[0], start[1], start[2]];
    const full = health(grunt);
    expect(useAbility(runner.ctx, "blackout")).toBe(true);
    expect(session.armedAbility).toBe("blackout");
    expect(castAt(runner.ctx, at)).toBe(true);
    world().set("keep.wave_ready", true);
    tickWaves(runner.ctx, 0.5);
    expect(health(grunt)).toBe(full);
    tickWaves(runner.ctx, BLACKOUT.delayMs / 1000);
    expect(health(grunt)).toBeLessThan(full);
    expect(runner.ui.tryInvoke("ability.blackout", {})).toMatchObject({ status: "rejected", reason: "ability-not-ready" });
  });

  test("Do Not Disturb slows every gadget on the street at once", () => {
    const a = raiderAt("tech_phone", 0);
    const b = raiderAt("tech_earbuds", 3);
    runner.ui.invoke("abilityQuiet", {});
    const now = runner.ctx.time.now() * 1000;
    for (const id of [a, b]) {
      const creep = session.creeps.get(id)!;
      expect(creep.speedStats.get("speed", now)).toBeCloseTo(CREEP_CATALOG[creep.catalogId]!.speed * 0.4);
    }
  });
});

describe("the campaign", () => {
  test("Overtime opens with less attention and tougher tech; a clean hold earns four stars", () => {
    setDifficulty(runner.ctx, "overtime");
    restartDefense(runner.ctx);
    expect(world().num("keep.lives")).toBe(DIFFICULTIES.overtime.lives);
    const id = spawnRaider(runner.ctx, "tech_phone", SPAWN_POINT_KEY);
    expect(runner.ctx.scene.entity.stats.get(id, "health")?.max).toBe(Math.round(CREEP_CATALOG.tech_phone!.health * DIFFICULTIES.overtime.health));
    expect(starsFor(true, 10, 10, "overtime")).toBe(4);
    expect(starsFor(true, 4, 10, "fulltime")).toBe(1);
    expect(starsFor(false, 10, 10, "fulltime")).toBe(0);
  });

  test("stars are the council's points: no stars, no seats; a hold buys one", () => {
    expect(rankCouncil(runner.ctx, "bake_sale")).toBe(false);
    campaign.write(runner.ctx, { ...campaign.read(runner.ctx), stars: { parttime: 0, fulltime: 3, overtime: 0 } });
    expect(councilPoints(campaign.read(runner.ctx))).toBe(3);
    expect(rankCouncil(runner.ctx, "bake_sale")).toBe(true);
    restartDefense(runner.ctx);
    expect(world().num("keep.gold")).toBeGreaterThanOrEqual(150 + 25);
  });
});
