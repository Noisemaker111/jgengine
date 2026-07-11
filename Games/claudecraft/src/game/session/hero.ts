import { createAbilityKit, type AbilityKit } from "@jgengine/core/combat/abilityKit";
import { createTalentTree, type TalentTree } from "@jgengine/core/game/talents";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { classById } from "../classes/catalog";
import { itemDefById } from "../items/catalog";
import { resolveAbilityMods } from "../talents/abilityMods";
import { SPECS, TALENT_POINTS_RULE } from "../talents/catalog";
import { CLASS_ENTITY_ID, type HeroStatId } from "../model";
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
  kind: "dot" | "hot" | "buff" | "drink";
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
  talents: TalentTree<HeroStatId> | null;
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
  bar: (userId: string) => `bar:${userId}`,
  spec: (userId: string) => `spec:${userId}`,
  talents: (userId: string) => `talents:${userId}`,
  rested: (userId: string) => `rested:${userId}`,
  bank: (userId: string) => `bank:${userId}`,
  professions: (userId: string) => `profs:${userId}`,
} as const;

export function talentPointsForLevel(level: number): number {
  if (level < TALENT_POINTS_RULE.firstLevel) return 0;
  return (level - TALENT_POINTS_RULE.firstLevel + 1) * TALENT_POINTS_RULE.perLevel;
}

export interface TalentsView {
  specId: string;
  pointsAvailable: number;
  pointsSpent: number;
  ranks: Record<string, number>;
  granted: readonly string[];
}

export function syncTalents(ctx: GameContext, userId: string): void {
  const hero = heroes.get(userId);
  const specId = ctx.game.store.get(storeKeys.spec(userId));
  if (hero?.talents == null || typeof specId !== "string") return;
  const spec = SPECS.find((entry) => entry.id === specId);
  const ranks: Record<string, number> = {};
  for (const node of spec?.nodes ?? []) ranks[node.id] = hero.talents.rank(node.id);
  const view: TalentsView = {
    specId,
    pointsAvailable: hero.talents.pointsAvailable(),
    pointsSpent: hero.talents.pointsSpent(),
    ranks,
    granted: hero.talents.resolved().abilities ?? [],
  };
  ctx.game.store.set(storeKeys.talents(userId), view);
}

export function chooseSpec(ctx: GameContext, userId: string, specId: string): boolean {
  const hero = heroes.get(userId);
  const spec = SPECS.find((entry) => entry.id === specId);
  if (hero === undefined || spec === undefined || spec.classId !== hero.classId) return false;
  if (ctx.game.store.get(storeKeys.spec(userId)) !== undefined) return false;
  const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  hero.talents = createTalentTree<HeroStatId>({
    nodes: spec.nodes,
    points: talentPointsForLevel(level),
  });
  ctx.game.store.set(storeKeys.spec(userId), specId);
  syncTalents(ctx, userId);
  return true;
}

export function allocateTalent(ctx: GameContext, userId: string, nodeId: string): boolean {
  const hero = heroes.get(userId);
  if (hero?.talents == null) return false;
  const result = hero.talents.allocate(nodeId);
  if (!result.ok) return false;
  syncTalents(ctx, userId);
  applyAbilityTalentRetunes(ctx, userId);
  applySheet(ctx, userId);
  return true;
}

export function abilityModsOf(ctx: GameContext, userId: string) {
  const view = ctx.game.store.get(storeKeys.talents(userId)) as TalentsView | undefined;
  return resolveAbilityMods(view?.ranks ?? {});
}

export function applyAbilityTalentRetunes(ctx: GameContext, userId: string): void {
  const hero = heroes.get(userId);
  const cls = classOf(ctx, userId);
  if (hero === undefined || cls === null) return;
  const mods = abilityModsOf(ctx, userId);
  for (const ability of cls.abilities) {
    const mod = mods.byAbility.get(ability.id);
    const cooldownMs = Math.max(
      0,
      ability.cooldown * 1000 * (1 + (mod?.cooldownPct ?? 0)),
    );
    const resourceCost = Math.max(0, Math.round(ability.cost * (1 + (mod?.costPct ?? 0))));
    hero.kit.retuneSlot(ability.id, { cooldownMs, resourceCost });
  }
}

