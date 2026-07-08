import type { GameLoop } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { PLAYER_KIND } from "./game/entities/players/catalog";
import { LEVELING } from "./game/progression/curves";
import { registerRunEvents, tickSimulation } from "./game/run/simulation";

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    registerRunEvents(ctx);
  },
  onNewPlayer(ctx) {
    ctx.scene.entity.spawn(PLAYER_KIND, { id: ctx.player.userId, position: [0, 0, 0] });
    ctx.scene.entity.stats.set(ctx.player.userId, "xp", { max: LEVELING.xpForLevel(1), current: 0 });
    ctx.scene.entity.stats.set(ctx.player.userId, "level", { current: 1 });
  },
  onTick(ctx, dt) {
    tickSimulation(ctx, dt);
  },
};
