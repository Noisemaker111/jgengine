import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext, GameLoop } from "@jgengine/shell/gameKit";

import { setupWorld } from "./game/world/setup";

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    setGamePhase(ctx, "playing");
  },
  onNewPlayer() {},
};
