import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";

import { classById } from "../classes/catalog";
import {
  GCD_SEC,
  MELEE_RANGE,
  mitigate,
  rollCrit,
  rollWeaponDamage,
  spellAmount,
} from "../math/combat";
import type { AbilityDef, AttributeId } from "../model";
import {
  auraEntries,
  aurasOf,
  classOf,
  enterCombat,
  gainRage,
  heroOf,
  heroSheet,
  storeKeys,
  syncAuras,
  type HeroSheet,
} from "../session/hero";
import { addThreat, armorOfMob, isMobInstance } from "../ai/mobs";

const rng = seededRng("claudecraft-combat");

export const SWING_RAGE = 10;
export const HIT_TAKEN_RAGE = 5;

function say(ctx: GameContext, userId: string, text: string): void {
  ctx.scene.entity.floatText({ instanceId: userId, text, kind: "info" });
}

export function targetOf(ctx: GameContext, userId: string): string | null {
  const targetId = ctx.scene.entity.getTarget(userId);
  if (targetId === null) return null;
  if (ctx.scene.entity.get(targetId) === null) {
    ctx.scene.entity.setTarget(userId, null);
    return null;
  }
  return targetId;
}

function hostileTarget(ctx: GameContext, userId: string): string | null {
  const targetId = targetOf(ctx, userId);
  if (targetId === null) return null;
  return isMobInstance(targetId) ? targetId : null;
}

function applyAura(
  ctx: GameContext,
  targetId: string,
  sourceId: string,
  ability: AbilityDef,
  amount: number,
  buff: { stat?: string; amount?: number },
): void {
  const now = ctx.time.now();
  const list = aurasOf(targetId);
  const existing = list.findIndex((aura) => aura.id === ability.id);
  if (existing >= 0) list.splice(existing, 1);
  const duration = ability.duration ?? (ability.kind === "buff" ? 300 : 12);
  const tickEvery = ability.tickInterval ?? 3;
  list.push({
    id: ability.id,
    name: ability.name,
    icon: ability.icon,
    school: ability.school,
    kind: ability.kind === "dot" ? "dot" : ability.kind === "hot" ? "hot" : "buff",
    sourceId,
    amount,
    tickEvery,
    nextTickAt: now + tickEvery,
    expiresAt: now + duration,
    ...(buff.stat === undefined ? {} : { buffStat: buff.stat }),
    ...(buff.amount === undefined ? {} : { buffAmount: buff.amount }),
  });
  syncAuras(ctx, targetId);
}

function buffFlatAmount(sheet: HeroSheet, ability: AbilityDef): { stat?: string; amount?: number } {
  if (ability.buffStat === undefined) return {};
  const pct = ability.buffAmount ?? ability.base;
  const basis =
    ability.buffStat === "attackPower"
      ? sheet.attackPower
      : ability.buffStat === "spellPower"
        ? Math.max(sheet.spellPower, 20)
        : ability.buffStat === "armor"
          ? sheet.armor
          : sheet.attributes[ability.buffStat as AttributeId];
  return { stat: ability.buffStat, amount: Math.max(1, Math.round((basis * pct) / 100)) };
}

function dealDamage(
  ctx: GameContext,
  userId: string,
  targetId: string,
  rawAmount: number,
  crit: boolean,
  physical = true,
): number {
  const attackerLevel = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const critted = crit ? rawAmount * 2 : rawAmount;
  const amount = physical
    ? mitigate(critted, armorOfMob(targetId), attackerLevel)
    : Math.max(1, Math.round(critted));
  ctx.scene.entity.effect({ from: userId, to: targetId, effect: "damage", via: { amount } });
  addThreat(targetId, userId, amount);
  enterCombat(ctx, userId);
  return amount;
}

function abilityAmount(ctx: GameContext, userId: string, ability: AbilityDef, sheet: HeroSheet): number {
  const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  if (ability.school === "physical") {
    const weaponPart = rollWeaponDamage(rng, sheet.weapon, sheet.attackPower);
    return Math.round(weaponPart + ability.base + ability.perLevel * (level - 1));
  }
  return spellAmount(
    ability.base,
    ability.perLevel,
    level,
    sheet.spellPower,
    ability.coefficient,
    ability.castTime,
  );
}

