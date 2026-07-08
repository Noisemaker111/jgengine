import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { store } from "./game/store";

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("regrow", {
    apply(state) {
      store.regrow();
      return state;
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  void ctx;
}

export function onTick(ctx: GameContext, dt: number): void {
  void ctx;
  void dt;
}
