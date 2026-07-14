import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameIconName } from "@jgengine/react/gameIcons";

import { cue, schoolCue } from "../audio/cues";
import { classById } from "../classes/catalog";
import {
  CRIT_MULTIPLIER,
  GCD_SEC,
  MELEE_RANGE,
  mitigate,
  rollCrit,
  rollWeaponDamage,
  spellAmount,
} from "../math/combat";
import type { AbilityDef, AttributeId } from "../model";
import {
  abilityModsOf,
  auraEntries,
  aurasOf,
  barOf,
  classOf,
  enterCombat,
  externalCombatModsOf,
  gainRage,
  heroOf,
  heroSheet,
  syncAuras,
  type HeroSheet,
} from "../session/hero";
import { autoAttackStore, castStore, deadStore, restedStore } from "../session/stores";
import { addThreat, applyMobCc, armorOfMob, isMobInstance } from "../ai/mobs";
import { handlePetAbility, isPetAbility } from "../pets/systems";
import {
  consumeNextCastFree,
  fireSpellCastProcs,
  fireWeaponCritProcs,
} from "./setProcs";
import { playMeleeVfx, playSpellVfx } from "./vfx";
import { ZONES } from "../world/zones";

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
  return isMobInstance(ctx, targetId) ? targetId : null;
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
  const list = aurasOf(ctx, targetId);
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
  school?: string,
): number {
  const attackerLevel = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const critted = crit ? rawAmount * CRIT_MULTIPLIER : rawAmount;
  const amount = physical
    ? mitigate(critted, armorOfMob(ctx, targetId), attackerLevel)
    : Math.max(1, Math.round(critted));
  ctx.scene.entity.effect({ from: userId, to: targetId, effect: "damage", via: { amount } });
  ctx.scene.entity.floatText({
    instanceId: targetId,
    amount,
    kind: "damage",
    crit,
    ...(school !== undefined && school !== "physical" ? { element: school } : {}),
  });
  addThreat(ctx, targetId, userId, amount);
  enterCombat(ctx, userId);
  const lifesteal = externalCombatModsOf(ctx, userId)?.lifestealPct ?? 0;
  if (lifesteal > 0) {
    ctx.scene.entity.effect({
      from: userId,
      to: userId,
      effect: "heal",
      via: { amount: -Math.max(1, Math.round(amount * lifesteal)) },
    });
  }
  return amount;
}

function abilityAmount(ctx: GameContext, userId: string, ability: AbilityDef, sheet: HeroSheet): number {
  const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const mods = abilityModsOf(ctx, userId);
  const abilityMod = mods.byAbility.get(ability.id);
  let castTime = ability.castTime * (1 + (abilityMod?.castPct ?? 0));
  castTime = Math.max(0, castTime);
  let amount: number;
  if (ability.school === "physical") {
    const weaponPart = rollWeaponDamage(rng, sheet.weapon, sheet.attackPower);
    amount = weaponPart + ability.base + ability.perLevel * (level - 1);
    amount *= 1 + (mods.global.meleeDmgPct ?? 0);
  } else {
    amount = spellAmount(
      ability.base,
      ability.perLevel,
      level,
      sheet.spellPower,
      ability.coefficient,
      castTime,
    );
    amount *= 1 + (mods.global.spellDmgPct ?? 0);
  }
  if (ability.kind === "heal" || ability.kind === "hot") {
    amount *= 1 + (mods.global.healPct ?? 0) + (abilityMod?.healPct ?? 0);
  } else {
    amount *= 1 + (abilityMod?.dmgPct ?? 0);
    amount += abilityMod?.flatDmg ?? 0;
  }
  return Math.round(amount);
}

function applyCc(ctx: GameContext, userId: string, targetId: string, ability: AbilityDef): void {
  const cc = ability.cc;
  if (cc === undefined) return;
  if (cc.kind === "armorShred") {
    applyAura(
      ctx,
      targetId,
      userId,
      { ...ability, kind: "buff", duration: cc.durationSec },
      0,
      { stat: "armor", amount: -Math.abs(cc.amount ?? ability.base) },
    );
    addThreat(ctx, targetId, userId, 12);
    enterCombat(ctx, userId);
    return;
  }
  if (applyMobCc(ctx, targetId, userId, cc)) {
    addThreat(ctx, targetId, userId, cc.kind === "taunt" ? 1 : 8);
    enterCombat(ctx, userId);
  }
}

