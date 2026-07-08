import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { CAR_PLAYER_ENTITY } from "../entities/vehicles/catalog";
import { SPAWN_HEADING, SPAWN_POSITION } from "../race/track";

export function spawnCar(ctx: GameContext): void {
  ctx.scene.entity.spawn(CAR_PLAYER_ENTITY, {
    id: ctx.player.userId,
    position: SPAWN_POSITION,
    rotationY: SPAWN_HEADING,
    role: "player",
  });
}
