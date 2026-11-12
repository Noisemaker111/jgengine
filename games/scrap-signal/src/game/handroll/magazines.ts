import { createMagazine, statPoolReserve, type Magazine } from "@jgengine/core/combat/magazine";
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

/** Per-session live magazine state, keyed by gun id — reclaimed with the context (#632). */
const magazinesOf = perContext(() => new Map<string, Magazine>());

/**
 * A magazine whose reloads draw from the player's shared ammo-type stat — the reserve pool every gun
 * of that ammo class refills from, so pickups and the other guns on it are always reflected.
 */
function buildMagazine(ctx: GameContext, gun: GunDef, capacity: number, reloadMs: number, loaded: number): Magazine {
  return createMagazine({ capacity, reloadMs, loaded, reserve: statPoolReserve(ctx.scene.entity.stats, ctx.player.userId, AMMO_STAT_IDS[gun.ammo]) });
}

/**
 * The `Magazine` for a gun, created full on first access. Capacity and reload pace are recomputed
 * live from talents and perks and retuned onto the magazine, keeping the loaded count (clamped when a
 * respec shrinks `magSize`). A reload in flight keeps the pace it started with: the retune waits for it.
 */
export function gunMagazine(ctx: GameContext, gun: GunDef): Magazine {
  const magazines = magazinesOf(ctx);
  const capacity = effectiveMagSize(gun);
  const reloadMs = Math.max(1, Math.round(effectiveReloadMs(gun) / Math.max(0.1, hooks.reloadScale(ctx, gun))));
  const mag = magazines.get(gun.id);
  if (mag === undefined) {
    const built = buildMagazine(ctx, gun, capacity, reloadMs, capacity);
    magazines.set(gun.id, built);
    return built;
  }
  if (!mag.isReloading()) mag.retune({ capacity, reloadMs, overflow: "discard" });
  return mag;
}

/** Rounds currently loaded in a gun's magazine. */
export function magLoaded(ctx: GameContext, gun: GunDef): number {
  return gunMagazine(ctx, gun).loaded();
}

/** Whether a gun's reload timer is running. */
export function isReloading(ctx: GameContext, gun: GunDef): boolean {
  return gunMagazine(ctx, gun).isReloading();
}

/** Begin reloading a gun; returns false when already full, out of reserve, or already reloading. */
export function startReload(ctx: GameContext, gun: GunDef): boolean {
  const started = gunMagazine(ctx, gun).startReload();
  if (started) hooks.reloadStarted(ctx, gun);
  return started;
}

/** Stop a gun's reload in flight; the rounds still loaded stay and the reserve is untouched. Returns whether one was running. */
export function cancelReload(ctx: GameContext, gun: GunDef): boolean {
  const mag = gunMagazine(ctx, gun);
  if (!mag.isReloading()) return false;
  mag.cancelReload();
  return true;
}

/**
 * Put `rounds` back in a gun's magazine without touching the reserve, clamped to its capacity; returns
 * how many went in. A reload in flight keeps its progress. Subsistence and Triple Tap land here.
 */
export function refundRounds(ctx: GameContext, gun: GunDef, rounds: number): number {
  const mag = gunMagazine(ctx, gun);
  const snapshot = mag.snapshot();
  const next = Math.min(mag.capacity(), snapshot.loaded + Math.max(0, Math.floor(rounds)));
  const added = next - snapshot.loaded;
  if (added <= 0) return 0;
  return mag.restore({ ...snapshot, loaded: next }) ? added : 0;
}

/** Advance every live magazine's reload timer by `dtSeconds`, completing refills from the ammo reserve. */
export function tickReloads(ctx: GameContext, dtSeconds: number): void {
  for (const mag of magazinesOf(ctx).values()) mag.tick(dtSeconds);
}

/** Loaded rounds per live gun, as the save document stores them. */
export function magazineSave(ctx: GameContext): { gunId: string; loaded: number }[] {
  return [...magazinesOf(ctx)].map(([gunId, mag]) => ({ gunId, loaded: mag.loaded() }));
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
    magazines.set(gun.id, buildMagazine(ctx, gun, capacity, effectiveReloadMs(gun), loaded));
  }
}
