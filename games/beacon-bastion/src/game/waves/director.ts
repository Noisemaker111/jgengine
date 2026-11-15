import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { EncounterOrder } from "@jgengine/core/waves/encounter";
import { advancePhase, createPhaseClock } from "@jgengine/core/ai/phaseLadder";
import { evaluatePressure, type PressurePlan } from "@jgengine/core/waves/pressure";
import { advancePathFollow, createPathFollow, type PathFollowState } from "@jgengine/core/nav/pathFollow";
import { vec3 } from "@jgengine/core/world/vec3";

import { editorLayers } from "../../editorLayers";
import { activeMap, MAPS } from "../../maps";
import { councilScale, difficultyOf } from "../campaign";
import { creepDef } from "../entities/enemies/catalog";
import { towerDef } from "../entities/towers/catalog";
import { gameClockMs, session, nextCreepInstanceId, newShield, newSpeedStats, type CreepRuntime } from "../session";
import { bossProfile, PRESSURE_RULE } from "./manifest";
import { ENDLESS_BOSS_RAMP } from "./endless";
import { isOvertime, waveTotal } from "./mode";
import { BUILD_PLOTS, KEEP_POINT, routeOf, SPAWN_POINT_KEY } from "../world/path";
import { finishRun, legacy, relicBountyScale } from "./legacy";
import { keep, runEnded, towerStats } from "../keep";
import { scorch, isFrozen } from "../combat/strike";
import { tickAbilities } from "../combat/cast";
import { powerDrainNear, sendNotification, spotWorker, workersNear } from "../combat/distraction";
import { tickHeldPay } from "./heldWavePay";
import { killBounty } from "./bounty";
import { tip } from "../tips";

/** How high a drone (or The Cloud) floats over the street. */
export const FLIGHT_HEIGHT = 2.4;

/** "Installing Update...": the first wave that has one, how far in it lands, and how long it takes. */
export const UPDATE_RULE = { fromWave: 3, atShare: 0.45, seconds: 4 } as const;

/** Each wave after the first fields tech this much sturdier (a share of its catalog health), so a fully promoted crew still feels the late waves. */
export const WAVE_HEALTH_RAMP = 0.03;

/** How far either side of the centre line tech may walk: the street is 4 m wide. */
const LANE_HALF_WIDTH = 1.3;

/** A stable lane for one piece of tech, from its instance number (golden-ratio spread, so neighbours differ). */
export function laneOffset(instanceId: string): number {
  const n = Number.parseInt(instanceId.replace(/\D/g, "") || "0", 10);
  const t = (n * 0.6180339887) % 1;
  return (t * 2 - 1) * LANE_HALF_WIDTH;
}

/** How far from the street a drone's parcel may land on a plot. */
const PARCEL_REACH = 9;

/** What calling the next wave now would pay: the seconds it skips on the clock, at the council's rate. */
export function waveOverlapBonus(ctx: GameContext): number {
  const world = keep.of(ctx);
  if (world.fact("keep.wave_started") !== true || world.fact("keep.wave_ready") !== true) return 0;
  return Math.round(session.countdown.bonusNow() * councilScale(ctx, "early_bonus"));
}

/** What the director sees about the player right now: attention left, waves cleared, time on the clock. */
export function readPressure(ctx: GameContext): PressurePlan {
  const world = keep.of(ctx);
  const max = world.num("keep.lives_max");
  const health = max <= 0 ? 1 : Math.max(0, world.num("keep.lives")) / max;
  const cleared = Math.max(0, session.encounter.view().wave - 1);
  return evaluatePressure(
    { health, progress: cleared / waveTotal(), elapsed: ctx.time.now() },
    PRESSURE_RULE,
  );
}

/** Whether the player may release the next wave right now. */
export function canSendWave(ctx: GameContext): boolean {
  const world = keep.of(ctx);
  return world.fact("keep.wave_ready") === true && !runEnded(world) && !session.encounter.view().done;
}

/** Every Mail Carrier on the street brings their cash when a wave arrives. */
function deliverMail(ctx: GameContext): void {
  const world = keep.of(ctx);
  let total = 0;
  for (const tower of world.instances()) {
    if (!tower.ready || towerDef(tower.kind, editorLayers).job !== "mail") continue;
    const income = towerStats(world, tower.id).income;
    if (income <= 0) continue;
    total += income;
    ctx.scene.entity.floatText({ instanceId: tower.id, text: `+${income} mail`, kind: "heal" });
  }
  if (total > 0) keep.emit(ctx, { kind: "mail_pay", scale: total });
}

