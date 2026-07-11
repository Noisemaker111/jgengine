import type { GameContext } from "../runtime/gameContext";

export const PLAY_CONTROLS_STORE_KEY = "jg.playControls";

export function setPlayControlsActive(ctx: GameContext, active: boolean): void {
  ctx.game.store.set(PLAY_CONTROLS_STORE_KEY, active);
}

export function playControlsActive(ctx: GameContext): boolean {
  return ctx.game.store.get(PLAY_CONTROLS_STORE_KEY) !== false;
}
