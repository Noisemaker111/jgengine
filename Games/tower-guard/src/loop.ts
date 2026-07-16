import type { GameLoop } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { setupWorld } from "./game/world/setup";

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
  },
  onNewPlayer() {},
};
