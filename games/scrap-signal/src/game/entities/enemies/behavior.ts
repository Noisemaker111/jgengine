import { aimToPoint } from "@jgengine/core/input/pointer";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { cameraShake } from "@jgengine/core/camera/shake/cameraShake";
import { pointInTelegraph, type TelegraphConfig, type TelegraphShape } from "@jgengine/core/combat/telegraph";
import { hashString } from "@jgengine/core/random/rng";
import { zoneLevelAt } from "../../world/zones";
import { enemyWeapons, levelDamageMult, type EnemyDef } from "./catalog";

const weaponDamage = new Map(enemyWeapons.map((weapon) => [weapon.id, weapon.weapon.damage]));

/**
 * A fighter's power above its authored numbers: what an Overdrive tier or a mutator lays on a crew.
 * `level` replaces the zone level its damage would otherwise grow from.
 */
export interface EnemyPower {
  level?: number;
  damage?: number;
  interval?: number;
  speed?: number;
}

const powerOf = perContext(() => new Map<string, EnemyPower>());

export function setEnemyPower(ctx: GameContext, id: string, power: EnemyPower): void {
  powerOf(ctx).set(id, power);
}

export function enemyPower(ctx: GameContext, id: string): EnemyPower | undefined {
  return powerOf(ctx).get(id);
}

export function clearEnemyPower(ctx: GameContext, id: string): void {
  powerOf(ctx).delete(id);
}

/**
 * What one swing or bolt from this fighter deals, times its power. Swings grow with level; bolts keep
 * their weapon's authored damage, which is how the world was tuned against the reclaimer's health.
 */
export function enemyHitDamage(ctx: GameContext, def: EnemyDef, enemyId: string, at: EntityPosition): number {
  const power = powerOf(ctx).get(enemyId);
  const base =
    def.attack.kind === "melee"
      ? def.attack.damage * levelDamageMult(power?.level ?? zoneLevelAt(at[0], at[2]))
      : weaponDamage.get(def.attack.itemId) ?? 0;
  return Math.max(1, Math.round(base * (power?.damage ?? 1)));
}

/**
 * What every hostile needs before it can be driven by either the zone AI or the front's squad
 * orders: where it came from, when it may swing again, and one target-agnostic attack step. Both
 * consumers share this so an enemy crossing the front and an enemy on a leash behave the same.
 */
const homesOf = perContext(() => new Map<string, EntityPosition>());
const nextAttackAtOf = perContext(() => new Map<string, number>());

export interface EnemyAttackMods {
  /** Multiplier on this enemy's walk speed while closing. Default `1`. */
  speedScale?: number;
  /** Multiplier on the authored attack interval. Default `1`. */
  intervalScale?: number;
  /** Multiplier on a melee reach. Default `1`. */
  reachScale?: number;
  /** True when the caller already walked it into position and only wants the swing. */
  stationary?: boolean;
}

export function rememberHome(ctx: GameContext, id: string, position: EntityPosition): void {
  homesOf(ctx).set(id, [position[0], position[1], position[2]]);
}

export function homeOf(ctx: GameContext, id: string): EntityPosition | undefined {
  return homesOf(ctx).get(id);
}

export function forgetHome(ctx: GameContext, id: string): void {
  homesOf(ctx).delete(id);
  nextAttackAtOf(ctx).delete(id);
  powerOf(ctx).delete(id);
  dropWindup(ctx, id);
}

function distance2d(a: EntityPosition, b: EntityPosition): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** Drop cadence entries for enemies that no longer exist; called once per tick by the zone AI. */
export function pruneAttackCadence(ctx: GameContext): void {
  const cadence = nextAttackAtOf(ctx);
  if (cadence.size <= 512) return;
  for (const key of cadence.keys()) {
    if (ctx.scene.entity.get(key) === null) cadence.delete(key);
  }
}

/**
 * One attack step against whatever the caller names: the player for a zone enemy, a rival for a
 * fighter on the front. Damage goes through the same `damage` effect either way, so an elite
 * killing a rival is the same pipeline as one shooting the player.
 */
