import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { AMMO_STAT_IDS, type AmmoPool } from "../ammo";
import type { EnemyDef } from "../entities/enemies/catalog";
import { gunById } from "../handroll";
import { gearItems } from "./gear/catalog";

export function ammoRollsFor(enemy: Pick<EnemyDef, "family" | "elite">, roll: number, starved: boolean): number {
  if (enemy.family === "boss") return 2;
  if (starved) return 1;
  if (enemy.elite) return roll < 0.6 ? 1 : 0;
  return roll < 0.4 ? 1 : 0;
}

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

export function ammoStarved(ctx: GameContext): boolean {
  return carriedPools(ctx).some((pool) => poolFill(ctx, pool) < STARVED_FILL);
}

export function ammoPacksFor(ctx: GameContext, count: number): string[] {
  return carriedPools(ctx)
    .sort((a, b) => poolFill(ctx, a) - poolFill(ctx, b))
    .slice(0, count)
    .flatMap((pool) => {
      const pack = gearItems.find((item) => item.kind === "ammo" && item.ammo === pool);
      return pack === undefined ? [] : [pack.id];
    });
}

export function ammoPackFor(ctx: GameContext): string | null {
  return ammoPacksFor(ctx, 1)[0] ?? null;
}
