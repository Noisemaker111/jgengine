import { createAbilityKit, type AbilityKit } from "@jgengine/core/combat/abilityKit";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { classById } from "../classes/catalog";
import { itemDefById } from "../items/catalog";
import {
  ATTACK_POWER_PER_STR,
  BASE_CRIT_PCT,
  HP_PER_STA,
  MANA_PER_INT,
  SPELL_POWER_PER_INT,
} from "../math/combat";
import type { AttributeId, ClassDef, EquipSlot } from "../model";
import { MAX_LEVEL } from "../progression/curves";

export interface AuraState {
  id: string;
  name: string;
  icon: string;
  school: string;
  kind: "dot" | "hot" | "buff";
  sourceId: string;
  amount: number;
  tickEvery: number;
  nextTickAt: number;
  expiresAt: number;
  buffStat?: string;
  buffAmount?: number;
}

export interface CastState {
  abilityId: string;
  name: string;
  targetId: string | null;
  startedAt: number;
  endAt: number;
}

export interface HeroRuntime {
  classId: string;
  kit: AbilityKit;
  gcdUntil: number;
  casting: CastState | null;
  nextSwingAt: number;
  autoAttack: boolean;
  combatUntil: number;
  lastPos: readonly [number, number, number] | null;
  regenAt: number;
}

const heroes = new Map<string, HeroRuntime>();
const auras = new Map<string, AuraState[]>();

export const storeKeys = {
  class: (userId: string) => `class:${userId}`,
  equip: (userId: string) => `equip:${userId}`,
  dead: (userId: string) => `dead:${userId}`,
  cast: (userId: string) => `cast:${userId}`,
  panel: (userId: string) => `panel:${userId}`,
  shop: (userId: string) => `shop:${userId}`,
  dialogue: (userId: string) => `dialogue:${userId}`,
  autoAttack: (userId: string) => `autoattack:${userId}`,
  auras: (instanceId: string) => `auras:${instanceId}`,
} as const;

export function heroOf(userId: string): HeroRuntime | null {
  return heroes.get(userId) ?? null;
}

export function classOf(ctx: GameContext, userId: string): ClassDef | null {
  const classId = ctx.game.store.get(storeKeys.class(userId));
  return typeof classId === "string" ? classById(classId) : null;
}

export function equipsOf(ctx: GameContext, userId: string): Partial<Record<EquipSlot, string>> {
  const raw = ctx.game.store.get(storeKeys.equip(userId));
  return (raw as Partial<Record<EquipSlot, string>> | undefined) ?? {};
}

export function auraEntries(): IterableIterator<[string, AuraState[]]> {
  return auras.entries();
}

export function aurasOf(instanceId: string): AuraState[] {
  let list = auras.get(instanceId);
  if (list === undefined) {
    list = [];
    auras.set(instanceId, list);
  }
  return list;
}

export function syncAuras(ctx: GameContext, instanceId: string): void {
  ctx.game.store.set(storeKeys.auras(instanceId), aurasOf(instanceId).map((aura) => ({ ...aura })));
}

export function clearAuras(ctx: GameContext, instanceId: string): void {
  auras.delete(instanceId);
  ctx.game.store.delete(storeKeys.auras(instanceId));
}

export interface HeroSheet {
  attributes: Record<AttributeId, number>;
  maxHp: number;
  maxResource: number;
  attackPower: number;
  spellPower: number;
  armor: number;
  critPct: number;
  weapon: { min: number; max: number; speed: number };
}

const FIST = { min: 1, max: 3, speed: 2 };

