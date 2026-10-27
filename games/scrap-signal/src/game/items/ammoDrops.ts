import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { AMMO_STAT_IDS, type AmmoPool } from "../ammo";
import type { EnemyDef } from "../entities/enemies/catalog";
import { gunById } from "../handroll";
import { gearItems } from "./gear/catalog";

/** How many ammo packs a kill drops and how often: bosses always pay, elites usually, the rest sometimes. */
export function ammoRollsFor(enemy: Pick<EnemyDef, "family" | "elite">, roll: number): number {
  if (enemy.family === "boss") return 2;
  if (enemy.elite) return roll < 0.6 ? 1 : 0;
  return roll < 0.4 ? 1 : 0;
}

/**
 * The ammo pack a kill drops: Borderlands drops ammo for the guns you carry, so the pack is for the
 * carried gun whose pool is emptiest. `null` when the player carries no gun.
 */
export function ammoPackFor(ctx: GameContext): string | null {
  const userId = ctx.player.userId;
  const pools = new Set<AmmoPool>();
  for (const slot of ctx.player.inventory.state("hotbar").slots) {
    const gun = slot === null ? undefined : gunById(slot.itemId);
    if (gun !== undefined) pools.add(gun.ammo);
  }
  let best: AmmoPool | null = null;
  let bestFill = Number.POSITIVE_INFINITY;
  for (const pool of pools) {
    const stat = ctx.scene.entity.stats.get(userId, AMMO_STAT_IDS[pool]);
    const fill = stat === null || stat.max <= 0 ? 1 : stat.current / stat.max;
    if (fill < bestFill) {
      bestFill = fill;
      best = pool;
    }
  }
  if (best === null) return null;
  const pool = best;
  return gearItems.find((item) => item.kind === "ammo" && item.ammo === pool)?.id ?? null;
}
