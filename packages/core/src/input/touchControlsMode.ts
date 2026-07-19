/**
 * Runtime switch for the active touch control context (see `TouchControlsConfig.modes`): gameplay
 * calls `setTouchControlsMode(ctx, "car")` when the player boards a vehicle and `null` on exit, and
 * the shell re-derives the touch scheme so only that context's controls are on screen. Backed by the
 * ctx keyed store, so writes notify `ctx.subscribe` (the shell re-renders) and the value rides along
 * with whole-world saves exactly like the gameplay state that implies it.
 */

import type { GameContext } from "../runtime/gameContext";
import { defineStore } from "../store/defineStore";

const touchModeStore = defineStore<string | null>("engine.touch.mode", null);

/**
 * Activate a named touch control mode, or `null` to return to the base config.
 *
 * @capability touch-controls switch the on-screen touch control set when gameplay context changes (enter/exit vehicle, mount, build mode)
 */
export function setTouchControlsMode(ctx: GameContext, mode: string | null): void {
  if (touchModeStore.read(ctx) === mode) return;
  touchModeStore.write(ctx, mode);
}

/** The active touch control mode, `null` when the base config applies. */
export function activeTouchControlsMode(ctx: GameContext): string | null {
  return touchModeStore.read(ctx);
}