function executeAbility(ctx: GameContext, userId: string, ability: AbilityDef): void {
  const sheet = heroSheet(ctx, userId);
  if (sheet === null) return;
  const hero = heroOf(ctx, userId);
  if (hero === null) return;
  if (ability.selfResource !== undefined && ability.selfResource > 0) {
    ctx.scene.entity.stats.delta(userId, "resource", ability.selfResource);
  }
  if (ability.cc !== undefined) {
    const ccTarget = hostileTarget(ctx, userId);
    if (ccTarget !== null) applyCc(ctx, userId, ccTarget, ability);
    if (ability.kind === "buff" && ability.base === 0) return;
  }
  const crit = rollCrit(rng, sheet.critPct);
  switch (ability.kind) {
    case "damage": {
      const targetId = hostileTarget(ctx, userId);
      if (targetId === null) return;
      playSpellVfx(ctx, ability, { casterId: userId, targetId });
      dealDamage(
        ctx,
        userId,
        targetId,
        abilityAmount(ctx, userId, ability, sheet),
        crit,
        ability.school === "physical",
        ability.school,
      );
      if (crit && ability.school === "physical") fireWeaponCritProcs(ctx, userId, sheet, targetId);
      hero.autoAttack = true;
      autoAttackStore.write(ctx, userId, true);
      break;
    }
    case "heal": {
      const targetId = targetOf(ctx, userId);
      const to = targetId !== null && !isMobInstance(ctx, targetId) ? targetId : userId;
      const amount = abilityAmount(ctx, userId, ability, sheet) * (crit ? CRIT_MULTIPLIER : 1);
      playSpellVfx(ctx, ability, { casterId: userId, targetId: to });
      ctx.scene.entity.effect({
        from: userId,
        to,
        effect: "heal",
        via: { amount: -Math.round(amount) },
      });
      ctx.scene.entity.floatText({ instanceId: to, amount: Math.round(amount), kind: "heal", crit });
      break;
    }
    case "dot": {
      const targetId = hostileTarget(ctx, userId);
      if (targetId === null) return;
      playSpellVfx(ctx, ability, { casterId: userId, targetId });
      const total = abilityAmount(ctx, userId, ability, sheet);
      const ticks = Math.max(1, Math.floor((ability.duration ?? 12) / (ability.tickInterval ?? 3)));
      applyAura(ctx, targetId, userId, ability, Math.max(1, Math.round(total / ticks)), {});
      dealDamage(ctx, userId, targetId, Math.max(1, Math.round(total / ticks)), false, true, ability.school);
      break;
    }
    case "hot": {
      const targetId = targetOf(ctx, userId);
      const to = targetId !== null && !isMobInstance(ctx, targetId) ? targetId : userId;
      playSpellVfx(ctx, ability, { casterId: userId, targetId: to });
      const total = abilityAmount(ctx, userId, ability, sheet);
      const ticks = Math.max(1, Math.floor((ability.duration ?? 12) / (ability.tickInterval ?? 3)));
      applyAura(ctx, to, userId, ability, Math.max(1, Math.round(total / ticks)), {});
      break;
    }
    case "buff": {
      if (ability.selfTarget === false) {
        const targetId = hostileTarget(ctx, userId);
        if (targetId === null) return;
        const targets =
          ability.aoeRadius !== undefined
            ? ctx.scene.entity.inRadius(
                ctx.scene.entity.get(targetId)?.position ?? [0, 0, 0],
                ability.aoeRadius,
                (id) => isMobInstance(ctx, id),
              )
            : [targetId];
        for (const debuffed of targets) {
          playSpellVfx(ctx, ability, { casterId: userId, targetId: debuffed });
          applyAura(ctx, debuffed, userId, ability, 0, {
            ...(ability.buffStat === undefined ? {} : { stat: ability.buffStat }),
            amount: -Math.abs(ability.buffAmount ?? ability.base),
          });
          addThreat(ctx, debuffed, userId, 10);
        }
        enterCombat(ctx, userId);
        break;
      }
      playSpellVfx(ctx, ability, { casterId: userId });
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
      playSpellVfx(ctx, ability, {
        casterId: userId,
        at: [center[0], center[1], center[2]],
        radius: ability.aoeRadius ?? 8,
      });
      ctx.scene.entity.effect({
        from: userId,
        effect: "damage",
        via: { amount },
        at: [center[0], center[1], center[2]],
        radius: ability.aoeRadius ?? 8,
      });
      for (const hit of ctx.scene.entity.inRadius(center, ability.aoeRadius ?? 8, (id) => isMobInstance(ctx, id))) {
        addThreat(ctx, hit, userId, amount);
      }
      enterCombat(ctx, userId);
      break;
    }
  }
}

export function applyFood(
  ctx: GameContext,
  userId: string,
  item: { id: string; name: string; icon: GameIconName; heal?: number; restore?: number },
): void {
  const now = ctx.time.now();
  const list = aurasOf(ctx, userId);
  for (const [auraId, kind] of [
    [`food:${item.id}`, "hot"],
    [`drink:${item.id}`, "drink"],
  ] as const) {
    const amountBase = kind === "hot" ? item.heal : item.restore;
    if (amountBase === undefined || amountBase <= 0) continue;
    const existing = list.findIndex((aura) => aura.id === auraId);
    if (existing >= 0) list.splice(existing, 1);
    list.push({
      id: auraId,
      name: item.name,
      icon: item.icon,
      school: "physical",
      kind,
      sourceId: userId,
      amount: Math.max(1, Math.ceil(amountBase / 6)),
      tickEvery: 3,
      nextTickAt: now + 3,
      expiresAt: now + 18.1,
    });
  }
  syncAuras(ctx, userId);
}

