import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { defineStore } from "@jgengine/core/store/defineStore";
import { perContext } from "@jgengine/core/runtime/perContext";

export const sessionStore = defineStore("harbor.session", () => ({ paused: false, settings: false, notice: "" }));
// This gate describes this boot, never the restored world's persisted started flag.
export const startedThisBoot = perContext(() => ({ value: false }));

/** Every overlay owns its pause reason; closing settings must not resume a paused run. */
export function syncSession(ctx: GameContext, started: boolean): void {
  const session = sessionStore.read(ctx);
  const paused = !started || session.paused || session.settings || session.notice !== "";
  if (paused) ctx.time.pause();
  else ctx.time.play();
  const phase = !started ? "menu" : paused ? "paused" : "playing";
  if (gamePhase(ctx) !== phase) setGamePhase(ctx, phase);
}
