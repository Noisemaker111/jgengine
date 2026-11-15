import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { selectAutoTarget, type AutoTargetPolicy } from "@jgengine/core/scene/autoTarget";
import { advancePursuit, armPursuit, type PursuitState } from "@jgengine/core/ai/pursuit";
import { createPathFollow } from "@jgengine/core/nav/pathFollow";
import { vec3 } from "@jgengine/core/world/vec3";

import { editorLayers } from "../../editorLayers";
import { campaign, councilAdd, councilScale, type CouncilStat } from "../campaign";
import { unionDamage, unionReach } from "../union";
import { gearBoost } from "../sinks";
import { creepDef } from "../entities/enemies/catalog";
import { towerDef, voiceLine, type TowerDef } from "../entities/towers/catalog";
import { keep, towerStats, type TowerStats } from "../keep";
import { gameClockMs, say, session, type WorkerClock } from "../session";
import { roadProgress, routeOf } from "../world/path";
import { canHurt, type DamageType } from "./damage";
import { pushProjectile } from "./pendingProjectiles";
import { payBounty, removeCreep } from "../waves/director";
import { tip } from "../tips";
import { isWet, strike } from "./strike";

const TOWER_ID = "__tower__";
/** How far a daisy-chained shock jumps to the next gadget, and what each jump keeps. */
const CHAIN = { reach: 4.5, falloff: 0.75 } as const;
/** A boss shakes off freezes and stuns this much faster than ordinary tech. */
const BOSS_HOLD = 0.3;
/** What one of Grandma's switch-offs takes off a boss instead (share of its max health). */
const GRANDMA_BOSS_CHUNK = 0.03;
/** Seconds a worker waits between lines said on the job. */
const VOICE_GAP = 9;

export interface TargetCandidate {
  id: string;
  position: EntityPosition;
  progress: number;
  /** Health left, for a worker aimed at the strongest. */
  health?: number;
}

/** Pick one piece of tech in range by the worker's aim (first on the road, last, the strongest, the nearest). */
export function chooseTarget(
  policy: AutoTargetPolicy,
  towerPosition: EntityPosition,
  range: number,
  candidates: readonly TargetCandidate[],
  exclude?: ReadonlySet<string>,
): string | null {
  const inRange = candidates.filter((candidate) => vec3.distance(towerPosition, candidate.position) <= range);
  if (inRange.length === 0) return null;
  const byId = new Map(inRange.map((candidate) => [candidate.id, candidate]));
  return selectAutoTarget(policy, TOWER_ID, {
    candidates: () => inRange.map((candidate) => candidate.id),
    ...(exclude === undefined ? {} : { eligible: (id: string) => !exclude.has(id) }),
    distance: (_from, toId) => {
      const candidate = byId.get(toId);
      return candidate === undefined ? null : vec3.distance(towerPosition, candidate.position);
    },
    strength: (toId) => byId.get(toId)?.health ?? 0,
    progress: (toId) => byId.get(toId)?.progress ?? 0,
  });
}

/** Which council seat backs each trade: the service counter, the skilled trades, or civic life. */
const COUNCIL_DAMAGE: Record<DamageType, CouncilStat> = {
  hot: "service_damage",
  water: "service_damage",
  shock: "trades_damage",
  blunt: "trades_damage",
  pierce: "trades_damage",
  legal: "civic_damage",
  analog: "civic_damage",
};

interface Volley {
  ctx: GameContext;
  towerId: string;
  def: TowerDef;
  stats: TowerStats;
  damage: number;
  shot: number;
  nowMs: number;
  from: EntityPosition;
}

function isBoss(id: string): boolean {
  return session.boss?.instanceId === id;
}

/** A deterministic 0..1 roll from a worker and its shot count, so a replay rolls the same. */
function roll(id: string, shot: number): number {
  let hash = 2166136261;
  const text = `${id}:${shot}`;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return ((hash >>> 0) % 10_000) / 10_000;
}

function hold(id: string, ms: number): void {
  if (ms <= 0) return;
  session.statuses.apply(id, "freeze", { durationScale: (ms / 1000) * (isBoss(id) ? BOSS_HOLD : 1) });
}