export function castSlot(ctx: GameContext, userId: string, slot: number): void {
  const cls = classOf(ctx, userId);
  const hero = heroOf(ctx, userId);
  if (cls === null || hero === null) return;
  if (deadStore.read(ctx, userId)) return;
  const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const abilityId = barOf(ctx, userId)[slot];
  const ability = cls.abilities.find((entry) => entry.id === abilityId);
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
    const castMod = abilityModsOf(ctx, userId).byAbility.get(ability.id)?.castPct ?? 0;
    const hastePct = heroSheet(ctx, userId)?.hastePct ?? 0;
    const castTime = Math.max(0.05, (ability.castTime * (1 + castMod)) / (1 + hastePct));
    hero.casting = {
      abilityId: ability.id,
      name: ability.name,
      targetId: targetOf(ctx, userId),
      startedAt: now,
      endAt: now + castTime,
    };
    castStore.write(ctx, userId, { ...hero.casting });
    cue(ctx, "cast_start");
    return;
  }
  commitCast(ctx, userId, ability);
}

function commitCast(ctx: GameContext, userId: string, ability: AbilityDef): void {
  const hero = heroOf(ctx, userId);
  if (hero === null) return;
  const resource = ctx.scene.entity.stats.get(userId, "resource")?.current ?? 0;
  const result = hero.kit.cast(ability.id, resource);
  if (!result.ok) return;
  const isSpell = ability.school !== "physical";
  const free = isSpell && consumeNextCastFree(ctx, userId);
  const tunedCost = free ? 0 : (hero.kit.config(ability.id)?.resourceCost ?? ability.cost);
  if (tunedCost > 0) ctx.scene.entity.stats.delta(userId, "resource", -tunedCost);
  hero.gcdUntil = ctx.time.now() + GCD_SEC;
  if (isPetAbility(ability.id)) {
    handlePetAbility(ctx, userId, ability.id);
    return;
  }
  executeAbility(ctx, userId, ability);
  cue(ctx, schoolCue(ability.school));
  if (isSpell) {
    const sheet = heroSheet(ctx, userId);
    if (sheet !== null) fireSpellCastProcs(ctx, userId, sheet);
  }
}

export function tickHero(ctx: GameContext, userId: string, dt: number): void {
  const hero = heroOf(ctx, userId);
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
      castStore.clear(ctx, userId);
      say(ctx, userId, "Interrupted");
    } else if (now >= hero.casting.endAt) {
      const ability = classById(hero.classId).abilities.find((a) => a.id === hero.casting?.abilityId);
      hero.casting = null;
      castStore.clear(ctx, userId);
      if (ability !== undefined) commitCast(ctx, userId, ability);
    }
  }
  hero.lastPos = [self.position[0], self.position[1], self.position[2]];
  if (hero.autoAttack) {
    const targetId = hostileTarget(ctx, userId);
    if (targetId === null) {
      hero.autoAttack = false;
      autoAttackStore.write(ctx, userId, false);
    } else if (now >= hero.nextSwingAt) {
      const sheet = heroSheet(ctx, userId);
      const distance = ctx.scene.entity.distance(userId, targetId);
      if (sheet !== null && distance !== null && distance <= MELEE_RANGE + 0.8) {
        const crit = rollCrit(rng, sheet.critPct);
        const meleePct = externalCombatModsOf(ctx, userId)?.meleeDmgPct ?? 0;
        const raw = rollWeaponDamage(rng, sheet.weapon, sheet.attackPower) * (1 + meleePct);
        dealDamage(ctx, userId, targetId, raw, crit);
        playMeleeVfx(ctx, userId, targetId);
        cue(ctx, crit ? "melee_crit" : "melee_hit");
        if (crit) fireWeaponCritProcs(ctx, userId, sheet, targetId);
        gainRage(ctx, userId, SWING_RAGE);
        hero.nextSwingAt = now + sheet.weapon.speed / (1 + sheet.hastePct);
      } else {
        hero.nextSwingAt = now + 0.4;
      }
    }
  }
  if (now >= hero.regenAt) {
    hero.regenAt = now + 2;
    const inHub = ZONES.some(
      (zone) =>
        Math.hypot(self.position[0] - zone.hub.x, self.position[2] - zone.hub.z) <=
        zone.hub.radius + 6,
    );
    if (inHub) {
      const xpMax = ctx.scene.entity.stats.get(userId, "xp")?.max ?? 400;
      const pool = restedStore.read(ctx, userId);
      if (pool < xpMax * 1.5) {
        restedStore.write(ctx, userId, Math.min(xpMax * 1.5, pool + 4));
      }
    }
    const sheet = heroSheet(ctx, userId);
    if (sheet !== null && !deadStore.read(ctx, userId)) {
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
  for (const [instanceId, list] of auraEntries(ctx)) {
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
          addThreat(ctx, instanceId, aura.sourceId, aura.amount);
        } else if (aura.kind === "drink") {
          ctx.scene.entity.stats.delta(instanceId, "resource", aura.amount);
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
