import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { starInvadersStore } from "./game/invaders/store";

const COMMANDS: Record<string, () => void> = {
  fire: () => starInvadersStore.fire(),
  pause: () => starInvadersStore.togglePause(),
  restart: () => starInvadersStore.reset(),
};

export function onInit(ctx: GameContext): void {
  for (const [name, run] of Object.entries(COMMANDS)) {
    ctx.game.commands.define(name, {
      apply(state) {
        run();
        return state;
      },
    });
  }
  starInvadersStore.reset();
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  starInvadersStore.setMoveInput(ctx.input.isDown("moveLeft"), ctx.input.isDown("moveRight"));
  starInvadersStore.tick(dt);
}
