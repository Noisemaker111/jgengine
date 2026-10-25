import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { EncounterOrder } from "@jgengine/core/ai/director/encounter";
import { advanceBoss, createBossState } from "@jgengine/core/ai/director/boss";
import { evaluatePressure, type PressurePlan } from "@jgengine/core/ai/director/pressure";
import { advancePathFollow, createPathFollow, type PathFollowState } from "@jgengine/core/nav/pathFollow";
import { distance } from "@jgengine/core/world/vec3";

import { councilScale, difficultyOf } from "../campaign";
import { creepDef } from "../entities/enemies/catalog";
import { gameClockMs, session, nextCreepInstanceId, newShield, newSpeedStats, type CreepRuntime } from "../session";
import { bossProfile, PRESSURE_RULE, TOTAL_WAVES } from "./manifest";
import { KEEP_POINT, routeOf, SPAWN_POINT_KEY } from "../world/path";
import { finishRun } from "./legacy";
import { keep, runEnded } from "../keep";
import { scorch, isFrozen } from "../combat/strike";
import { tickAbilities } from "../combat/cast";

/** How high a wraith floats over the road. */
export const FLIGHT_HEIGHT = 2.4;

/** What calling the next wave now would pay: the seconds it skips on the clock, at the council's rate. */
export function waveOverlapBonus(ctx: GameContext): number {
  const world = keep.of(ctx);
  if (world.fact("keep.wave_started") !== true || world.fact("keep.wave_ready") !== true) return 0;
  return Math.round(session.countdown.bonusNow() * councilScale(ctx, "early_bonus"));
}

/** What the director sees about the player right now: keep health, waves cleared, time on the clock. */
export function readPressure(ctx: GameContext): PressurePlan {
  const world = keep.of(ctx);
  const max = world.num("keep.lives_max");
  const health = max <= 0 ? 1 : Math.max(0, world.num("keep.lives")) / max;
  const cleared = Math.max(0, session.encounter.view().wave - 1);
  return evaluatePressure(
    { health, progress: cleared / TOTAL_WAVES, elapsed: ctx.time.now() },
    PRESSURE_RULE,
  );
}

/** Whether the player may release the next wave right now. */
export function canSendWave(ctx: GameContext): boolean {
  const world = keep.of(ctx);
  return world.fact("keep.wave_ready") === true && !runEnded(world) && !session.encounter.view().done;
}

/**
 * Release the next wave. Pressed by the player while the clock runs, it is an early call and pays for
 * the seconds skipped; let the clock run out and the wave marches on its own for nothing.
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
  world.set("keep.wave_started", true);
  world.set("keep.wave_ready", false);
  world.set("keep.wave", session.encounter.view().wave);
  world.set("keep.last_bonus", bonus);
  if (bonus > 0) keep.emit(ctx, { kind: "overlap_bonus", scale: bonus });
  ctx.game.audio.play("wave");
}

export function registerWaveCommands(ctx: GameContext): void {
  ctx.game.commands.define("wave.send", {
    validate: (state) => (canSendWave(state) ? null : { reason: "wave-not-ready" }),
    apply: state => { sendWave(state); return state; },
  });
}

/** Put one raider on a road, at its start or (for a split or a summons) where another one stands. */
export function spawnRaider(ctx: GameContext, unit: string, route: string, from?: PathFollowState): string {
  const def = creepDef(unit);
  const difficulty = difficultyOf(ctx);
  const instanceId = nextCreepInstanceId();
  const waypoints = routeOf(route);
  const path = from === undefined ? createPathFollow({ waypoints, speed: def.speed }) : { ...from, position: [...from.position] as typeof from.position };
  const lift = def.flying === true ? FLIGHT_HEIGHT : 0;
  const position: [number, number, number] = [path.position[0], path.position[1] + lift, path.position[2]];
  ctx.scene.entity.spawn(unit, { id: instanceId, position, role: "npc" });
  const health = Math.round(def.health * difficulty.health);
  ctx.scene.entity.stats.set(instanceId, "health", { max: health, current: health });
  const runtime: CreepRuntime = {
    instanceId,
    catalogId: unit,
    route,
    path,
    speedStats: newSpeedStats(def.speed),
    shield: def.shield === undefined ? null : newShield(ctx, instanceId, def.shield),
    healIn: def.heals?.everySeconds ?? 0,
  };
  session.creeps.set(instanceId, runtime);
  return instanceId;
}

