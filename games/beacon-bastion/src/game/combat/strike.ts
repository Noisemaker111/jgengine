import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { difficultyOf } from "../campaign";
import { creepDef } from "../entities/enemies/catalog";
import { session } from "../session";
import { hitDamage, type DamageType } from "./damage";

export interface Strike {
  type: DamageType;
  base: number;
  pen?: number;
  shieldMult?: number;
  /** Doubles against a frozen raider (Shatterpoint). */
  shatter?: boolean;
}

export function raiderArmor(ctx: GameContext, instanceId: string, catalogId: string): number {
  const cracked = session.statuses.statDelta(instanceId, "armor_loss");
  return Math.max(0, creepDef(catalogId).armor + difficultyOf(ctx).armor - cracked);
}

/** Whether the raider is held in ice (or stunned by a mortar), so it stands still and shatters. */
export function isFrozen(instanceId: string): boolean {
  return session.statuses.has(instanceId, "freeze");
}

export function strike(ctx: GameContext, from: string, targetId: string, hit: Strike): number {
  const creep = session.creeps.get(targetId);
  if (creep === undefined) return 0;
  const def = creepDef(creep.catalogId);
  const base = hit.shatter === true && isFrozen(targetId) ? hit.base * 2 : hit.base;
  let amount = hitDamage({
    type: hit.type,
    base,
    raider: def.class,
    armor: raiderArmor(ctx, targetId, creep.catalogId),
    pen: hit.pen ?? 0,
    brittle: session.statuses.statDelta(targetId, "brittle"),
  });
  if (amount <= 0) return 0;
  if (creep.shield !== null && creep.shield.current() > 0) {
    const scale = Math.max(1, hit.shieldMult ?? 1);
    amount = creep.shield.damage(amount * scale) / scale;
  }
  if (amount <= 0) return 0;
  ctx.scene.entity.effect({ from, to: targetId, effect: "damage", via: { amount } });
  return amount;
}

export function scorch(ctx: GameContext, from: string, targetId: string, amount: number): number {
  const creep = session.creeps.get(targetId);
  if (creep === undefined || amount <= 0) return 0;
  let through = amount;
  if (creep.shield !== null && creep.shield.current() > 0) through = creep.shield.damage(amount);
  if (through <= 0) return 0;
  ctx.scene.entity.effect({ from, to: targetId, effect: "damage", via: { amount: through } });
  return through;
}
