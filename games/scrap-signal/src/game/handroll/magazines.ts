import { createMagazine, type Magazine, type MagazineReserve } from "@jgengine/core/combat";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { AMMO_STAT_IDS } from "../ammo";
import { bonus } from "../characters";
import { gunById } from "./roll";
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

/**
 * Where a gun's live reload pace and reload-start notice come from beyond talents — the perk runtime
 * (Outlaw speeds reloads, Kill Clip listens for one). Hooks, not an import, so this module stays below
 * the perk runtime in the dependency order.
 */
export interface MagazineHooks {
  reloadScale(ctx: GameContext, gun: GunDef): number;
  reloadStarted(ctx: GameContext, gun: GunDef): void;
}

// Wiring, not state: set once at module load by the perk runtime; per-run values live in `ctx`.
const hooks: MagazineHooks = { reloadScale: () => 1, reloadStarted: () => {} };

export function setMagazineHooks(next: MagazineHooks): void {
  Object.assign(hooks, next);
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
 * mirrors the old model that froze `reloadingUntilMs` at reload start. A respec can shrink `magSize`, so
 * the preserved loaded count is clamped to the new capacity.
 */
function magFor(ctx: GameContext, gun: GunDef): Magazine {
  const magazines = magazinesOf(ctx);
  const capacity = effectiveMagSize(gun);
  const reloadMs = Math.max(1, Math.round(effectiveReloadMs(gun) / Math.max(0.1, hooks.reloadScale(ctx, gun))));
  let entry = magazines.get(gun.id);
  if (entry === undefined) {
    entry = buildEntry(ctx, gun, capacity, reloadMs, capacity);
    magazines.set(gun.id, entry);
    return entry.mag;
  }
  if ((entry.capacity !== capacity || entry.reloadMs !== reloadMs) && !entry.mag.isReloading()) {
    entry = buildEntry(ctx, gun, capacity, reloadMs, Math.min(capacity, entry.mag.loaded()));
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
  const started = magFor(ctx, gun).startReload();
  if (started) hooks.reloadStarted(ctx, gun);
  return started;
}

/**
 * Put `rounds` back in a gun's magazine without touching the reserve, clamped to its capacity; returns
 * how many went in. A reload in flight keeps its progress. Subsistence and Triple Tap land here.
 */
export function refundRounds(ctx: GameContext, gun: GunDef, rounds: number): number {
  const mag = magFor(ctx, gun);
  const snapshot = mag.snapshot();
  const next = Math.min(mag.capacity(), snapshot.loaded + Math.max(0, Math.floor(rounds)));
  const added = next - snapshot.loaded;
  if (added <= 0) return 0;
  return mag.restore({ ...snapshot, loaded: next }) ? added : 0;
}

/** Advance every live magazine's reload timer by `dtSeconds`, completing refills from the ammo reserve. */
export function tickReloads(ctx: GameContext, dtSeconds: number): void {
  for (const entry of magazinesOf(ctx).values()) entry.mag.tick(dtSeconds);
}

/** Spend a gun's per-shot ammo from the magazine; returns false without effect when insufficient. */
export function consumeRound(ctx: GameContext, gun: GunDef): boolean {
  return magFor(ctx, gun).fire(gun.ammoPerShot);
}

/** Loaded rounds per live gun, as the save document stores them. */
export function magazineSave(ctx: GameContext): { gunId: string; loaded: number }[] {
  return [...magazinesOf(ctx)].map(([gunId, entry]) => ({ gunId, loaded: entry.mag.loaded() }));
}

/**
 * Put loaded rounds back on each gun and refill the rest, dropping entries for guns this build no
 * longer knows. Called after a world restore, so the guns exist in the hotbar again.
 */
export function restoreMagazines(ctx: GameContext, saved: readonly { gunId: string; loaded: number }[]): void {
  const magazines = magazinesOf(ctx);
  magazines.clear();
  for (const entry of saved) {
    const gun = gunById(entry.gunId);
    if (gun === undefined) continue;
    const capacity = effectiveMagSize(gun);
    const loaded = Math.max(0, Math.min(capacity, Math.round(entry.loaded)));
    magazines.set(gun.id, buildEntry(ctx, gun, capacity, effectiveReloadMs(gun), loaded));
  }
}