function executeAbility(ctx: GameContext, userId: string, ability: AbilityDef): void {
  const sheet = heroSheet(ctx, userId);
  if (sheet === null) return;
  const hero = heroOf(userId);
  if (hero === null) return;
  const crit = rollCrit(rng, sheet.critPct);
  switch (ability.kind) {
    case "damage": {
      const targetId = hostileTarget(ctx, userId);
      if (targetId === null) return;
      dealDamage(
        ctx,
        userId,
        targetId,
        abilityAmount(ctx, userId, ability, sheet),
        crit,
        ability.school === "physical",
      );
      hero.autoAttack = true;
      ctx.game.store.set(storeKeys.autoAttack(userId), true);
      break;
    }
    case "heal": {
      const targetId = targetOf(ctx, userId);
      const to = targetId !== null && !isMobInstance(targetId) ? targetId : userId;
      const amount = abilityAmount(ctx, userId, ability, sheet) * (crit ? 1.5 : 1);
      ctx.scene.entity.effect({
        from: userId,
        to,
        effect: "heal",
        via: { amount: -Math.round(amount) },
      });
      break;
    }
    case "dot": {
      const targetId = hostileTarget(ctx, userId);
      if (targetId === null) return;
      const total = abilityAmount(ctx, userId, ability, sheet);
      const ticks = Math.max(1, Math.floor((ability.duration ?? 12) / (ability.tickInterval ?? 3)));
      applyAura(ctx, targetId, userId, ability, Math.max(1, Math.round(total / ticks)), {});
      dealDamage(ctx, userId, targetId, Math.max(1, Math.round(total / ticks)), false);
      break;
    }
    case "hot": {
      const targetId = targetOf(ctx, userId);
      const to = targetId !== null && !isMobInstance(targetId) ? targetId : userId;
      const total = abilityAmount(ctx, userId, ability, sheet);
      const ticks = Math.max(1, Math.floor((ability.duration ?? 12) / (ability.tickInterval ?? 3)));
      applyAura(ctx, to, userId, ability, Math.max(1, Math.round(total / ticks)), {});
      break;
    }
    case "buff": {
      applyAura(ctx, userId, userId, ability, 0, buffFlatAmount(sheet, ability));
      break;
    }
    case "aoe": {
      const targetId = hostileTarget(ctx, userId);
      const center =
        targetId !== null
          ? ctx.scene.entity.get(targetId)?.position
          : ctx.scene.entity.get(userId)?.position;
      if (center === undefined || center === null) return;
      const amount = abilityAmount(ctx, userId, ability, sheet);
      ctx.scene.entity.effect({
        from: userId,
        effect: "damage",
        via: { amount },
        at: [center[0], center[1], center[2]],
        radius: ability.aoeRadius ?? 8,
      });
      for (const hit of ctx.scene.entity.inRadius(center, ability.aoeRadius ?? 8, isMobInstance)) {
        addThreat(hit, userId, amount);
      }
      enterCombat(ctx, userId);
      break;
    }
  }
}

export function castSlot(ctx: GameContext, userId: string, slot: number): void {
  const cls = classOf(ctx, userId);
  const hero = heroOf(userId);
  if (cls === null || hero === null) return;
  if (ctx.game.store.get(storeKeys.dead(userId)) === true) return;
  const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const ability = cls.abilities[slot];
  if (ability === undefined) return;
  if (ability.levelReq > level) {
    say(ctx, userId, `Requires level ${ability.levelReq}`);
    return;
  }
  const now = ctx.time.now();
  if (hero.casting !== null) return;
  if (now < hero.gcdUntil) return;
  const resource = ctx.scene.entity.stats.get(userId, "resource")?.current ?? 0;
  const snapshot = hero.kit.state(ability.id, resource);
  if (snapshot === null || !snapshot.ready) {
    if (snapshot?.state === "no-resource") say(ctx, userId, "Not enough " + cls.resource);
    return;
  }
  if (ability.kind === "damage" || ability.kind === "dot") {
    const targetId = hostileTarget(ctx, userId);
    if (targetId === null) {
      say(ctx, userId, "No target");
      return;
    }
    const range = Math.max(ability.range, MELEE_RANGE);
    const distance = ctx.scene.entity.distance(userId, targetId);
    if (distance === null || distance > range + 1) {
      say(ctx, userId, "Out of range");
      return;
    }
    if (!ctx.scene.entity.hasLineOfSight(userId, targetId)) {
      say(ctx, userId, "No line of sight");
      return;
    }
  }
  if (ability.castTime > 0) {
    hero.casting = {
      abilityId: ability.id,
      name: ability.name,
      targetId: targetOf(ctx, userId),
      startedAt: now,
      endAt: now + ability.castTime,
    };
    ctx.game.store.set(storeKeys.cast(userId), { ...hero.casting });
    return;
  }
  commitCast(ctx, userId, ability);
}