/**
 * Release the next wave. Pressed by the player while the clock runs, it is an early call and pays for
 * the seconds skipped; let the clock run out and the wave rolls in on its own for nothing.
 */
export function sendWave(ctx: GameContext, early = true): void {
  if (!canSendWave(ctx)) return;
  const world = keep.of(ctx);
  const bonus = early ? waveOverlapBonus(ctx) : 0;
  session.countdown.disarm();
  if (world.fact("keep.wave_started") === true) session.encounter.completeWave();
  session.pressure = readPressure(ctx);
  session.openingComposition = session.encounter
    .openWave(undefined, session.pressure)
    .map((order) => order.unit);
  const wave = session.encounter.view().wave;
  world.set("keep.wave_started", true);
  world.set("keep.wave_ready", false);
  world.set("keep.wave", wave);
  world.set("keep.last_bonus", bonus);
  session.waveClock = 0;
  const duration = session.encounter.waveAt(wave - 1)?.durationSeconds ?? 20;
  session.updateAt = wave >= UPDATE_RULE.fromWave ? duration * UPDATE_RULE.atShare : null;
  if (bonus > 0) keep.emit(ctx, { kind: "overlap_bonus", scale: bonus });
  deliverMail(ctx);
  ctx.game.audio.play("wave");
}

export function registerWaveCommands(ctx: GameContext): void {
  ctx.game.commands.define("wave.send", {
    validate: (state) => (canSendWave(state) ? null : { reason: "wave-not-ready" }),
    apply: state => { sendWave(state); return state; },
  });
}

/** Put one piece of tech on a road, at its start or (for a split or a spawn) where another one stands. */
export function spawnRaider(ctx: GameContext, unit: string, route: string, from?: PathFollowState): string {
  const def = creepDef(unit);
  const difficulty = difficultyOf(ctx);
  const instanceId = nextCreepInstanceId();
  const waypoints = routeOf(route);
  const path = from === undefined ? createPathFollow({ waypoints, speed: def.speed }) : { ...from, position: [...from.position] as typeof from.position };
  const lift = def.flying === true ? FLIGHT_HEIGHT : 0;
  const position: [number, number, number] = [path.position[0], path.position[1] + lift, path.position[2]];
  ctx.scene.entity.spawn(unit, { id: instanceId, position, role: "npc" });
  // Bosses carry their own authored health; only the ordinary tech ramps.
  const wave = session.encounter.view().wave;
  // Overtime bosses grow with the night; on a day they keep their authored health.
  const bossRamp = isOvertime() ? 1 + ENDLESS_BOSS_RAMP * Math.max(0, wave - 12) : 1;
  const ramp = bossProfile(unit) !== null || def.becomes !== undefined ? bossRamp : MAPS[activeMap()].toughness * (1 + WAVE_HEALTH_RAMP * Math.max(0, wave - 1));
  const health = Math.round(def.health * difficulty.health * ramp);
  ctx.scene.entity.stats.set(instanceId, "health", { max: health, current: health });
  const runtime: CreepRuntime = {
    instanceId,
    catalogId: unit,
    route,
    path,
    speedStats: newSpeedStats(def.speed),
    shield: def.shield === undefined ? null : newShield(ctx, instanceId, def.shield),
    healIn: def.heals?.everySeconds ?? 0,
    // The first ping comes a little after it arrives, so a fresh wave doesn't distract on frame one.
    notifyIn: (def.notify?.everySeconds ?? def.spots?.everySeconds ?? def.backups?.everySeconds ?? def.power?.spawn.everySeconds ?? 0) * 0.35,
    alive: 0,
    dropped: false,
    installing: 0,
    updated: false,
    power: def.power === undefined ? null : def.power.max,
  };
  session.creeps.set(instanceId, runtime);
  return instanceId;
}

/** Start a boss's phase clock when it walks on (a spawned order or a transformation). */
function adoptBoss(ctx: GameContext, instanceId: string, unit: string): void {
  const profile = bossProfile(unit);
  if (profile === null) return;
  session.boss = { instanceId, unitId: unit, state: createPhaseClock(profile.phases), stance: "opening" };
  const tell = profile.tells["arrival"];
  if (tell !== undefined) ctx.game.notices.push({ text: tell, ttlMs: 3000 });
}

