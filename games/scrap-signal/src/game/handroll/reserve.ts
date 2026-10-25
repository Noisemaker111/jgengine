import { createDownedState, type DownedEntry, type DownedEvent, type DownedPhase, type DownedState } from "@jgengine/core/combat/downed";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { bonus } from "../characters";
import { reserveStore } from "../stores";

/** The Emergency Reserve window at rank 0, in seconds. */
export const RESERVE_WINDOW_SECONDS = 12;
export const POWER_SURGE_HEALTH_FRACTION = 0.4;
export const RESPAWN_CASH_FRACTION = 0.07;

/** What the shared state saves: one entry per downed instance. */
export type ReserveSnapshot = Record<string, DownedEntry>;

function reserveConfig(bleedoutSeconds: number) {
  return { bleedoutSeconds, reviveHealthFraction: POWER_SURGE_HEALTH_FRACTION };
}

/** The game's own economy: what a reconstruct costs, in cash, at the current balance. */
export function respawnFee(cash: number): number {
  return Math.floor(cash * RESPAWN_CASH_FRACTION);
}

/**
 * The chassis window itself is the engine's `downed-revive` state; this game supplies its own
 * numbers (a 12 s window scaled by Reserve Capacity) and its own economy (the surge heal and the
 * reconstruct fee). Built per context, so it is reclaimed with the session (#632).
 */
const reserveOf = perContext((): { state: DownedState } => ({
  state: createDownedState(reserveConfig(RESERVE_WINDOW_SECONDS)),
}));

function reserve(ctx: GameContext): DownedState {
  return reserveOf(ctx).state;
}

export function reservePhase(ctx: GameContext): DownedPhase {
  return reserve(ctx).phase(ctx.player.userId);
}

/**
 * Enter the window. The state is rebuilt here because the bleed-out length is config: a talent
 * rank spent since the last down applies to the next one, which is when the old machine read it.
 */
export function enterDowned(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const slot = reserveOf(ctx);
  slot.state = createDownedState(reserveConfig(RESERVE_WINDOW_SECONDS * (1 + bonus("reserveTime"))));
  slot.state.down(userId);
  syncReserve(ctx);
}

/** Power Surge: a kill inside the window revives the chassis and pays the shared revive fraction. */
export function powerSurge(ctx: GameContext): void {
  const event = reserve(ctx).revive(ctx.player.userId, 1);
  if (event?.kind !== "revived") return;
  const userId = ctx.player.userId;
  const fraction = (event.reviveHealthFraction ?? POWER_SURGE_HEALTH_FRACTION) * (1 + bonus("powerSurgeHeal"));
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) ctx.scene.entity.stats.delta(userId, "health", Math.round(health.max * fraction));
  const shield = ctx.scene.entity.stats.get(userId, "shield");
  if (shield !== null) ctx.scene.entity.stats.delta(userId, "shield", Math.round(shield.max * 0.5));
  syncReserve(ctx);
}

/** Bleed-out finished; the game pays its own reconstruct fee and puts the chassis back up. */
export function markRespawned(ctx: GameContext): void {
  reserve(ctx).clear(ctx.player.userId);
  syncReserve(ctx);
}

/** The shared state as the save document stores it. */
export function reserveSave(ctx: GameContext): ReserveSnapshot {
  return reserve(ctx).snapshot();
}

/**
 * Put a saved window back. `createDownedState` takes the window as config, so the saved bleed-out
 * remaining is the config of the rebuilt state - the resumed window is the time that was left.
 */
export function restoreReserve(ctx: GameContext, snapshot: ReserveSnapshot): void {
  const userId = ctx.player.userId;
  const saved = snapshot[userId];
  const remaining = saved !== undefined && saved.phase === "downed" && Number.isFinite(saved.bleedoutRemaining)
    ? saved.bleedoutRemaining
    : 0;
  const slot = reserveOf(ctx);
  slot.state = createDownedState(reserveConfig(remaining > 0 ? remaining : RESERVE_WINDOW_SECONDS));
  if (remaining > 0) slot.state.down(userId);
  syncReserve(ctx);
}

/** Advance the shared window; the game pays its fee when the returned events report `died`. */
export function tickDowned(ctx: GameContext, dt: number): DownedEvent[] {
  return reserve(ctx).tick(dt);
}

/** Probe line: the live window a capture or a flow reads, and the wallet the fee comes out of. */
export function reserveProbe(ctx: GameContext): Record<string, number> {
  const entry = reserve(ctx).get(ctx.player.userId);
  const phase = entry?.phase ?? "alive";
  return {
    reserveDowned: phase === "downed" ? 1 : 0,
    reserveDead: phase === "dead" ? 1 : 0,
    reserveBleedout: entry === null ? 0 : Math.round(entry.bleedoutRemaining * 10) / 10,
    scrapCash: ctx.game.economy.balance(ctx.player.userId, "cash"),
  };
}

/** Mirror the shared state's bleed-out countdown for the HUD. */
export function syncReserve(ctx: GameContext): void {
  const entry = reserve(ctx).get(ctx.player.userId);
  const phase: DownedPhase = entry?.phase ?? "alive";
  const secondsLeft = entry === null ? 0 : Math.ceil(Math.max(0, entry.bleedoutRemaining) * 10) / 10;
  const view = reserveStore.read(ctx);
  if (view.phase !== phase || view.secondsLeft !== secondsLeft) reserveStore.write(ctx, { phase, secondsLeft });
}
