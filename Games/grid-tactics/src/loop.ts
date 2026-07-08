import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { initBattle } from "./game/battle/controller";

export function onInit(ctx: GameContext): void {
  initBattle(ctx);
}

export function onNewPlayer(ctx: GameContext): void {
  void ctx;
}

export function onTick(ctx: GameContext, dt: number): void {
  void ctx;
  void dt;
}