function spawnCreep(ctx: GameContext, order: EncounterOrder): void {
  const instanceId = spawnRaider(ctx, order.unit, order.entry ?? SPAWN_POINT_KEY);
  const def = creepDef(order.unit);
  if (def.flying === true) tip(ctx, "flyer");
  if (def.boosts !== undefined) tip(ctx, "boost");
  adoptBoss(ctx, instanceId, order.unit);
}

/** Take tech off the street without a kill (a confiscation, a leak): its entity, runtime and conditions go. */
export function removeCreep(ctx: GameContext, instanceId: string): void {
  ctx.scene.entity.despawn(instanceId);
  session.creeps.delete(instanceId);
  session.statuses.clear(instanceId);
  if (session.boss?.instanceId === instanceId) session.boss = null;
}

/**
 * Pay for one piece of tech taken off the street: its weight times the wave, the perk, the
 * difficulty and the council, plus what a mining rig mined while it lived and any `bonus`.
 */
export function payBounty(ctx: GameContext, catalogId: string, creep?: CreepRuntime, bonus = 0): number {
  const scale = relicBountyScale(legacy.read(ctx)) * difficultyOf(ctx).bounty * councilScale(ctx, "bounty");
  const mined = creep === undefined ? 0 : (creepDef(catalogId).mines?.bountyPerSecond ?? 0) * creep.alive;
  const paid = killBounty(catalogId, Math.max(1, session.encounter.view().wave), scale) + Math.round(mined) + bonus;
  keep.emit(ctx, { kind: "bounty", scale: paid });
  return paid;
}

function leakCreep(ctx: GameContext, creep: CreepRuntime): void {
  const def = creepDef(creep.catalogId);
  // A leak is a world ripple: the town loses the tech's leak in attention, and its hook ends a lost run.
  keep.emit(ctx, { kind: "leak", scale: def.leak });
  if (def.mines !== undefined) {
    const stolen = Math.round(def.mines.stealBase + def.mines.stealPerSecond * creep.alive);
    const purse = keep.of(ctx).num("keep.gold");
    const taken = Math.min(purse, stolen);
    if (taken > 0) {
      keep.emit(ctx, { kind: "theft", scale: taken });
      ctx.game.notices.push({ text: `A mining rig got through and stole ${taken} cash`, ttlMs: 2500, tone: "deny" });
    }
  }
  removeCreep(ctx, creep.instanceId);
  ctx.game.audio.play("leak", KEEP_POINT);
}

/** Read the boss's health and let its phase change its stance, raise a shield, call its escort. */
function tickBoss(ctx: GameContext, dt: number): void {
  const boss = session.boss;
  if (boss === null) return;
  const profile = bossProfile(boss.unitId);
  const creep = session.creeps.get(boss.instanceId);
  const health = ctx.scene.entity.stats.get(boss.instanceId, "health");
  if (profile === null || creep === undefined || health === null) {
    session.boss = null;
    return;
  }
  const fraction = health.max <= 0 ? 0 : Math.max(0, health.current) / health.max;
  const step = advancePhase(profile.phases, boss.state, fraction, dt);
  if (step.changed) {
    const stance = profile.stance[step.phase.id];
    if (stance !== undefined) {
      creep.speedStats.removeSource("boss-phase");
      creep.speedStats.addSource("boss-phase", { speed: { multiply: stance.speedScale } });
      boss.stance = step.phase.id;
      if (stance.ward !== undefined) {
        ctx.scene.entity.stats.set(boss.instanceId, "shield", { max: stance.ward, current: stance.ward });
        creep.shield = newShield(ctx, boss.instanceId, { max: stance.ward, regenPerSecond: 0, regenDelayMs: 0 });
        ctx.scene.entity.vfx({ preset: "shield", to: boss.instanceId, radius: 2.4, durationMs: 900 });
      }
      for (const escort of stance.summon ?? []) {
        for (let index = 0; index < escort.count; index += 1) spawnRaider(ctx, escort.unit, creep.route, creep.path);
      }
    }
    const text = step.tell === null ? undefined : profile.tells[step.tell.id];
    if (text !== undefined && step.tell !== null) ctx.game.notices.push({ text, ttlMs: Math.round(step.tell.seconds * 1000) });
    ctx.game.audio.play("wave");
  }
  session.boss = { ...boss, state: step.state };
}

