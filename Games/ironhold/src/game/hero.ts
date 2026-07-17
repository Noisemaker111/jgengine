import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { leveling, type Curve, type LevelingStatAccess } from "@jgengine/core/game/progression";
import type { StatCatalog } from "@jgengine/core/scene/entityStats";

import { combatantDef, isHostile } from "./catalog";
import { session } from "./session";
import { resolveDamage } from "./upgrades";

/**
 * Bram the Bold — the Vanguard hero. He carries a mana pool and an active ability (Thunder Clap, an
 * AoE burst around him), and earns XP from Marauder kills to level up. Mana, XP, and level live on
 * the hero *entity* stat pools (so the HUD reads them reactively via `useEntityStat`); only the
 * transient ability cooldown rides the `session` clock. Combat routes through the shared
 * {@link resolveDamage} seam, so weapon/armor research applies to the hero and his ability too.
 */

/** The hero's scene instance id (authored in `editor.scene.json`; the HUD portrait reads it too). */
export const HERO_ID = "hero";

export const HERO_MAX_LEVEL = 5;
export const HERO_BASE_MANA = 100;
export const MANA_PER_LEVEL = 20;
/** Mana regenerated per second. */
export const MANA_REGEN = 3;
/** Extra max health and per-swing damage each level grants the hero. */
export const HERO_HP_PER_LEVEL = 70;
export const HERO_DMG_PER_LEVEL = 4;

/** Thunder Clap: an instant burst to every enemy unit around the hero. */
export const THUNDERCLAP_COST = 40;
export const THUNDERCLAP_COOLDOWN = 9;
export const THUNDERCLAP_RADIUS = 7;
export const THUNDERCLAP_BASE_DMG = 26;
export const THUNDERCLAP_DMG_PER_LEVEL = 8;

/** XP to advance from level L to L+1 (per-level thresholds). */
const XP_FOR_LEVEL: Curve = { kind: "linear", base: 40, per: 60, round: "round" };

export const heroTrack = leveling({
  xpForLevel: XP_FOR_LEVEL,
  maxLevel: HERO_MAX_LEVEL,
  startLevel: 1,
  thresholdMode: "perLevel",
});

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

/** Award XP for a Marauder kill; returns the number of levels gained (0 if the hero is gone). */
export function grantHeroXp(ctx: GameContext, amount: number): number {
  if (amount <= 0 || ctx.scene.entity.get(HERO_ID) === null) return 0;
  return heroTrack.grantXp(heroAccess(ctx), HERO_ID, amount, () => onHeroLevelUp(ctx));
}

/** True when Thunder Clap can fire right now (hero alive, off cooldown, enough mana). */
export function thunderClapReady(ctx: GameContext): boolean {
  if (session.over || ctx.scene.entity.get(HERO_ID) === null) return false;
  if (session.heroState.abilityCooldown > 0) return false;
  const mana = ctx.scene.entity.stats.get(HERO_ID, "mana");
  return mana !== null && mana.current >= THUNDERCLAP_COST;
}

/** Cast Thunder Clap: spend mana, start the cooldown, and burst every enemy unit in radius. */
export function castThunderClap(ctx: GameContext): void {
  if (!thunderClapReady(ctx)) return;
  const hero = ctx.scene.entity.get(HERO_ID);
  if (hero === null) return;
  ctx.scene.entity.stats.delta(HERO_ID, "mana", -THUNDERCLAP_COST);
  session.heroState.abilityCooldown = THUNDERCLAP_COOLDOWN;
  const base = THUNDERCLAP_BASE_DMG + (heroLevel(ctx) - 1) * THUNDERCLAP_DMG_PER_LEVEL;
  const cx = hero.position[0];
  const cz = hero.position[2];
  for (const u of session.units.values()) {
    if (!isHostile("player", u.faction) || u.kind === "building") continue;
    const ent = ctx.scene.entity.get(u.id);
    if (ent === null) continue;
    if (Math.hypot(ent.position[0] - cx, ent.position[2] - cz) <= THUNDERCLAP_RADIUS) {
      const amount = resolveDamage(base, "player", u.faction);
      ctx.scene.entity.effect({ from: HERO_ID, to: u.id, effect: "damage", via: { amount } });
    }
  }
}

/** Per-frame hero upkeep: regenerate mana and tick down the ability cooldown. */
export function tickHero(ctx: GameContext, dt: number): void {
  if (session.over) return;
  if (session.heroState.abilityCooldown > 0) {
    session.heroState.abilityCooldown = Math.max(0, session.heroState.abilityCooldown - dt);
  }
  if (ctx.scene.entity.get(HERO_ID) === null) return;
  const mana = ctx.scene.entity.stats.get(HERO_ID, "mana");
  if (mana !== null && mana.current < mana.max) {
    ctx.scene.entity.stats.delta(HERO_ID, "mana", MANA_REGEN * dt);
  }
}
