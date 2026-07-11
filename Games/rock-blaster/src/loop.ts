import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { blasterStore } from "./game/blaster/store";
import type { Controls } from "./game/blaster/logic";

const COMMANDS: Record<string, () => void> = {
  hyperspace: () => blasterStore.hyperspace(),
  startGame: () => blasterStore.confirm(),
  pauseToggle: () => blasterStore.togglePause(),
  restart: () => blasterStore.restart(),
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
  blasterStore.reset();
}

export function onNewPlayer(): void {}

export function onTick(ctx: GameContext, dt: number): void {
  const controls: Controls = {
    left: ctx.input.isDown("rotateLeft"),
    right: ctx.input.isDown("rotateRight"),
    thrust: ctx.input.isDown("thrust"),
    fire: ctx.input.isDown("fire"),
  };
  blasterStore.tick(dt, controls);
}
