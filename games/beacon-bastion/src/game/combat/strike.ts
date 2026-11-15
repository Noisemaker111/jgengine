import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { gameClockMs } from "../session";
import { wifiOff } from "../sinks";
import { vec3 } from "@jgengine/core/world/vec3";

import { difficultyOf } from "../campaign";
import { creepDef } from "../entities/enemies/catalog";
import { session, type CreepRuntime } from "../session";
import { hitDamage, type DamageType } from "./damage";

/** Armor tech gains when it finishes "Installing Update..." uninterrupted. */
export const UPDATE_ARMOR = 20;
/** Extra share of damage tech takes while it stands still installing (burst it down). */
export const INSTALLING_VULNERABILITY = 0.25;

export interface Strike {
  type: DamageType;
  base: number;
  /** Armor the hit ignores. */
  pen?: number;
}

/** Armor a Wi-Fi router lends tech standing in its signal, the strongest router's only. */
function boostArmor(ctx: GameContext, creep: CreepRuntime): number {
  const at = ctx.scene.entity.get(creep.instanceId)?.position;
  if (at === undefined || wifiOff(gameClockMs(ctx))) return 0;
  let best = 0;
  for (const other of session.creeps.values()) {
    if (other.instanceId === creep.instanceId) continue;
    const boosts = creepDef(other.catalogId).boosts;
    if (boosts === undefined || boosts.armor <= best) continue;
    const pose = ctx.scene.entity.get(other.instanceId)?.position;
    if (pose !== undefined && vec3.distance(at, pose) <= boosts.radius) best = boosts.armor;
  }
  return best;
}

/** Tech's armor right now: its own, the difficulty's, an update's and a router's, less what a jackhammer crushed. */
export function raiderArmor(ctx: GameContext, instanceId: string, catalogId: string): number {
  const creep = session.creeps.get(instanceId);
  const crushed = session.statuses.statDelta(instanceId, "armor_loss");
  const updated = creep?.updated === true ? UPDATE_ARMOR : 0;
  const boosted = creep === undefined ? 0 : boostArmor(ctx, creep);
  return Math.max(0, creepDef(catalogId).armor + difficultyOf(ctx).armor + updated + boosted - crushed);
}

/** Whether the tech is frozen in place (a Cease and Desist, a stun, tangled yarn). */
export function isFrozen(instanceId: string): boolean {
  return session.statuses.has(instanceId, "freeze");
}

/** Whether the tech is soaked: a live wire lands 2.5 times harder on it. */
export function isWet(instanceId: string): boolean {
  return session.statuses.has(instanceId, "wet");
}

/** The share of damage a data center still on mains power lets through. */
function powerShare(creep: CreepRuntime): number {
  const power = creepDef(creep.catalogId).power;
  return power !== undefined && creep.power !== null && creep.power > 0 ? power.poweredDamage : 1;
}

/** What a shield and mains power let through to health, after they soak their share. */
function throughShield(creep: CreepRuntime, amount: number): number {
  let through = amount * powerShare(creep);
  if (creep.shield !== null && creep.shield.current() > 0) through = creep.shield.damage(through);
  return through;
}

/**
 * Land one hit on tech: the damage chart, armor and wetness first, then a shield soaks what it can
 * and mains power shrugs off its share, and the rest goes through the entity's damage effect, which
 * kills and pays the bounty the usual way. Returns what reached health.
 */
export function strike(ctx: GameContext, from: string, targetId: string, hit: Strike, scale = 1): number {
  const creep = session.creeps.get(targetId);
  if (creep === undefined) return 0;
  const def = creepDef(creep.catalogId);
  let amount = hitDamage({
    type: hit.type,
    base: hit.base,
    raider: def.class,
    armor: raiderArmor(ctx, targetId, creep.catalogId),
    pen: hit.pen ?? 0,
    brittle: session.statuses.statDelta(targetId, "brittle") + (creep.installing > 0 ? INSTALLING_VULNERABILITY : 0),
    wet: isWet(targetId),
  }) * scale;
  if (amount <= 0) return 0;
  amount = throughShield(creep, amount);
  if (amount <= 0) return 0;
  ctx.scene.entity.effect({ from, to: targetId, effect: "damage", via: { amount } });
  return amount;
}

/** Raw damage that skips the chart: a scald's tick, a blackout. Shields and mains power still soak it. */
export function scorch(ctx: GameContext, from: string, targetId: string, amount: number): number {
  const creep = session.creeps.get(targetId);
  if (creep === undefined || amount <= 0) return 0;
  const through = throughShield(creep, amount);
  if (through <= 0) return 0;
  ctx.scene.entity.effect({ from, to: targetId, effect: "damage", via: { amount: through } });
  return through;
}
