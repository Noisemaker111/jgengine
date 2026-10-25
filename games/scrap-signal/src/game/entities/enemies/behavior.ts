import { aimToPoint } from "@jgengine/core/input/pointer";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { cameraShake } from "@jgengine/shell/camera";
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
    ctx.game.playEntityAnimation(enemyId, "attack");
    const damage = enemyHitDamage(ctx, def, enemyId, enemyPos);
    ctx.scene.entity.effect({ from: enemyId, to: targetId, effect: "damage", via: { amount: damage } });
    if (targetId === ctx.player.userId) cameraShake(Math.min(0.5, damage / 60));
    return;
  }

  const attack = def.attack;
  const distance = distance2d(enemyPos, targetPos);
  if (distance > attack.preferRange) {
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
  ctx.game.playEntityAnimation(enemyId, "attack");
  const origin: EntityPosition = [enemyPos[0], enemyPos[1] + attack.eyeHeight, enemyPos[2]];
  const targetPoint: EntityPosition = [targetPos[0], targetPos[1] + 1.1, targetPos[2]];
  const shotId = ctx.scene.entity.fireProjectile({
    from: enemyId,
    via: power === undefined ? { item: attack.itemId } : { item: attack.itemId, amount: enemyHitDamage(ctx, def, enemyId, enemyPos) },
    aim: aimToPoint(origin, targetPoint),
    effect: "damage",
  });
  const flightSeconds = Math.min(1.2, distance / 28);
  const playerId = ctx.player.userId;
  ctx.time.after(flightSeconds, () => {
    const settled = ctx.scene.entity.settleProjectile(shotId);
    if (settled.status === "settled" && settled.hits.some((hit) => hit.instanceId === playerId)) {
      cameraShake(0.25);
    }
  });
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
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return hash % 2 === 0 ? 1 : -1;
}