/** The worker's clocks, created on first read. */
export function workerClock(id: string): WorkerClock {
  let clock = session.workerClocks.get(id);
  if (clock === undefined) {
    clock = { ability: 2, voice: 3, heat: 1 };
    session.workerClocks.set(id, clock);
  }
  return clock;
}

/** Say one of a worker's lines over their head, and sometimes in the notice feed. */
export function speak(ctx: GameContext, towerId: string, kind: string, moment: "place" | "fire" | "distracted" | "promote"): void {
  session.voiceSeq += 1;
  const line = voiceLine(kind, moment, session.voiceSeq);
  if (line === "") return;
  say(towerId, line, "voice", ctx.time.now());
}

/** Everything one hit does to the tech it lands on, beyond its damage. */
function afflict(volley: Volley, targetId: string): void {
  const { def, stats, nowMs } = volley;
  const creep = session.creeps.get(targetId);
  if (creep === undefined) return;
  if (stats.slow < 1 && stats.slow_ms > 0) {
    creep.speedStats.removeSource(`slow:${def.id}`);
    creep.speedStats.addSource(`slow:${def.id}`, { speed: { multiply: Math.max(0.1, stats.slow) } }, { expiresAtMs: nowMs + stats.slow_ms });
  }
  if (stats.brittle > 0) session.statuses.apply(targetId, "brittle", { magnitudeScale: stats.brittle, durationScale: Math.max(stats.slow_ms, 1600) / 1600 });
  if (stats.wet_ms > 0) session.statuses.apply(targetId, "wet", { durationScale: stats.wet_ms / 4000 });
  if (stats.freeze_every > 0 && volley.shot % stats.freeze_every === 0) hold(targetId, stats.freeze_ms);
  for (let crack = 0; crack < stats.shred; crack += 1) session.statuses.apply(targetId, "sunder", { source: volley.towerId });
  if (stats.burn > 0) session.statuses.apply(targetId, "burn", { magnitudeScale: stats.burn, source: volley.towerId });
}

/** What a worker's own trade multiplies this hit by: a hose on hot tech, a pitchfork on a flyer. */
function tradeScale(stats: TowerStats, targetId: string): number {
  const creep = session.creeps.get(targetId);
  if (creep === undefined) return 1;
  const tech = creepDef(creep.catalogId);
  let scale = 1;
  if (stats.overheat_mult > 0 && tech.overheats !== undefined) scale *= 1 + stats.overheat_mult;
  if (stats.air_mult > 0 && tech.flying === true) scale *= 1 + stats.air_mult;
  return scale;
}

/** Grandma's small chance to find the off switch: ordinary tech just stops; a boss only flinches. */
function switchOff(volley: Volley, targetId: string): void {
  const { ctx, stats, towerId } = volley;
  if (stats.switchoff <= 0 || roll(towerId, volley.shot) >= stats.switchoff) return;
  const health = ctx.scene.entity.stats.get(targetId, "health");
  if (health === null || health.current <= 0) return;
  const amount = isBoss(targetId) ? health.max * GRANDMA_BOSS_CHUNK : health.current + 1;
  ctx.scene.entity.floatText({ instanceId: targetId, text: isBoss(targetId) ? "Off? …no?" : "*click* Off.", crit: true });
  ctx.scene.entity.effect({ from: towerId, to: targetId, effect: "damage", via: { amount } });
}