export function tickEnemyAttack(
  ctx: GameContext,
  def: EnemyDef,
  enemyId: string,
  enemyPos: EntityPosition,
  targetId: string,
  targetPos: EntityPosition,
  dt: number,
  nowMs: number,
  mods: EnemyAttackMods = {},
): void {
  const power = powerOf(ctx).get(enemyId);
  const speed = def.walkSpeed * (mods.speedScale ?? 1) * (power?.speed ?? 1);
  const intervalScale = (mods.intervalScale ?? 1) * (power?.interval ?? 1);

  // A wound-up attack is committed: the fighter stands until it lands, then lands where it locked.
  const pending = windupsOf(ctx).get(enemyId);
  if (pending !== undefined) {
    if (nowMs >= pending.landsAtMs) landWindup(ctx, def, enemyId, enemyPos, pending);
    return;
  }

  if (def.attack.kind === "melee") {
    const reach = def.attack.reach * (mods.reachScale ?? 1);
    if (distance2d(enemyPos, targetPos) > reach) {
      if (mods.stationary === true) return;
      const dx = targetPos[0] - enemyPos[0];
      const dz = targetPos[2] - enemyPos[2];
      const length = Math.hypot(dx, dz) || 1;
      const point: EntityPosition = [
        targetPos[0] - (dx / length) * reach * 0.6,
        targetPos[1],
        targetPos[2] - (dz / length) * reach * 0.6,
      ];
      if (!sideStep(ctx, enemyId, enemyPos, point, speed, reach * 0.6, dt)) {
        ctx.scene.entity.moveTowardCommit(enemyId, point, { speed, stopDistance: 0.4, dt });
      }
      return;
    }
    const readyAt = nextAttackAtOf(ctx).get(enemyId) ?? 0;
    if (nowMs < readyAt) return;
    nextAttackAtOf(ctx).set(enemyId, nowMs + def.attack.intervalMs * intervalScale);
    windUp(ctx, def, enemyId, enemyPos, targetId, targetPos, nowMs, {
      kind: "swing",
      shape: { kind: "cone", radius: reach * SWING_REACH_SLACK, angle: SWING_ARC },
    });
    return;
  }

  const attack = def.attack;
  const distance = distance2d(enemyPos, targetPos);
  if (distance < attack.preferRange * BACK_OFF_SHARE && mods.stationary !== true) {
    // A gunner the player has closed on gives ground to keep its range, still shooting.
    const dx = enemyPos[0] - targetPos[0];
    const dz = enemyPos[2] - targetPos[2];
    const length = Math.hypot(dx, dz) || 1;
    const away: EntityPosition = [enemyPos[0] + (dx / length) * 4, enemyPos[1], enemyPos[2] + (dz / length) * 4];
    if (!sideStep(ctx, enemyId, enemyPos, away, speed, 0.4, dt)) {
      ctx.scene.entity.moveTowardCommit(enemyId, away, { speed, stopDistance: 0.4, dt });
    }
  } else if (distance > attack.preferRange) {
    if (mods.stationary === true) {
      if (distance > attack.preferRange * 1.9) return;
    } else {
      const dx = targetPos[0] - enemyPos[0];
      const dz = targetPos[2] - enemyPos[2];
      const length = Math.hypot(dx, dz) || 1;
      const point: EntityPosition = [
        targetPos[0] - (dx / length) * attack.preferRange * 0.8,
        targetPos[1],
        targetPos[2] - (dz / length) * attack.preferRange * 0.8,
      ];
      if (!sideStep(ctx, enemyId, enemyPos, point, speed, attack.preferRange * 0.8, dt)) {
        ctx.scene.entity.moveTowardCommit(enemyId, point, { speed, stopDistance: 0.6, dt });
      }
    }
  }
  if (!ctx.scene.entity.hasLineOfSight(enemyId, targetId)) return;
  const readyAt = nextAttackAtOf(ctx).get(enemyId) ?? 0;
  if (nowMs < readyAt) return;
  nextAttackAtOf(ctx).set(enemyId, nowMs + attack.intervalMs * intervalScale);
  windUp(ctx, def, enemyId, enemyPos, targetId, targetPos, nowMs, {
    kind: "shot",
    shape: { kind: "line", length: distance + 1.5, width: AIM_LINE_WIDTH },
  });
}

/** How far past its reach a swing's cone runs, and how wide it sweeps: the room a sidestep has to beat. */
const SWING_REACH_SLACK = 1.25;
const SWING_ARC = (80 * Math.PI) / 180;
/** Width of the line a gunner draws while it aims. */
const AIM_LINE_WIDTH = 0.7;
/** A gunner closer to its target than this share of its preferred range backs away. */
export const BACK_OFF_SHARE = 0.45;

/**
 * How long each family holds an attack before it lands, in ms: beasts are quick, scrapjacks readable,
 * bosses slow and heavy. An elite takes a quarter longer and hits as hard as ever. A gunner's aim is
 * read the same way: the line shows where the round is going.
 */
const WINDUP_MS: Record<EnemyDef["family"], { swing: number; shot: number }> = {
  ripper: { swing: 380, shot: 360 },
  scrapjack: { swing: 520, shot: 420 },
  boss: { swing: 680, shot: 520 },
};

export function windupMs(def: EnemyDef, kind: "swing" | "shot"): number {
  return Math.round(WINDUP_MS[def.family][kind] * (def.elite ? 1.25 : 1));
}

interface Windup {
  kind: "swing" | "shot";
  targetId: string;
  /** Where the attack locked: the target's spot when the wind-up began. */
  at: EntityPosition;
  telegraph: TelegraphConfig;
  landsAtMs: number;
  cancel: () => void;
}

const windupsOf = perContext(() => new Map<string, Windup>());

