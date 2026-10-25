import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

const boot = perContext(() => ({ runStarted: false }));

/** A run was started this session: a pick, a Continue or a dev menu run. */
export function noteRunStarted(ctx: GameContext): void {
  boot(ctx).runStarted = true;
}

/**
 * The boot opens the front end once the save has loaded, unless something already started a run
 * while it loaded. A capture host's `character.pick` can land during that await, and forcing the menu
 * afterwards would put the player back on the broadcast with the run already picked.
 */
export function settleBootPhase(ctx: GameContext): void {
  if (boot(ctx).runStarted) return;
  setGamePhase(ctx, "menu");
  ctx.time.pause();
}
