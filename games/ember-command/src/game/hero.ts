import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { leveling, type Curve, type LevelingStatAccess } from "@jgengine/core/game/progression";
import type { StatCatalog } from "@jgengine/core/scene/entityStats";

import { combatantDef } from "./catalog";

/**
 * Bram the Bold — the Vanguard hero. He carries a mana pool, earns XP from Marauder kills and from
 * cleared objectives, and levels up to offer a field-kit pick. Mana, XP, and level live on the hero
 * *entity* stat pools (so the HUD reads them reactively via `useEntityStat`); his acts, their
 * cooldowns and the picks themselves live in `heroActs.ts`, which owns the engine seams for them.
 */

/** The hero's scene instance id (authored in `editor.scene.json`; the HUD portrait reads it too). */
export const HERO_ID = "hero";

export const HERO_MAX_LEVEL = 5;
export const HERO_BASE_MANA = 100;
export const MANA_PER_LEVEL = 20;
/** Mana regenerated per second, before the draught pick. */
export const MANA_REGEN = 3;
/** Extra max health and per-swing damage each level grants the hero. */
export const HERO_HP_PER_LEVEL = 70;
export const HERO_DMG_PER_LEVEL = 4;

/** XP to advance from level L to L+1 (per-level thresholds). */
const XP_FOR_LEVEL: Curve = { kind: "linear", base: 40, per: 60, round: "round" };

export const heroTrack = leveling({
  xpForLevel: XP_FOR_LEVEL,
  maxLevel: HERO_MAX_LEVEL,
  startLevel: 1,
  thresholdMode: "perLevel",
});

/** XP an objective pays when it is entered, and when a mission is won: the line is the hero's work too. */
export const OBJECTIVE_XP = 30;
export const MISSION_XP = 90;

/** Entity stat pools the hero seeds with, merged into its content entry. */
export const HERO_STAT_SEED: StatCatalog = {
  mana: { max: HERO_BASE_MANA },
  xp: { max: heroTrack.xpForLevel(1), current: 0 },
  level: { max: HERO_MAX_LEVEL, min: 1, current: 1 },
};

/** The hero's current level (1 if he is absent). */
export function heroLevel(ctx: GameContext): number {
  return ctx.scene.entity.stats.get(HERO_ID, "level")?.current ?? 1;
}

/** Damage a unit adds on top of its catalog base — only the hero, scaling with level. */
export function heroAttackBonus(ctx: GameContext, catalogId: string): number {
  return catalogId === HERO_ID ? (heroLevel(ctx) - 1) * HERO_DMG_PER_LEVEL : 0;
}

/** XP awarded to the hero when an enemy unit of `catalogId` dies (0 for non-enemy / structures). */
export function heroXpFor(catalogId: string): number {
  const def = combatantDef(catalogId);
  if (def === null || def.faction !== "enemy" || def.kind !== "unit") return 0;
  return Math.round(def.maxHealth * 0.35);
}

/** A leveling access shim over the hero's entity stat pools (userId is ignored — always the hero). */
function heroAccess(ctx: GameContext): LevelingStatAccess {
  return {
    get(_userId, statId) {
      const s = ctx.scene.entity.stats.get(HERO_ID, statId);
      return s === null ? null : { current: s.current, max: s.max };
    },
    set(_userId, statId, patch) {
      ctx.scene.entity.stats.set(HERO_ID, statId, patch);
    },
  };
}

/** On level-up: raise (and top up) max health and max mana. Damage scales via {@link heroAttackBonus}. */
function onHeroLevelUp(ctx: GameContext): void {
  const hp = ctx.scene.entity.stats.get(HERO_ID, "health");
  if (hp !== null) ctx.scene.entity.stats.set(HERO_ID, "health", { max: hp.max + HERO_HP_PER_LEVEL, current: hp.current + HERO_HP_PER_LEVEL });
  const mana = ctx.scene.entity.stats.get(HERO_ID, "mana");
  if (mana !== null) {
    const max = mana.max + MANA_PER_LEVEL;
    ctx.scene.entity.stats.set(HERO_ID, "mana", { max, current: max });
  }
}

/** Award XP for a Marauder kill or a cleared objective; returns the number of levels gained. */
export function grantHeroXp(ctx: GameContext, amount: number): number {
  if (amount <= 0 || ctx.scene.entity.get(HERO_ID) === null) return 0;
  return heroTrack.grantXp(heroAccess(ctx), HERO_ID, amount, () => onHeroLevelUp(ctx));
}
