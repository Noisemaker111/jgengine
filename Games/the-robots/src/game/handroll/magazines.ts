import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { AMMO_STAT_IDS } from "../ammo";
import { bonus } from "../characters";
import type { GunDef } from "./guns";
import { gunById } from "./roll";

interface MagState {
  inMag: number;
  reloadingUntilMs: number;
}

/** Per-session live magazine state, keyed by gun id — reclaimed with the context (#632). */
const magazinesOf = perContext(() => new Map<string, MagState>());

export function effectiveMagSize(gun: GunDef): number {
  return Math.max(1, Math.round(gun.magSize * (1 + bonus("magSize"))));
}

export function effectiveReloadMs(gun: GunDef): number {
  return Math.round(gun.reloadMs / (1 + bonus("reloadSpeed")));
}

export function magState(ctx: GameContext, gun: GunDef): MagState {
  const magazines = magazinesOf(ctx);
  let state = magazines.get(gun.id);
  if (state === undefined) {
    state = { inMag: effectiveMagSize(gun), reloadingUntilMs: 0 };
    magazines.set(gun.id, state);
  }
  return state;
}

export function isReloading(ctx: GameContext, gun: GunDef, nowMs: number): boolean {
  return magState(ctx, gun).reloadingUntilMs > nowMs;
}

export function startReload(ctx: GameContext, gun: GunDef, nowMs: number): boolean {
  const state = magState(ctx, gun);
  if (state.reloadingUntilMs > nowMs) return false;
  const reserve = ctx.scene.entity.stats.get(ctx.player.userId, AMMO_STAT_IDS[gun.ammo]);
  if (state.inMag >= effectiveMagSize(gun) || reserve === null || reserve.current <= 0) return false;
  state.reloadingUntilMs = nowMs + effectiveReloadMs(gun);
  return true;
}

export function finishReloads(ctx: GameContext, nowMs: number): void {
  for (const [gunId, state] of magazinesOf(ctx)) {
    if (state.reloadingUntilMs === 0 || state.reloadingUntilMs > nowMs) continue;
    const gun = gunById(gunId);
    if (gun === undefined) continue;
    const statId = AMMO_STAT_IDS[gun.ammo];
    const reserve = ctx.scene.entity.stats.get(ctx.player.userId, statId);
    if (reserve === null) continue;
    const wanted = effectiveMagSize(gun) - state.inMag;
    const taken = Math.min(wanted, reserve.current);
    if (taken > 0) {
      ctx.scene.entity.stats.delta(ctx.player.userId, statId, -taken);
      state.inMag += taken;
    }
    state.reloadingUntilMs = 0;
  }
}

export function consumeRound(ctx: GameContext, gun: GunDef): boolean {
  const state = magState(ctx, gun);
  if (state.inMag < gun.ammoPerShot) return false;
  state.inMag -= gun.ammoPerShot;
  return true;
}
