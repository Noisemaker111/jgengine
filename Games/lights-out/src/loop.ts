import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { store } from "./game/state";

const SIMPLE_COMMANDS: Record<string, () => void> = {
  hint: () => store.hint(),
  undo: () => store.undo(),
  restart: () => store.restart(),
  newBoard: () => store.startRandom(),
  back: () => store.back(),
};

export function onInit(ctx: GameContext): void {
  for (const [name, run] of Object.entries(SIMPLE_COMMANDS)) {
    ctx.game.commands.define(name, {
      apply(state) {
        run();
        return state;
      },
    });
  }
  store.init();
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, _dt: number): void {}