export function grantTalentPoint(ctx: GameContext, userId: string, level: number): void {
  const hero = heroes.get(userId);
  if (hero?.talents == null || level < TALENT_POINTS_RULE.firstLevel) return;
  hero.talents.grantPoints(TALENT_POINTS_RULE.perLevel);
  syncTalents(ctx, userId);
}

export function barOf(ctx: GameContext, userId: string): readonly string[] {
  const raw = ctx.game.store.get(storeKeys.bar(userId));
  return Array.isArray(raw) ? (raw as string[]) : [];
}

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
  const talentStats = heroes.get(userId)?.talents?.resolved().stats;
  const talented = (stat: string, value: number): number => {
    const modifier = talentStats?.[stat as keyof typeof talentStats];
    if (modifier === undefined) return value;
    return (value + (modifier.add ?? 0)) * (modifier.multiply ?? 1);
  };
  for (const stat of Object.keys(attributes) as (keyof typeof attributes)[]) {
    attributes[stat] = Math.round(talented(stat, attributes[stat]));
  }
  const maxHp = cls.baseHp + cls.hpPerLevel * (level - 1) + attributes.sta * HP_PER_STA;
  const maxResource =
    cls.resource === "mana"
      ? cls.baseResource + cls.resourcePerLevel * (level - 1) + attributes.int * MANA_PER_INT
      : 100;
  return {
    attributes,
    maxHp: Math.round(talented("maxHp", maxHp)),
    maxResource: Math.round(talented("maxResource", maxResource)),
    attackPower: talented(
      "attackPower",
      attributes.str * ATTACK_POWER_PER_STR + Math.floor(attributes.agi / 2) + bonusAp,
    ),
    spellPower: talented("spellPower", attributes.int * SPELL_POWER_PER_INT + bonusSp),
    armor: talented("armor", armor + attributes.agi * 2),
    critPct: talented("critPct", BASE_CRIT_PCT + attributes.agi * 0.05),
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
    talents: null,
  };
  heroes.set(userId, hero);
  const stats = ctx.scene.entity.stats;
  stats.set(userId, "level", { max: MAX_LEVEL, current: 1 });
  stats.set(userId, "xp", { max: 400, current: 0 });
  applySheet(ctx, userId, { fill: true });
  ctx.player.applyLoadout(userId, `kit_${cls.id}`);
  const equips: Partial<Record<EquipSlot, string>> = { mainhand: cls.startWeapon };
  ctx.player.inventory.take("bags", cls.startWeapon, 1);
  ctx.game.store.set(storeKeys.equip(userId), equips);
  ctx.game.store.set(
    storeKeys.bar(userId),
    [...cls.abilities]
      .sort((a, b) => a.levelReq - b.levelReq)
      .slice(0, 9)
      .map((ability) => ability.id),
  );
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

export function teleportHero(ctx: GameContext, userId: string, x: number, z: number): boolean {
  const stats = ctx.scene.entity.stats;
  const held = (["health", "resource", "xp", "level"] as const).map(
    (statId) => [statId, stats.get(userId, statId)] as const,
  );
  if (ctx.scene.entity.get(userId) === null) return false;
  ctx.scene.entity.despawn(userId);
  ctx.scene.entity.spawn(CLASS_ENTITY_ID, {
    id: userId,
    position: [x, ctx.world.groundHeightAt(x, z), z],
  });
  for (const [statId, value] of held) {
    if (value !== null) stats.set(userId, statId, { max: value.max, current: value.current });
  }
  applySheet(ctx, userId);
  const hero = heroes.get(userId);
  if (hero !== undefined) {
    hero.casting = null;
    hero.autoAttack = false;
    hero.lastPos = null;
  }
  ctx.game.store.delete(storeKeys.cast(userId));
  ctx.game.store.set(storeKeys.autoAttack(userId), false);
  return true;
}

export function resetHero(userId: string): void {
  heroes.delete(userId);
}
