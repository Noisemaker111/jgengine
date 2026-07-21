import type { GameContext } from "../runtime/gameContext";
import type { LifecycleConfig } from "./defineGame";

import { setPlayControlsActive } from "./controlGate";

/**
 * Canonical run phase every game moves through. `menu` (title/main menu),
 * `playing` (live), `paused` (mid-run pause), `ended` (win/lose/results).
 * Touch controls are shown only while `playing`; menus and results never paint
 * the touch dock over themselves.
 */
export type GamePhase = "menu" | "playing" | "paused" | "ended";

export const GAME_PHASE_STORE_KEY = "jg.phase";

/**
 * Set the current phase. Publishes it to `ctx.game.store` (React reads it via
 * `useGamePhase`) and gates the shell's on-screen touch controls in one call —
 * `playing` shows them, every other phase hides them. This is the whole
 * "main menu shouldn't show touch controls" wiring: call it once per phase
 * transition and the dock follows.
 */
export function setGamePhase(ctx: GameContext, phase: GamePhase): void {
  ctx.game.store.set(GAME_PHASE_STORE_KEY, phase);
  setPlayControlsActive(ctx, phase === "playing");
}

/** Current phase; defaults to `playing` when unset — a game that runs live from boot declares that intent explicitly with `defineGame({ lifecycle: "always-live" })` rather than relying on the silent default. */
export function gamePhase(ctx: GameContext): GamePhase {
  const value = ctx.game.store.get(GAME_PHASE_STORE_KEY);
  return value === "menu" || value === "paused" || value === "ended" ? value : "playing";
}

export function isPlaying(ctx: GameContext): boolean {
  return gamePhase(ctx) === "playing";
}

/**
 * Derive the canonical phase from a game's own run state via its {@link LifecycleConfig.phaseOf} and
 * publish it when it changed — the runtime calls this after every loop hook so a game never hand-writes
 * a per-tick `setGamePhase(ctx, state.phase === … ? … : …)` ternary or its own previous-phase diff. The
 * guard makes it idempotent: the phase store is only rewritten (and touch controls re-gated) on an actual
 * transition, so a busy `onTick` costs one `phaseOf` read, not a store write per frame.
 *
 * @internal
 */
export function syncLifecyclePhase(ctx: GameContext, lifecycle: LifecycleConfig | undefined): void {
  if (lifecycle === undefined) return;
  const desired = lifecycle.phaseOf(lifecycle.store.read(ctx));
  if (gamePhase(ctx) !== desired) setGamePhase(ctx, desired);
}
