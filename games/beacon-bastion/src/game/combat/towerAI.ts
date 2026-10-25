import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { selectAutoTarget, type AutoTargetPolicy } from "@jgengine/core/scene/autoTarget";
import { advancePursuit, armPursuit, type PursuitState } from "@jgengine/core/ai/pursuit";
import { distance } from "@jgengine/core/world/vec3";

import { editorLayers } from "../../editorLayers";
import { councilAdd, councilScale, type CouncilStat } from "../campaign";
import { creepDef } from "../entities/enemies/catalog";
import { towerDef, type TowerDef } from "../entities/towers/catalog";
import { keep, towerStats, type TowerStats } from "../keep";
import { gameClockMs, session } from "../session";
import { roadProgress } from "../world/path";
import { canHurt, type DamageType } from "./damage";
import { pushProjectile } from "./pendingProjectiles";
import { strike } from "./strike";

const TOWER_ID = "__tower__";
/** How far a storm bolt jumps to the next raider, and what each jump keeps. */
const CHAIN = { reach: 4.5, falloff: 0.75 } as const;
/** A boss shakes off ice and stuns this much faster than a raider. */
const BOSS_HOLD = 0.3;

export interface TargetCandidate {
  id: string;
  position: EntityPosition;
  progress: number;
  /** Health left, for a tower aimed at the strongest. */
  health?: number;
}

/** Pick one raider in range by the tower's aim (first on the road, last, the strongest, the nearest). */
export function chooseTarget(
  policy: AutoTargetPolicy,
  towerPosition: EntityPosition,
  range: number,
  candidates: readonly TargetCandidate[],
  exclude?: ReadonlySet<string>,
): string | null {
  const inRange = candidates.filter((candidate) => distance(towerPosition, candidate.position) <= range);
  if (inRange.length === 0) return null;
  const byId = new Map(inRange.map((candidate) => [candidate.id, candidate]));
  return selectAutoTarget(policy, TOWER_ID, {
    candidates: () => inRange.map((candidate) => candidate.id),
    eligible: exclude === undefined ? undefined : (id) => !exclude.has(id),
    distance: (_from, toId) => {
      const candidate = byId.get(toId);
      return candidate === undefined ? null : distance(towerPosition, candidate.position);
    },
    strength: (toId) => byId.get(toId)?.health ?? 0,
    progress: (toId) => byId.get(toId)?.progress ?? 0,
  });
}

