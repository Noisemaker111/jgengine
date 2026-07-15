import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { player } from "./game/entities/players/catalog";

function onInit(ctx: GameContext): void {
  void ctx;
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(player.id, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function onTick(ctx: GameContext, dt: number): void {
  void ctx;
  void dt;
}

export const loop = { onInit, onNewPlayer, onTick };
