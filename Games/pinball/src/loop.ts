import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { PinballStore, pinballHandle } from "./game/store";

export function onInit(ctx: GameContext): void {
  pinballHandle.write(ctx, new PinballStore());
  ctx.game.commands.define("newGame", {
    apply: (state) => {
      pinballHandle.read(state).newGame();
    },
  });
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  pinballHandle.read(ctx).tick(dt, {
    left: ctx.input.isDown("flipLeft"),
    right: ctx.input.isDown("flipRight"),
    plunge: ctx.input.isDown("plunge"),
    nudge: ctx.input.isDown("nudge"),
  });
}
