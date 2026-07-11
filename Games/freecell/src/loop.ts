import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { freecellStore } from "./game/freecell/store";

const COMMANDS: Record<string, () => void> = {
  newDeal: () => freecellStore.randomDeal(),
  restart: () => freecellStore.restart(),
  undo: () => freecellStore.undo(),
  toggleAuto: () => freecellStore.toggleAutoPlay(),
  collect: () => freecellStore.collect(),
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
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, dt: number): void {
  freecellStore.tick(dt);
}
