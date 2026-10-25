import type { GameLoop } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { DAY_LENGTH } from "./game/catalog";
import { park } from "./game/park";
import { disposeWorld, setupWorld } from "./game/world/setup";
import { closeDay } from "./game/sim/economy";
import { registerCaptureCommands, stepPark } from "./game/capture";
import { savePark } from "./game/persistence";

// Midnight is a simulation event, scheduled after restoring the clock.
function scheduleMidnight(ctx: GameContext): void {
  const midnight = (Math.floor(ctx.time.now() / DAY_LENGTH) + 1) * DAY_LENGTH;
  ctx.time.at(midnight, () => {
    const over = () => park.of(ctx).fact("park.game_over") === true;
    if (!over()) closeDay(ctx);
    savePark(ctx);
    if (!over()) scheduleMidnight(ctx);
  });
}

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    registerCaptureCommands(ctx);
    setGamePhase(ctx, "menu");
    scheduleMidnight(ctx);
  },
  onNewPlayer() {},
  onDispose: disposeWorld,
  onTick(ctx, dt) {
    stepPark(ctx, dt);
  },
};
