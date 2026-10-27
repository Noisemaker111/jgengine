import type { GameLoop } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { disposeWorld, setupWorld } from "./game/world/setup";
import { registerCaptureCommands, stepPark } from "./game/capture";
import { armMidnight } from "./game/midnight";

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    registerCaptureCommands(ctx);
    setGamePhase(ctx, "menu");
    // After restoring the clock: midnight is the next whole day from wherever the save left it.
    armMidnight(ctx);
  },
  onNewPlayer() {},
  onDispose: disposeWorld,
  onTick(ctx, dt) {
    stepPark(ctx, dt);
  },
};