function commitCast(ctx: GameContext, userId: string, ability: AbilityDef): void {
  const hero = heroOf(userId);
  if (hero === null) return;
  const resource = ctx.scene.entity.stats.get(userId, "resource")?.current ?? 0;
  const result = hero.kit.cast(ability.id, resource);
  if (!result.ok) return;
  if (ability.cost > 0) ctx.scene.entity.stats.delta(userId, "resource", -ability.cost);
  hero.gcdUntil = ctx.time.now() + GCD_SEC;
  executeAbility(ctx, userId, ability);
}

export function tickHero(ctx: GameContext, userId: string, dt: number): void {
  const hero = heroOf(userId);
  const cls = classOf(ctx, userId);
  if (hero === null || cls === null) return;
  hero.kit.tick(dt);
  const now = ctx.time.now();
  const self = ctx.scene.entity.get(userId);
  if (self === null) return;
  if (hero.casting !== null) {
    const moved =
      hero.lastPos !== null &&
      (Math.abs(self.position[0] - hero.lastPos[0]) > 0.04 ||
        Math.abs(self.position[2] - hero.lastPos[2]) > 0.04);
    if (moved) {
      hero.casting = null;
      ctx.game.store.delete(storeKeys.cast(userId));
      say(ctx, userId, "Interrupted");
    } else if (now >= hero.casting.endAt) {
      const ability = classById(hero.classId).abilities.find((a) => a.id === hero.casting?.abilityId);
      hero.casting = null;
      ctx.game.store.delete(storeKeys.cast(userId));
      if (ability !== undefined) commitCast(ctx, userId, ability);
    }
  }
  hero.lastPos = [self.position[0], self.position[1], self.position[2]];
  if (hero.autoAttack) {
    const targetId = hostileTarget(ctx, userId);
    if (targetId === null) {
      hero.autoAttack = false;
      ctx.game.store.set(storeKeys.autoAttack(userId), false);
    } else if (now >= hero.nextSwingAt) {
      const sheet = heroSheet(ctx, userId);
      const distance = ctx.scene.entity.distance(userId, targetId);
      if (sheet !== null && distance !== null && distance <= MELEE_RANGE + 0.8) {
        const crit = rollCrit(rng, sheet.critPct);
        const raw = rollWeaponDamage(rng, sheet.weapon, sheet.attackPower);
        dealDamage(ctx, userId, targetId, crit ? raw * 2 : raw, false);
        gainRage(ctx, userId, SWING_RAGE);
        hero.nextSwingAt = now + sheet.weapon.speed;
      } else {
        hero.nextSwingAt = now + 0.4;
      }
    }
  }
  if (now >= hero.regenAt) {
    hero.regenAt = now + 2;
    const sheet = heroSheet(ctx, userId);
    if (sheet !== null && ctx.game.store.get(storeKeys.dead(userId)) !== true) {
      const stats = ctx.scene.entity.stats;
      const fighting = now < hero.combatUntil;
      if (cls.resource === "mana") {
        stats.delta(userId, "resource", Math.round(sheet.attributes.spi * 0.5));
      } else if (cls.resource === "energy") {
        stats.delta(userId, "resource", 20);
      } else if (!fighting) {
        stats.delta(userId, "resource", -3);
      }
      if (!fighting) stats.delta(userId, "health", Math.round(sheet.attributes.spi * 0.3) + 1);
    }
  }
}

export function tickAuras(ctx: GameContext): void {
  const now = ctx.time.now();
  for (const [instanceId, list] of auraEntries()) {
    if (list.length === 0) continue;
    if (ctx.scene.entity.get(instanceId) === null) {
      list.length = 0;
      syncAuras(ctx, instanceId);
      continue;
    }
    let changed = false;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const aura = list[i];
      if (aura.kind !== "buff" && now >= aura.nextTickAt) {
        aura.nextTickAt += aura.tickEvery;
        if (aura.kind === "dot") {
          ctx.scene.entity.effect({
            from: aura.sourceId,
            to: instanceId,
            effect: "damage",
            via: { amount: aura.amount },
          });
          addThreat(instanceId, aura.sourceId, aura.amount);
        } else {
          ctx.scene.entity.effect({
            from: aura.sourceId,
            to: instanceId,
            effect: "heal",
            via: { amount: -aura.amount },
          });
        }
        changed = true;
      }
      if (now >= aura.expiresAt) {
        list.splice(i, 1);
        changed = true;
      }
    }
    if (changed) syncAuras(ctx, instanceId);
  }
}
