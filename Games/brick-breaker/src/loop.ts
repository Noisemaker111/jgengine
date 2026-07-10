import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { brickBreakerStore } from "./game/breakout/store";

const COMMANDS: Record<string, () => void> = {
  launch: () => brickBreakerStore.launch(),
  pause: () => brickBreakerStore.togglePause(),
  restart: () => brickBreakerStore.reset(),
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
  brickBreakerStore.reset();
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  brickBreakerStore.setMoveInput(ctx.input.isDown("moveLeft"), ctx.input.isDown("moveRight"));
  brickBreakerStore.tick(dt);
}
