import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { placeProps } from "./game/world/setup";
import { initRun, spawnCourier, tick } from "./game/run/session";

export function onInit(ctx: GameContext): void {
  placeProps(ctx);
  initRun(ctx);
}

export function onNewPlayer(ctx: GameContext): void {
  spawnCourier(ctx);
}

export function onTick(ctx: GameContext, dt: number): void {
  tick(ctx, dt);
}
