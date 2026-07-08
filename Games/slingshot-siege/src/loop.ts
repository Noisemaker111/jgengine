import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { GameLoop } from "@jgengine/core/game/defineGame";
import { slingshotStoreFor } from "./game/state/slingshotStore";

function onInit(ctx: GameContext): void {
  slingshotStoreFor(ctx);
}

function onTick(ctx: GameContext, dt: number): void {
  slingshotStoreFor(ctx).tick(dt);
}

export const loop: GameLoop<GameContext> = { onInit, onTick };