/** One throw: the hit, its splash, and the conditions it leaves. */
function land(volley: Volley, targetId: string, damage: number): void {
  const { ctx, def, stats, towerId } = volley;
  const target = ctx.scene.entity.get(targetId);
  if (target === null) return;
  const hit = { type: def.damageType, pen: stats.pen };
  if (def.damageType === "shock" && isWet(targetId)) {
    tip(ctx, "wet");
    ctx.scene.entity.floatText({ instanceId: targetId, text: "ZAP! x2.5", element: "lightning", crit: true });
  }
  strike(ctx, towerId, targetId, { ...hit, base: damage }, tradeScale(stats, targetId));
  afflict(volley, targetId);
  if (stats.stun_ms > 0) hold(targetId, stats.stun_ms);
  switchOff(volley, targetId);
  pushProjectile(volley.from, target.position, def.boltColor, stats.splash, ctx.time.now());
  if (stats.splash <= 0) return;
  const splashed = ctx.scene.entity.inRadius(target.position, stats.splash, (id) => id !== targetId);
  for (const id of splashed) {
    const creep = session.creeps.get(id);
    if (creep === undefined) continue;
    const tech = creepDef(creep.catalogId);
    if (!canHurt(def.damageType, tech.class) || (tech.flying === true && stats.air <= 0)) continue;
    strike(ctx, towerId, id, { ...hit, base: damage * 0.5 }, tradeScale(stats, id));
    if (stats.stun_ms > 0) hold(id, stats.stun_ms);
    if (stats.shred > 0) session.statuses.apply(id, "sunder", { source: towerId });
    if (stats.burn > 0) session.statuses.apply(id, "burn", { magnitudeScale: stats.burn * 0.5, source: towerId });
    if (stats.wet_ms > 0) session.statuses.apply(id, "wet", { durationScale: stats.wet_ms / 4000 });
  }
}

/** A daisy-chained shock's jumps: each to the nearest gadget it has not touched, weaker every time. */
function chain(volley: Volley, firstId: string, pool: readonly TargetCandidate[]): void {
  const touched = new Set([firstId]);
  let from = volley.ctx.scene.entity.get(firstId)?.position ?? null;
  let damage = volley.damage;
  for (let jump = 0; jump < volley.stats.chain && from !== null; jump += 1) {
    let next: TargetCandidate | null = null;
    let best: number = CHAIN.reach;
    for (const candidate of pool) {
      if (touched.has(candidate.id)) continue;
      const gap = vec3.distance(from, candidate.position);
      if (gap <= best) {
        best = gap;
        next = candidate;
      }
    }
    if (next === null) return;
    damage *= CHAIN.falloff;
    volley.ctx.scene.entity.vfx({ preset: "lightning", from: [from[0], from[1] + 1, from[2]], to: [next.position[0], next.position[1] + 1, next.position[2]] });
    strike(volley.ctx, volley.towerId, next.id, { type: volley.def.damageType, base: damage });
    afflict(volley, next.id);
    touched.add(next.id);
    from = next.position;
  }
}

/** A Teacher takes the nearest phone-sized gadget in reach off the street, and pays for it. */
function confiscate(ctx: GameContext, towerId: string, at: EntityPosition, stats: TowerStats, pool: readonly TargetCandidate[]): boolean {
  let pick: TargetCandidate | null = null;
  let best = stats.range;
  for (const candidate of pool) {
    const creep = session.creeps.get(candidate.id);
    if (creep === undefined || creepDef(creep.catalogId).confiscatable !== true) continue;
    const gap = vec3.distance(at, candidate.position);
    if (gap <= best) {
      best = gap;
      pick = candidate;
    }
  }
  if (pick === null) return false;
  const creep = session.creeps.get(pick.id)!;
  say(towerId, "Phones. Away. Now.", "voice", ctx.time.now());
  ctx.scene.entity.floatText({ instanceId: pick.id, text: "Confiscated!", element: "holy" });
  ctx.scene.entity.vfx({ preset: "shield", to: [pick.position[0], pick.position[1] + 0.6, pick.position[2]], radius: 1, durationMs: 500 });
  payBounty(ctx, creep.catalogId, creep, stats.income);
  removeCreep(ctx, pick.id);
  return true;
}

/** An IT Guy turns the furthest tech in reach off and on again: back to the start of its road. */
function reboot(ctx: GameContext, towerId: string, at: EntityPosition, stats: TowerStats, pool: readonly TargetCandidate[]): boolean {
  let pick: TargetCandidate | null = null;
  for (const candidate of pool) {
    if (isBoss(candidate.id) || vec3.distance(at, candidate.position) > stats.range) continue;
    if (pick === null || candidate.progress > pick.progress) pick = candidate;
  }
  if (pick === null) return false;
  const creep = session.creeps.get(pick.id);
  if (creep === undefined) return false;
  const def = creepDef(creep.catalogId);
  creep.path = createPathFollow({ waypoints: routeOf(creep.route), speed: def.speed });
  creep.installing = 0;
  if (stats.wipe > 0) creep.updated = false;
  say(towerId, "Have you tried turning it off and on again?", "voice", ctx.time.now());
  ctx.scene.entity.floatText({ instanceId: pick.id, text: "Rebooting…", element: "lightning" });
  return true;
}