/** A router's patch: every piece of tech in reach, itself included, takes back a share of its health. */
function mend(ctx: GameContext, healer: CreepRuntime, dt: number): void {
  const heals = creepDef(healer.catalogId).heals;
  if (heals === undefined) return;
  healer.healIn -= dt;
  if (healer.healIn > 0) return;
  healer.healIn = heals.everySeconds;
  const at = ctx.scene.entity.get(healer.instanceId)?.position;
  if (at === undefined) return;
  for (const other of session.creeps.values()) {
    const pose = ctx.scene.entity.get(other.instanceId)?.position;
    const health = ctx.scene.entity.stats.get(other.instanceId, "health");
    if (pose === undefined || health === null || vec3.distance(at, pose) > heals.radius || health.current >= health.max) continue;
    ctx.scene.entity.stats.delta(other.instanceId, "health", health.max * heals.share);
  }
  ctx.scene.entity.vfx({ preset: "heal", to: healer.instanceId, radius: heals.radius, durationMs: 700 });
}

/** A router's signal: tech in reach rolls faster for as long as it stays in it. */
function boostSpeed(ctx: GameContext, creep: CreepRuntime, nowMs: number): void {
  const at = ctx.scene.entity.get(creep.instanceId)?.position;
  if (at === undefined) return;
  for (const other of session.creeps.values()) {
    if (other.instanceId === creep.instanceId) continue;
    const boosts = creepDef(other.catalogId).boosts;
    if (boosts === undefined) continue;
    const pose = ctx.scene.entity.get(other.instanceId)?.position;
    if (pose === undefined || vec3.distance(at, pose) > boosts.radius) continue;
    creep.speedStats.removeSource("router");
    creep.speedStats.addSource("router", { speed: { multiply: boosts.speed } }, { expiresAtMs: nowMs + 400 });
    return;
  }
}

/** A drone that has come far enough drops its parcel on the nearest open plot to the street. */
function dropParcel(ctx: GameContext, creep: CreepRuntime): void {
  const drops = creepDef(creep.catalogId).drops;
  if (drops === undefined || creep.dropped) return;
  const total = routeLength(creep.route);
  if (total <= 0 || creep.path.distanceTravelled / total < drops.atProgress) return;
  creep.dropped = true;
  const at = creep.path.position;
  const world = keep.of(ctx);
  let pick: (typeof BUILD_PLOTS)[number] | null = null;
  let best = PARCEL_REACH;
  for (const plot of BUILD_PLOTS) {
    if (world.occupant(plot.id) !== null || session.parcels.has(plot.id)) continue;
    const gap = Math.hypot(plot.position[0] - at[0], plot.position[2] - at[2]);
    if (gap <= best) {
      best = gap;
      pick = plot;
    }
  }
  if (pick === null) return;
  session.parcels.add(pick.id);
  ctx.scene.entity.floatText({ position: [pick.position[0], pick.position[1] + 1.2, pick.position[2]], text: "Package delivered!", element: "frost" });
  tip(ctx, "parcel");
}

function routeLength(route: string): number {
  const points = routeOf(route);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += vec3.distance(points[index - 1]!, points[index]!);
  return total;
}

/** A server rack spits out backups on a beat, unless an Electrician is near enough to pull its plug. */
function spawnBackups(ctx: GameContext, creep: CreepRuntime): void {
  const backups = creepDef(creep.catalogId).backups;
  const at = ctx.scene.entity.get(creep.instanceId)?.position;
  if (backups === undefined || at === undefined) return;
  if (workersNear(ctx, "electrician", at, backups.electricianRange) > 0) {
    ctx.scene.entity.floatText({ instanceId: creep.instanceId, text: "Backups offline", element: "lightning" });
    return;
  }
  for (let index = 0; index < backups.count; index += 1) {
    const offset = Math.max(0, creep.path.distanceTravelled - 0.8 * (index + 1));
    spawnRaider(ctx, backups.unit, creep.route, { ...creep.path, distanceTravelled: offset });
  }
  ctx.scene.entity.floatText({ instanceId: creep.instanceId, text: "Restoring from backup…", element: "frost" });
}

/** A data center on mains power: Electricians near it drain the power; while it lasts it spawns phones. */
function tickPower(ctx: GameContext, creep: CreepRuntime, dt: number): void {
  const power = creepDef(creep.catalogId).power;
  const at = ctx.scene.entity.get(creep.instanceId)?.position;
  if (power === undefined || creep.power === null || at === undefined || creep.power <= 0) return;
  const drain = powerDrainNear(ctx, at, power.electricianRange);
  if (drain > 0) {
    creep.power = Math.max(0, creep.power - power.drainPerSecond * drain * dt);
    if (creep.power <= 0) {
      ctx.game.notices.push({ text: "POWER CUT! The Data Center is running on fumes — hit it now", ttlMs: 3500 });
      ctx.scene.entity.vfx({ preset: "lightning", from: [at[0], at[1] + 6, at[2]], to: [at[0], at[1], at[2]] });
      ctx.game.audio.play("kill", at);
    }
  }
}

