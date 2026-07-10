import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { pachinkoStore } from "./game/store";

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("autoFire", {
    apply: () => {
      pachinkoStore.toggleAutoFire();
    },
  });
  ctx.game.commands.define("rebuy", {
    apply: () => {
      pachinkoStore.rebuy();
    },
  });
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  pachinkoStore.tick(dt, ctx.input.isDown("launch"));
}