const COUNCIL_DAMAGE: Record<DamageType, CouncilStat> = {
  pierce: "archer_damage",
  blast: "cannon_damage",
  frost: "frost_damage",
  arcane: "arcane_damage",
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

function hold(id: string, ms: number): void {
  if (ms <= 0) return;
  session.statuses.apply(id, "freeze", { durationScale: (ms / 1000) * (isBoss(id) ? BOSS_HOLD : 1) });
}

/** Everything one shot does to the raider it lands on, beyond its damage. */
function afflict(volley: Volley, targetId: string): void {
  const { def, stats, nowMs } = volley;
  const creep = session.creeps.get(targetId);
  if (creep === undefined) return;
  if (stats.slow < 1 && stats.slow_ms > 0) {
    creep.speedStats.removeSource(`slow:${def.id}`);
    creep.speedStats.addSource(`slow:${def.id}`, { speed: { multiply: Math.max(0.1, stats.slow) } }, { expiresAtMs: nowMs + stats.slow_ms });
    if (stats.brittle > 0) session.statuses.apply(targetId, "brittle", { magnitudeScale: stats.brittle, durationScale: stats.slow_ms / 1600 });
  }
  if (stats.freeze_every > 0 && volley.shot % stats.freeze_every === 0) hold(targetId, stats.freeze_ms);
  for (let crack = 0; crack < stats.shred; crack += 1) session.statuses.apply(targetId, "sunder", { source: volley.towerId });
  if (stats.burn > 0) session.statuses.apply(targetId, "burn", { magnitudeScale: stats.burn, source: volley.towerId });
}

/** One projectile: the hit, its splash, and the conditions it leaves. */
function land(volley: Volley, targetId: string, damage: number): void {
  const { ctx, def, stats, towerId } = volley;
  const target = ctx.scene.entity.get(targetId);
  if (target === null) return;
  const hit = { type: def.damageType, pen: stats.pen, shieldMult: stats.shield_mult, shatter: stats.shatter > 0 };
  strike(ctx, towerId, targetId, { ...hit, base: damage });
  afflict(volley, targetId);
  if (stats.stun_ms > 0) hold(targetId, stats.stun_ms);
  pushProjectile(volley.from, target.position, def.boltColor, stats.splash, ctx.time.now());
  if (stats.splash <= 0) return;
  const splashed = ctx.scene.entity.inRadius(target.position, stats.splash, (id) => id !== targetId);
  for (const id of splashed) {
    const creep = session.creeps.get(id);
    if (creep === undefined) continue;
    const raider = creepDef(creep.catalogId);
    if (!canHurt(def.damageType, raider.class) || (raider.flying === true && !def.hitsAir)) continue;
    strike(ctx, towerId, id, { ...hit, base: damage * 0.5 });
    if (stats.stun_ms > 0) hold(id, stats.stun_ms);
    if (stats.shred > 0) session.statuses.apply(id, "sunder", { source: towerId });
    if (stats.burn > 0) session.statuses.apply(id, "burn", { magnitudeScale: stats.burn * 0.5, source: towerId });
  }
}

/** A storm bolt's jumps: each to the nearest raider it has not touched, weaker every time. */
function chain(volley: Volley, firstId: string, pool: readonly TargetCandidate[]): void {
  const touched = new Set([firstId]);
  let from = volley.ctx.scene.entity.get(firstId)?.position ?? null;
  let damage = volley.damage;
  for (let jump = 0; jump < volley.stats.chain && from !== null; jump += 1) {
    let next: TargetCandidate | null = null;
    let best: number = CHAIN.reach;
    for (const candidate of pool) {
      if (touched.has(candidate.id)) continue;
      const gap = distance(from, candidate.position);
      if (gap <= best) {
        best = gap;
        next = candidate;
      }
    }
    if (next === null) return;
    damage *= CHAIN.falloff;
    volley.ctx.scene.entity.vfx({ preset: "lightning", from: [from[0], from[1] + 1, from[2]], to: [next.position[0], next.position[1] + 1, next.position[2]] });
    strike(volley.ctx, volley.towerId, next.id, { type: volley.def.damageType, base: damage });
    touched.add(next.id);
    from = next.position;
  }
}

export function tickTowers(ctx: GameContext, dt: number): void {
  const nowMs = gameClockMs(ctx);
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
  const scales = Object.fromEntries(
    (Object.keys(COUNCIL_DAMAGE) as DamageType[]).map((type) => [type, councilScale(ctx, COUNCIL_DAMAGE[type])]),
  ) as Record<DamageType, number>;

  // A stationary turret is the degenerate pursuit case: no chase, no leash — just the shared
  // cooldown-gated attack. `scratch` carries each tower's cooldown in and out so the loop allocates nothing.
  const scratch: PursuitState = { attackCooldown: 0 };
  const world = keep.of(ctx);
  for (const tower of world.instances()) {
    if (!tower.ready) continue;
    const def = towerDef(tower.kind, editorLayers);
    const stats = towerStats(world, tower.id);
    const entity = ctx.scene.entity.get(tower.id);
    if (entity === null) continue;
    const range = stats.range + reach;
    const pool = (def.hitsAir ? all : ground).filter((candidate) => {
      const creep = session.creeps.get(candidate.id);
      return creep !== undefined && canHurt(def.damageType, creepDef(creep.catalogId).class);
    });
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
      stats,
      damage: stats.damage * scales[def.damageType] * (crit ? stats.crit_mult : 1),
      shot,
      nowMs,
      from: entity.position,
    };

    if (stats.aura > 0) {
      // A glacier heart pulses: every raider in reach is struck and chilled at once.
      for (const candidate of pool) {
        if (distance(entity.position, candidate.position) > range) continue;
        strike(ctx, tower.id, candidate.id, { type: def.damageType, base: volley.damage });
        afflict(volley, candidate.id);
      }
      ctx.scene.entity.vfx({ preset: "shockwave", to: [entity.position[0], entity.position[1] + 0.4, entity.position[2]], radius: range, durationMs: 420, color: 0x9fe6ff });
    } else {
      const chosen = new Set<string>([primary]);
      land(volley, primary, volley.damage);
      if (crit) ctx.scene.entity.floatText({ instanceId: primary, text: "Headshot", crit: true });
      for (let extra = 1; extra < stats.shots; extra += 1) {
        const next = chooseTarget(stats.aim, entity.position, range, pool, chosen);
        if (next === null) break;
        chosen.add(next);
        land(volley, next, volley.damage);
      }
      if (stats.chain > 0) chain(volley, primary, pool);
    }
    armPursuit(scratch, 1 / Math.max(0.1, stats.fireRateHz));
    session.towerCooldowns.set(tower.id, scratch.attackCooldown);
  }
}