/** Every timed behaviour a piece of tech has: notifications, camera spots, backups, spawns. */
function tickBehaviour(ctx: GameContext, creep: CreepRuntime, dt: number): void {
  const def = creepDef(creep.catalogId);
  creep.alive += dt;
  if (def.drops !== undefined) dropParcel(ctx, creep);
  if (def.power !== undefined) tickPower(ctx, creep, dt);
  const every = def.notify?.everySeconds ?? def.spots?.everySeconds ?? def.backups?.everySeconds ?? def.power?.spawn.everySeconds;
  if (every === undefined || creep.installing > 0 || isFrozen(creep.instanceId)) return;
  creep.notifyIn -= dt;
  if (creep.notifyIn > 0) return;
  creep.notifyIn = every;
  if (def.notify !== undefined) sendNotification(ctx, creep, def);
  else if (def.spots !== undefined) spotWorker(ctx, creep);
  else if (def.backups !== undefined) spawnBackups(ctx, creep);
  else if (def.power !== undefined && creep.power !== null && creep.power > 0) spawnRaider(ctx, def.power.spawn.unit, creep.route, creep.path);
}

/**
 * "Installing Update...": once a wave, part-way in, the healthiest ordinary tech past the first
 * stretch stops to install. Burst it down while it stands there (it takes extra damage); if it
 * finishes, it comes out armored.
 */
function tickUpdates(ctx: GameContext, dt: number): void {
  session.waveClock += dt;
  if (session.updateAt !== null && session.waveClock >= session.updateAt) {
    let pick: CreepRuntime | null = null;
    let best = -1;
    for (const creep of session.creeps.values()) {
      if (session.boss?.instanceId === creep.instanceId || creep.updated || creep.installing > 0) continue;
      const health = ctx.scene.entity.stats.get(creep.instanceId, "health")?.current ?? 0;
      if (creep.path.distanceTravelled < 6 || health <= best) continue;
      best = health;
      pick = creep;
    }
    if (pick !== null) {
      session.updateAt = null;
      pick.installing = UPDATE_RULE.seconds;
      ctx.scene.entity.floatText({ instanceId: pick.instanceId, text: "Installing Update…", element: "frost", crit: true });
      if (session.tipsShown.has("update")) ctx.game.notices.push({ text: `A ${creepDef(pick.catalogId).label} is installing an update — burst it down!`, ttlMs: 3000 });
      tip(ctx, "update");
    }
  }
  for (const creep of session.creeps.values()) {
    if (creep.installing <= 0) continue;
    creep.installing -= dt;
    if (creep.installing > 0) continue;
    creep.installing = 0;
    creep.updated = true;
    ctx.scene.entity.floatText({ instanceId: creep.instanceId, text: "Update complete: +armor", element: "bleed", crit: true });
    ctx.scene.entity.vfx({ preset: "shield", to: creep.instanceId, radius: 1.6, durationMs: 800 });
  }
}

/** Scalds tick through shields and into health; conditions that ended leave nothing behind. */
function tickConditions(ctx: GameContext, dt: number): void {
  for (const event of session.statuses.tick(dt)) {
    if (event.kind === "damage") scorch(ctx, event.source ?? "town", event.target, event.amount);
  }
}

/**
 * The clock between waves: arm it when a wave has arrived in full, release on its own when it runs
 * out, and hold while a boss rolls.
 */
function tickCountdown(ctx: GameContext, dt: number): void {
  const world = keep.of(ctx);
  const view = session.encounter.view();
  if (world.fact("keep.wave_started") !== true || world.fact("keep.wave_ready") !== true || view.done) return;
  if (!session.countdown.view().armed) {
    session.countdown.retune({ intermission: difficultyOf(ctx).intermission, earlyBonus: { perSecond: 1.2, max: 40 } });
    session.countdown.arm(view.wave + 1);
    return;
  }
  // A boss on the street holds the clock, so a player is never buried under the next wave while a
  // server rack or the data center is still rolling.
  if (session.boss !== null) return;
  if (session.countdown.tick(dt)) sendWave(ctx, false);
}

