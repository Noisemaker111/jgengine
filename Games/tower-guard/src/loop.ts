import type { GameLoop } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { tickTowers } from "./game/combat/towerAI";
import { setupWorld, heartbeat } from "./game/world/setup";
import { tickWaves } from "./game/waves/director";
import { session } from "./game/session";

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
  },
  onNewPlayer() {},
  onTick(ctx, dt) {
    if (!session.gameOver && !session.victory) {
      tickWaves(ctx, dt);
      tickTowers(ctx, dt);
    }
    heartbeat(ctx);
  },
};