/** The attack a fighter is winding up, if any, for a probe or a test. */
export function pendingWindup(ctx: GameContext, enemyId: string): { kind: "swing" | "shot"; landsAtMs: number; at: EntityPosition } | null {
  const pending = windupsOf(ctx).get(enemyId);
  return pending === undefined ? null : { kind: pending.kind, landsAtMs: pending.landsAtMs, at: pending.at };
}

function windUp(
  ctx: GameContext,
  def: EnemyDef,
  enemyId: string,
  enemyPos: EntityPosition,
  targetId: string,
  targetPos: EntityPosition,
  nowMs: number,
  attack: { kind: "swing" | "shot"; shape: TelegraphShape },
): void {
  const dir = Math.atan2(targetPos[0] - enemyPos[0], targetPos[2] - enemyPos[2]);
  const ms = windupMs(def, attack.kind);
  const at: [number, number, number] = [enemyPos[0], enemyPos[1], enemyPos[2]];
  const telegraph: TelegraphConfig = { shape: attack.shape, at, dir, windupMs: ms };
  const cancel = ctx.scene.entity.telegraph({ from: enemyId, shape: attack.shape, at, dir, windupMs: ms, kind: attack.kind === "swing" ? "danger" : "aim" });
  ctx.scene.entity.update(enemyId, { rotationY: dir });
  ctx.game.playEntityAnimation(enemyId, "attack");
  windupsOf(ctx).set(enemyId, {
    kind: attack.kind,
    targetId,
    at: [targetPos[0], targetPos[1], targetPos[2]],
    telegraph,
    landsAtMs: nowMs + ms,
    cancel,
  });
}

function landWindup(ctx: GameContext, def: EnemyDef, enemyId: string, enemyPos: EntityPosition, pending: Windup): void {
  windupsOf(ctx).delete(enemyId);
  const target = ctx.scene.entity.get(pending.targetId);
  if (target === null) return;
  const isPlayer = pending.targetId === ctx.player.userId;
  if (pending.kind === "swing") {
    if (!pointInTelegraph(pending.telegraph, target.position)) {
      if (isPlayer) ctx.scene.entity.floatText({ instanceId: pending.targetId, text: "DODGED", kind: "info" });
      return;
    }
    const damage = enemyHitDamage(ctx, def, enemyId, enemyPos);
    ctx.scene.entity.effect({ from: enemyId, to: pending.targetId, effect: "damage", via: { amount: damage } });
    if (isPlayer) cameraShake(Math.min(0.5, damage / 60));
    return;
  }
  if (def.attack.kind !== "ranged") return;
  const attack = def.attack;
  const power = powerOf(ctx).get(enemyId);
  const origin: EntityPosition = [enemyPos[0], enemyPos[1] + attack.eyeHeight, enemyPos[2]];
  // The round goes where the line pointed, so stepping off it is the counter.
  const lockedPoint: EntityPosition = [pending.at[0], pending.at[1] + 1.1, pending.at[2]];
  const shotId = ctx.scene.entity.fireProjectile({
    from: enemyId,
    via: power === undefined ? { item: attack.itemId } : { item: attack.itemId, amount: enemyHitDamage(ctx, def, enemyId, enemyPos) },
    aim: aimToPoint(origin, lockedPoint),
    effect: "damage",
  });
  const flightSeconds = Math.min(1.2, distance2d(enemyPos, pending.at) / 28);
  ctx.time.after(flightSeconds, () => {
    const settled = ctx.scene.entity.settleProjectile(shotId);
    if (isPlayer && settled.status === "settled" && settled.hits.some((hit) => hit.instanceId === pending.targetId)) {
      cameraShake(0.25);
    }
  });
}

/** Call off a fighter's wind-up, taking its warning off the ground: it lost its target or broke off. */
export function dropWindup(ctx: GameContext, enemyId: string): void {
  const windups = windupsOf(ctx);
  windups.get(enemyId)?.cancel();
  windups.delete(enemyId);
}

/** Drop wind-ups whose fighter has left the scene, so a killed attacker never lands its blow. */
export function pruneWindups(ctx: GameContext): void {
  for (const id of [...windupsOf(ctx).keys()]) {
    if (ctx.scene.entity.get(id) === null) dropWindup(ctx, id);
  }
}

/** Walk around a blocker instead of into it, keeping the same destination. */
function sideStep(
  ctx: GameContext,
  enemyId: string,
  from: EntityPosition,
  to: EntityPosition,
  speed: number,
  stopDistance: number,
  dt: number,
): boolean {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return false;
  const direction: EntityPosition = [dx / length, 0, dz / length];
  const blocked = ctx.scene.object.raycast({ origin: [from[0], 0.6, from[2]], direction, maxDistance: 1.7 });
  if (blocked === null) return false;
  const side = hashedSide(enemyId);
  const point: EntityPosition = [from[0] - direction[2] * 3 * side, from[1], from[2] + direction[0] * 3 * side];
  ctx.scene.entity.moveTowardCommit(enemyId, point, { speed, stopDistance, dt });
  return true;
}

function hashedSide(id: string): number {
  return hashString(id) % 2 === 0 ? 1 : -1;
}
