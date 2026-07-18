import { createMagazine, type Magazine, type MagazineReserve } from "@jgengine/core/combat";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { AMMO_STAT_IDS } from "../ammo";
import { bonus } from "../characters";
import type { GunDef } from "./guns";

/** The live mag capacity for a gun after talent `magSize` bonuses — at least one round. */
export function effectiveMagSize(gun: GunDef): number {
  return Math.max(1, Math.round(gun.magSize * (1 + bonus("magSize"))));
}

/** The live reload time (ms) for a gun after talent `reloadSpeed` bonuses. */
export function effectiveReloadMs(gun: GunDef): number {
  return Math.round(gun.reloadMs / (1 + bonus("reloadSpeed")));
}

/**
 * Bridges a `Magazine`'s reload draw into the player's shared ammo-type entity stat (the reserve pool
 * every gun of that ammo class refills from). `current`/`spend`/`gain` read and write the live stat, so
 * pickups and other guns spending the same pool are always reflected — a null stat reads as an empty
 * reserve, which blocks reloads exactly like the old hand-rolled draw did.
 */
function ammoReserve(ctx: GameContext, gun: GunDef): MagazineReserve {
  const userId = ctx.player.userId;
  const statId = AMMO_STAT_IDS[gun.ammo];
  return {
    current: () => ctx.scene.entity.stats.get(userId, statId)?.current ?? 0,
    spend(amount) {
      if (amount <= 0) return true;
      const have = ctx.scene.entity.stats.get(userId, statId)?.current ?? 0;
      if (amount > have) return false;
      ctx.scene.entity.stats.delta(userId, statId, -amount);
      return true;
    },
    gain(amount) {
      if (amount > 0) ctx.scene.entity.stats.delta(userId, statId, amount);
    },
  };
}

/** A gun's live magazine plus the effective capacity/reload it was built with, for drift detection. */
interface MagEntry {
  mag: Magazine;
  capacity: number;
  reloadMs: number;
}

/** Per-session live magazine state, keyed by gun id — reclaimed with the context (#632). */
const magazinesOf = perContext(() => new Map<string, MagEntry>());

function buildEntry(ctx: GameContext, gun: GunDef, capacity: number, reloadMs: number, loaded: number): MagEntry {
  return {
    mag: createMagazine({ capacity, reloadMs, loaded, reserve: ammoReserve(ctx, gun) }),
    capacity,
    reloadMs,
  };
}

/**
 * The `Magazine` for a gun, created full on first access (matching the old `inMag = effectiveMagSize`
 * seed). `createMagazine` bakes capacity/reload at construction, but the game recomputes them live from
 * talent `bonus(...)`, so we rebuild the magazine when the effective values drift — preserving the loaded
 * count. The rebuild is deferred while a reload is in flight so its timer is never reset mid-reload, which
 * mirrors the old model that froze `reloadingUntilMs` at reload start. Because `magSize`/`reloadSpeed`
 * bonuses only ever grow during play (there is no in-game respec — the talent tree only allocates), the
 * preserved loaded count can never exceed the new, larger capacity.
 */
function magFor(ctx: GameContext, gun: GunDef): Magazine {
  const magazines = magazinesOf(ctx);
  const capacity = effectiveMagSize(gun);
  const reloadMs = effectiveReloadMs(gun);
  let entry = magazines.get(gun.id);
  if (entry === undefined) {
    entry = buildEntry(ctx, gun, capacity, reloadMs, capacity);
    magazines.set(gun.id, entry);
    return entry.mag;
  }
  if ((entry.capacity !== capacity || entry.reloadMs !== reloadMs) && !entry.mag.isReloading()) {
    entry = buildEntry(ctx, gun, capacity, reloadMs, entry.mag.loaded());
    magazines.set(gun.id, entry);
  }
  return entry.mag;
}

/** Rounds currently loaded in a gun's magazine. */
export function magLoaded(ctx: GameContext, gun: GunDef): number {
  return magFor(ctx, gun).loaded();
}

/** Whether a gun's reload timer is running. */
export function isReloading(ctx: GameContext, gun: GunDef): boolean {
  return magFor(ctx, gun).isReloading();
}

/** Begin reloading a gun; returns false when already full, out of reserve, or already reloading. */
export function startReload(ctx: GameContext, gun: GunDef): boolean {
  return magFor(ctx, gun).startReload();
}

/** Advance every live magazine's reload timer by `dtSeconds`, completing refills from the ammo reserve. */
export function tickReloads(ctx: GameContext, dtSeconds: number): void {
  for (const entry of magazinesOf(ctx).values()) entry.mag.tick(dtSeconds);
}

/** Spend a gun's per-shot ammo from the magazine; returns false without effect when insufficient. */
export function consumeRound(ctx: GameContext, gun: GunDef): boolean {
  return magFor(ctx, gun).fire(gun.ammoPerShot);
}