/**
 * A district's recess bell: while tech is on the road the bell rings every `every` seconds and the
 * kids crowd the schoolyard for `seconds`. Ground tech within the yard's reach crawls meanwhile.
 */
export function tickRecess(ctx: GameContext, dt: number): void {
  const recess = MAPS[activeMap()].recess;
  if (recess === undefined) return;
  const state = session.recess;
  if (state.left > 0) {
    state.left = Math.max(0, state.left - dt);
    const nowMs = gameClockMs(ctx);
    for (const creep of session.creeps.values()) {
      if (creepDef(creep.catalogId).flying === true) continue;
      const at = creep.path.position;
      if (Math.hypot(at[0] - recess.center[0], at[2] - recess.center[1]) > recess.radius) continue;
      creep.speedStats.removeSource("recess");
      creep.speedStats.addSource("recess", { speed: { multiply: recess.slow } }, { expiresAtMs: nowMs + 300 });
    }
    return;
  }
  if (session.creeps.size === 0) return;
  state.clock += dt;
  if (state.clock < recess.every) return;
  state.clock = 0;
  state.left = recess.seconds;
  ctx.game.notices.push({ text: "Recess bell! The kids crowd the schoolyard and the tech near it crawls", ttlMs: 4000 });
  ctx.game.audio.play("ping");
}

/** Whether the schoolyard is full right now (the overlay draws the crowd while it is). */
export function recessActive(): boolean {
  return session.recess.left > 0;
}

export function tickWaves(ctx: GameContext, dt: number): void {
  const world = keep.of(ctx);
  if (world.fact("keep.fallen") === true) return;

  const view = session.encounter.view();
  if (world.fact("keep.wave_ready") !== true && !view.done) {
    for (const order of session.encounter.update(dt)) spawnCreep(ctx, order);
    if (session.encounter.view().ready) {
      world.set("keep.wave_ready", true);
      if (session.encounter.view().wave >= waveTotal()) session.encounter.completeWave();
    }
  }
  tickBoss(ctx, dt);
  tickCountdown(ctx, dt);
  tickConditions(ctx, dt);
  tickAbilities(ctx, dt);
  tickUpdates(ctx, dt);
  tickRecess(ctx, dt);

  const nowMs = gameClockMs(ctx);
  for (const creep of Array.from(session.creeps.values())) {
    if (!session.creeps.has(creep.instanceId)) continue;
    const def = creepDef(creep.catalogId);
    creep.shield?.tick(dt);
    mend(ctx, creep, dt);
    boostSpeed(ctx, creep, nowMs);
    tickBehaviour(ctx, creep, dt);
    const still = isFrozen(creep.instanceId) || creep.installing > 0;
    const speed = still ? 0 : creep.speedStats.get("speed", nowMs);
    const waypoints = routeOf(creep.route);
    const next = advancePathFollow({ waypoints, speed }, creep.path, dt);
    creep.path = next;
    const lift = def.flying === true ? FLIGHT_HEIGHT : 0;
    // Each piece of tech keeps its own lane across the street, so a column of phones spreads into a
    // crowd instead of stacking into one slab. Bosses take the middle.
    const lane = session.boss?.instanceId === creep.instanceId ? 0 : laneOffset(creep.instanceId);
    const sideX = Math.cos(next.heading) * lane, sideZ = -Math.sin(next.heading) * lane;
    ctx.scene.entity.setPose(creep.instanceId, { position: [next.position[0] + sideX, next.position[1] + lift, next.position[2] + sideZ], rotationY: next.heading, dt });
    if (next.done) leakCreep(ctx, creep);
  }
  tickHeldPay(ctx);

  if (session.encounter.view().done && session.creeps.size === 0 && !runEnded(world)) {
    world.set("keep.held", true);
    finishRun(ctx);
    setGamePhase(ctx, "ended");
    ctx.game.audio.play("victory");
  }
}

/**
 * When tech that `becomes` something dies, its next form rolls on from the same spot: the Data
 * Center migrates to The Cloud. Returns the new instance, or null.
 */
export function transformOnDeath(ctx: GameContext, creep: CreepRuntime): string | null {
  const next = creepDef(creep.catalogId).becomes;
  if (next === undefined) return null;
  const id = spawnRaider(ctx, next, creep.route, creep.path);
  adoptBoss(ctx, id, next);
  return id;
}
