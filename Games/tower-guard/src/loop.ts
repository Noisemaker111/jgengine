import type { GameLoop } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { setupWorld } from "./game/world/setup";

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    setGamePhase(ctx, "playing");
  },
  onNewPlayer() {},
};