export function heroSheet(ctx: GameContext, userId: string): HeroSheet | null {
  const cls = classOf(ctx, userId);
  if (cls === null) return null;
  const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const equips = equipsOf(ctx, userId);
  const attributes: Record<AttributeId, number> = {
    str: cls.baseStats.str + (cls.statsPerLevel.str ?? 0) * (level - 1),
    agi: cls.baseStats.agi + (cls.statsPerLevel.agi ?? 0) * (level - 1),
    sta: cls.baseStats.sta + (cls.statsPerLevel.sta ?? 0) * (level - 1),
    int: cls.baseStats.int + (cls.statsPerLevel.int ?? 0) * (level - 1),
    spi: cls.baseStats.spi + (cls.statsPerLevel.spi ?? 0) * (level - 1),
  };
  let armor = cls.baseStats.armor + (cls.statsPerLevel.armor ?? 0) * (level - 1);
  let weapon = FIST;
  let bonusAp = 0;
  let bonusSp = 0;
  for (const itemId of Object.values(equips)) {
    if (itemId === undefined) continue;
    const item = itemDefById(itemId);
    if (item === null) continue;
    if (item.weapon !== undefined) weapon = item.weapon;
    if (item.armor !== undefined) armor += item.armor;
    for (const [stat, amount] of Object.entries(item.stats ?? {})) {
      attributes[stat as AttributeId] += amount;
    }
  }
  for (const aura of aurasOf(userId)) {
    if (aura.kind !== "buff" || aura.buffStat === undefined || aura.buffAmount === undefined) continue;
    if (aura.buffStat === "armor") armor += aura.buffAmount;
    else if (aura.buffStat === "attackPower") bonusAp += aura.buffAmount;
    else if (aura.buffStat === "spellPower") bonusSp += aura.buffAmount;
    else attributes[aura.buffStat as AttributeId] += aura.buffAmount;
  }
  const maxHp = cls.baseHp + cls.hpPerLevel * (level - 1) + attributes.sta * HP_PER_STA;
  const maxResource =
    cls.resource === "mana"
      ? cls.baseResource + cls.resourcePerLevel * (level - 1) + attributes.int * MANA_PER_INT
      : 100;
  return {
    attributes,
    maxHp,
    maxResource,
    attackPower: attributes.str * ATTACK_POWER_PER_STR + Math.floor(attributes.agi / 2) + bonusAp,
    spellPower: attributes.int * SPELL_POWER_PER_INT + bonusSp,
    armor: armor + attributes.agi * 2,
    critPct: BASE_CRIT_PCT + attributes.agi * 0.05,
    weapon,
  };
}

export function applySheet(ctx: GameContext, userId: string, options?: { fill?: boolean }): void {
  const sheet = heroSheet(ctx, userId);
  if (sheet === null) return;
  const stats = ctx.scene.entity.stats;
  stats.set(userId, "health", { max: sheet.maxHp });
  stats.set(userId, "resource", { max: sheet.maxResource });
  if (options?.fill === true) {
    stats.set(userId, "health", { current: sheet.maxHp });
    const cls = classOf(ctx, userId);
    stats.set(userId, "resource", { current: cls?.resource === "mana" ? sheet.maxResource : 0 });
  }
}

export function selectClass(ctx: GameContext, userId: string, classId: string): void {
  const cls = classById(classId);
  ctx.game.store.set(storeKeys.class(userId), cls.id);
  const hero: HeroRuntime = {
    classId: cls.id,
    kit: createAbilityKit(
      cls.abilities.map((ability) => ({
        id: ability.id,
        cooldownMs: Math.max(ability.cooldown, 0) * 1000,
        resourceCost: ability.cost,
      })),
    ),
    gcdUntil: 0,
    casting: null,
    nextSwingAt: 0,
    autoAttack: false,
    combatUntil: 0,
    lastPos: null,
    regenAt: 0,
  };
  heroes.set(userId, hero);
  const stats = ctx.scene.entity.stats;
  stats.set(userId, "level", { max: MAX_LEVEL, current: 1 });
  stats.set(userId, "xp", { max: 400, current: 0 });
  applySheet(ctx, userId, { fill: true });
  ctx.player.applyLoadout(userId, `kit_${cls.id}`);
  const equips: Partial<Record<EquipSlot, string>> = { mainHand: cls.startWeapon };
  ctx.player.inventory.take("bags", cls.startWeapon, 1);
  ctx.game.store.set(storeKeys.equip(userId), equips);
  applySheet(ctx, userId, { fill: true });
}

export function enterCombat(ctx: GameContext, userId: string): void {
  const hero = heroes.get(userId);
  if (hero === null || hero === undefined) return;
  hero.combatUntil = ctx.time.now() + 5;
}

export function inCombat(ctx: GameContext, userId: string): boolean {
  const hero = heroes.get(userId);
  return hero !== undefined && ctx.time.now() < hero.combatUntil;
}

export function gainRage(ctx: GameContext, userId: string, amount: number): void {
  const cls = classOf(ctx, userId);
  if (cls?.resource !== "rage") return;
  ctx.scene.entity.stats.delta(userId, "resource", amount);
}

export function resetHero(userId: string): void {
  heroes.delete(userId);
}