function spawnCreep(ctx: GameContext, order: EncounterOrder): void {
  const instanceId = spawnRaider(ctx, order.unit, order.entry ?? SPAWN_POINT_KEY);
  const profile = bossProfile(order.unit);
  if (profile !== null) {
    session.boss = { instanceId, unitId: order.unit, state: createBossState(profile.phases), stance: "opening" };
    const tell = profile.tells["arrival"];
    if (tell !== undefined) ctx.game.notices.push({ text: tell, ttlMs: 2500 });
  }
}

function leakCreep(ctx: GameContext, instanceId: string, catalogId: string): void {
  // A leak is a world ripple: the keep loses the raider's leak in lives, and its hook ends a fallen run.
  keep.emit(ctx, { kind: "leak", scale: creepDef(catalogId).leak });
  ctx.scene.entity.despawn(instanceId);
  session.creeps.delete(instanceId);
  session.statuses.clear(instanceId);
  if (session.boss?.instanceId === instanceId) session.boss = null;
  ctx.game.audio.play("leak", KEEP_POINT);
}

/** Read the boss's health and let its phase change its stance, raise its ward, call its escort. */
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
  const step = advanceBoss(profile.phases, boss.state, fraction, dt);
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
    if (text !== undefined) ctx.game.notices.push({ text, ttlMs: Math.round((step.tell?.telegraphSeconds ?? 1.5) * 1000) });
    ctx.game.audio.play("wave");
  }
  session.boss = { ...boss, state: step.state };
}

/** A shaman's mending: every raider in reach, itself included, takes back a share of its health. */
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
    if (pose === undefined || health === null || distance(at, pose) > heals.radius || health.current >= health.max) continue;
    ctx.scene.entity.stats.delta(other.instanceId, "health", health.max * heals.share);
  }
  ctx.scene.entity.vfx({ preset: "heal", to: healer.instanceId, radius: heals.radius, durationMs: 700 });
}

/** Burns tick through the wards and into health; conditions that ended leave nothing behind. */
function tickConditions(ctx: GameContext, dt: number): void {
  for (const event of session.statuses.tick(dt)) {
    if (event.kind === "damage") scorch(ctx, event.source ?? "beacon", event.target, event.amount);
  }
}

/**
 * The clock between waves: arm it when a wave has arrived in full, release on its own when it runs
 * out, and hold while a boss walks.
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
  // A boss on the road holds the clock: the host waits on its champion, so a player is never
  // buried under the next wave while the Warden or the Warlord is still walking.
  if (session.boss !== null) return;
  if (session.countdown.tick(dt)) sendWave(ctx, false);
}

export function tickWaves(ctx: GameContext, dt: number): void {
  const world = keep.of(ctx);
  if (world.fact("keep.fallen") === true) return;

  const view = session.encounter.view();
  if (world.fact("keep.wave_ready") !== true && !view.done) {
    for (const order of session.encounter.update(dt)) spawnCreep(ctx, order);
    if (session.encounter.view().ready) {
      world.set("keep.wave_ready", true);
      if (session.encounter.view().wave >= TOTAL_WAVES) session.encounter.completeWave();
    }
  }
  tickBoss(ctx, dt);
  tickCountdown(ctx, dt);
  tickConditions(ctx, dt);
  tickAbilities(ctx, dt);

  const nowMs = gameClockMs(ctx);
  for (const creep of Array.from(session.creeps.values())) {
    const def = creepDef(creep.catalogId);
    creep.shield?.tick(dt);
    mend(ctx, creep, dt);
    const speed = isFrozen(creep.instanceId) ? 0 : creep.speedStats.get("speed", nowMs);
    const waypoints = routeOf(creep.route);
    const next = advancePathFollow({ waypoints, speed }, creep.path, dt);
    creep.path = next;
    const lift = def.flying === true ? FLIGHT_HEIGHT : 0;
    ctx.scene.entity.setPose(creep.instanceId, { position: [next.position[0], next.position[1] + lift, next.position[2]], rotationY: next.heading, dt });
    if (next.done) leakCreep(ctx, creep.instanceId, creep.catalogId);
  }

  if (session.encounter.view().done && session.creeps.size === 0 && !runEnded(world)) {
    world.set("keep.held", true);
    finishRun(ctx);
    setGamePhase(ctx, "ended");
    ctx.game.audio.play("victory");
  }
}