/** A Lawyer's Cease and Desist: the strongest tech in reach is frozen where it stands. */
function ceaseAndDesist(ctx: GameContext, towerId: string, at: EntityPosition, stats: TowerStats, pool: readonly TargetCandidate[]): boolean {
  const pick = chooseTarget("strongest", at, stats.range, pool);
  if (pick === null) return false;
  hold(pick, stats.cease_ms);
  ctx.scene.entity.floatText({ instanceId: pick, text: "CEASE & DESIST", crit: true });
  say(towerId, "See you in court.", "voice", ctx.time.now());
  return true;
}

/** Workers this snapper stands near that are looking at their phones go back to work. */
function snapOut(ctx: GameContext, snapperId: string, at: EntityPosition, range: number): void {
  for (const worker of keep.of(ctx).instances()) {
    if (worker.id === snapperId || !session.workers.has(worker.id, "distracted")) continue;
    const pose = ctx.scene.entity.get(worker.id)?.position;
    if (pose === undefined || vec3.distance(at, pose) > range) continue;
    session.workers.clear(worker.id);
    ctx.scene.entity.floatText({ instanceId: worker.id, text: "Back to work!", element: "poison", scale: 0.85 });
  }
}

/** How much the hottest tech near a worker is slowing their hands (1 = not at all). */
export function heatFactor(ctx: GameContext, at: EntityPosition): number {
  let factor = 1;
  for (const creep of session.creeps.values()) {
    const hot = creepDef(creep.catalogId).overheats;
    if (hot === undefined || hot.rateFactor >= factor) continue;
    const pose = ctx.scene.entity.get(creep.instanceId)?.position;
    if (pose !== undefined && vec3.distance(at, pose) <= hot.radius) factor = hot.rateFactor;
  }
  return factor;
}

/** Whether a worker is looking at their phone instead of working. */
export function isDistracted(id: string): boolean {
  return session.workers.has(id, "distracted");
}

