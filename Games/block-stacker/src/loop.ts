import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { blockStackerStore } from "./tetris/store";

type Command = () => void;

const COMMANDS: Record<string, Command> = {
  shiftLeft: () => blockStackerStore.shift(-1),
  shiftRight: () => blockStackerStore.shift(1),
  rotateCw: () => blockStackerStore.rotate(1),
  rotateCcw: () => blockStackerStore.rotate(-1),
  softDrop: () => blockStackerStore.softDrop(),
  hardDrop: () => blockStackerStore.hardDrop(),
  hold: () => blockStackerStore.swapHold(),
  restart: () => blockStackerStore.reset(),
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
  blockStackerStore.reset();
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, dt: number): void {
  blockStackerStore.tick(dt);
}
