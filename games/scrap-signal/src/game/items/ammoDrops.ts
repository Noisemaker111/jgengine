import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { AMMO_STAT_IDS, type AmmoPool } from "../ammo";
import type { EnemyDef } from "../entities/enemies/catalog";
import { gunById } from "../handroll";
import { gearItems } from "./gear/catalog";

/**
 * How many ammo packs a kill drops and how often: bosses always pay, elites usually, the rest
 * sometimes, and every kill pays while you are starved for ammo (Borderlands weights ammo drops
 * toward what you are short of).
 */
export function ammoRollsFor(enemy: Pick<EnemyDef, "family" | "elite">, roll: number, starved: boolean): number {
  if (enemy.family === "boss") return 2;
  if (starved) return 1;
  if (enemy.elite) return roll < 0.6 ? 1 : 0;
  return roll < 0.4 ? 1 : 0;
}

/** Below this share of a carried gun's pool, kills always drop ammo. */
const STARVED_FILL = 0.2;

function carriedPools(ctx: GameContext): AmmoPool[] {
  const pools = new Set<AmmoPool>();
  for (const slot of ctx.player.inventory.state("hotbar").slots) {
    const gun = slot === null ? undefined : gunById(slot.itemId);
    if (gun !== undefined) pools.add(gun.ammo);
  }
  return [...pools];
}

function poolFill(ctx: GameContext, pool: AmmoPool): number {
  const stat = ctx.scene.entity.stats.get(ctx.player.userId, AMMO_STAT_IDS[pool]);
  return stat === null || stat.max <= 0 ? 1 : stat.current / stat.max;
}

/** Some carried gun's pool is nearly empty. */
export function ammoStarved(ctx: GameContext): boolean {
  return carriedPools(ctx).some((pool) => poolFill(ctx, pool) < STARVED_FILL);
}

/**
 * Ammo packs for the guns you carry, emptiest pool first, one per pool, at most `count`: Borderlands
 * drops ammo for what you are holding.
 */
export function ammoPacksFor(ctx: GameContext, count: number): string[] {
  return carriedPools(ctx)
    .sort((a, b) => poolFill(ctx, a) - poolFill(ctx, b))
    .slice(0, count)
    .flatMap((pool) => {
      const pack = gearItems.find((item) => item.kind === "ammo" && item.ammo === pool);
      return pack === undefined ? [] : [pack.id];
    });
}

/** The ammo pack a kill drops: for the carried gun whose pool is emptiest. `null` when the player carries no gun. */
export function ammoPackFor(ctx: GameContext): string | null {
  return ammoPacksFor(ctx, 1)[0] ?? null;
}