export function tickTowers(ctx: GameContext, dt: number): void {
  const nowMs = gameClockMs(ctx);
  session.workers.tick(dt);
  const ground: TargetCandidate[] = [];
  const all: TargetCandidate[] = [];
  for (const creep of session.creeps.values()) {
    const entity = ctx.scene.entity.get(creep.instanceId);
    if (entity === null) continue;
    const health = ctx.scene.entity.stats.get(creep.instanceId, "health")?.current ?? 0;
    const candidate = { id: creep.instanceId, position: entity.position, progress: roadProgress(creep), health };
    all.push(candidate);
    if (creepDef(creep.catalogId).flying !== true) ground.push(candidate);
  }

  const reach = councilAdd(ctx, "range");
  const career = campaign.read(ctx);
  const scales = Object.fromEntries(
    (Object.keys(COUNCIL_DAMAGE) as DamageType[]).map((type) => [type, councilScale(ctx, COUNCIL_DAMAGE[type])]),
  ) as Record<DamageType, number>;

  // A worker on a plot is the degenerate pursuit case: no chase, no leash — just the shared
  // cooldown-gated attack. `scratch` carries each worker's cooldown in and out so the loop allocates nothing.
  const scratch: PursuitState = { attackCooldown: 0 };
  const world = keep.of(ctx);
  for (const tower of world.instances()) {
    if (!tower.ready) continue;
    const def = towerDef(tower.kind, editorLayers);
    const stats = towerStats(world, tower.id);
    const entity = ctx.scene.entity.get(tower.id);
    if (entity === null) continue;
    const clock = workerClock(tower.id);
    clock.ability -= dt;
    clock.voice -= dt;
    const gear = gearBoost(tower.id, nowMs);
    const range = stats.range + reach + unionReach(career, tower.kind) + gear.range;
    if (stats.snap > 0 && !isDistracted(tower.id)) snapOut(ctx, tower.id, entity.position, range);
    if (isDistracted(tower.id)) continue;
    clock.heat = heatFactor(ctx, entity.position);
    if (clock.heat < 1) {
      session.workers.apply(tower.id, "overheated");
      tip(ctx, "overheat");
    }
    const pool = (stats.air > 0 ? all : ground).filter((candidate) => {
      const creep = session.creeps.get(candidate.id);
      return creep !== undefined && canHurt(def.damageType, creepDef(creep.catalogId).class);
    });
    const inReach = { ...stats, range };

    // The jobs with their own clock: confiscate, reboot, file a Cease and Desist.
    if (clock.ability <= 0) {
      const cooldown = stats.confiscate_s > 0 ? stats.confiscate_s : stats.reboot_s > 0 ? stats.reboot_s : stats.cease_s;
      let acted = false;
      if (stats.confiscate_s > 0) acted = confiscate(ctx, tower.id, entity.position, inReach, pool);
      else if (stats.reboot_s > 0) acted = reboot(ctx, tower.id, entity.position, inReach, pool);
      else if (stats.cease_s > 0) acted = ceaseAndDesist(ctx, tower.id, entity.position, inReach, pool);
      clock.ability = acted ? cooldown : 0.5;
    }

    if (stats.rate <= 0) continue;
    const primary = chooseTarget(stats.aim, entity.position, range, pool);
    scratch.attackCooldown = session.towerCooldowns.get(tower.id) ?? 0;
    const action = advancePursuit(scratch, dt, primary === null ? null : 0, Number.POSITIVE_INFINITY, "always");
    session.towerCooldowns.set(tower.id, scratch.attackCooldown);
    if (action !== "attack" || primary === null) continue;

    const shot = (session.towerShots.get(tower.id) ?? 0) + 1;
    session.towerShots.set(tower.id, shot);
    const crit = stats.crit_every > 0 && shot % stats.crit_every === 0;
    const volley: Volley = {
      ctx,
      towerId: tower.id,
      def,
      stats: inReach,
      damage: stats.damage * scales[def.damageType] * unionDamage(career, tower.kind) * gear.damage * (crit ? stats.crit_mult : 1),
      shot,
      nowMs,
      from: entity.position,
    };

    if (stats.aura > 0) {
      // An aura worker pulses: every piece of tech in reach is struck and afflicted at once.
      for (const candidate of pool) {
        if (vec3.distance(entity.position, candidate.position) > range) continue;
        if (volley.damage > 0) strike(ctx, tower.id, candidate.id, { type: def.damageType, base: volley.damage }, tradeScale(stats, candidate.id));
        afflict(volley, candidate.id);
      }
      ctx.scene.entity.vfx({ preset: "shockwave", to: [entity.position[0], entity.position[1] + 0.4, entity.position[2]], radius: range, durationMs: 420, color: Number.parseInt(def.boltColor.slice(1), 16) });
    } else {
      const chosen = new Set<string>([primary]);
      land(volley, primary, volley.damage);
      if (crit) ctx.scene.entity.floatText({ instanceId: primary, text: "Critical!", crit: true });
      for (let extra = 1; extra < stats.shots; extra += 1) {
        const next = chooseTarget(stats.aim, entity.position, range, pool, chosen);
        if (next === null) break;
        chosen.add(next);
        land(volley, next, volley.damage);
      }
      if (stats.chain > 0) chain(volley, primary, pool);
    }
    // The worker throws: their model plays its attack one-shot (a punch or a throw from the pack).
    ctx.game.playEntityAnimation(tower.id, "attack");
    const aimAt = ctx.scene.entity.get(primary)?.position;
    if (aimAt !== undefined) ctx.scene.entity.setPose(tower.id, { position: entity.position, rotationY: Math.atan2(aimAt[0] - entity.position[0], aimAt[2] - entity.position[2]) });
    if (clock.voice <= 0) {
      speak(ctx, tower.id, tower.kind, "fire");
      clock.voice = VOICE_GAP + (shot % 5);
    }
    armPursuit(scratch, 1 / Math.max(0.1, stats.rate * clock.heat * gear.rate));
    session.towerCooldowns.set(tower.id, scratch.attackCooldown);
  }
}
