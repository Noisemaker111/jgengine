import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { createStarInvadersStore, starInvadersHandle, type StarInvadersStore } from "./game/invaders/store";

const COMMANDS: Record<string, (store: StarInvadersStore) => void> = {
  fire: (store) => store.fire(),
  pause: (store) => store.togglePause(),
  restart: (store) => store.reset(),
};

export function onInit(ctx: GameContext): void {
  const store = createStarInvadersStore();
  starInvadersHandle.write(ctx, store);
  for (const [name, run] of Object.entries(COMMANDS)) {
    ctx.game.commands.define(name, {
      apply: (state) => {
        run(starInvadersHandle.read(state));
      },
    });
  }
  store.reset();
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  const store = starInvadersHandle.read(ctx);
  store.setMoveInput(ctx.input.isDown("moveLeft"), ctx.input.isDown("moveRight"));
  store.tick(dt);
}
