import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { pinballStore } from "./game/store";

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("newGame", {
    apply: () => {
      pinballStore.newGame();
    },
  });
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  pinballStore.tick(dt, {
    left: ctx.input.isDown("flipLeft"),
    right: ctx.input.isDown("flipRight"),
    plunge: ctx.input.isDown("plunge"),
    nudge: ctx.input.isDown("nudge"),
  });
}
