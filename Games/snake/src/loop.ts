import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP } from "./game/logic";
import { snakeStore } from "./game/store";

const COMMANDS: Record<string, () => void> = {
  steerUp: () => snakeStore.turn(DIR_UP),
  steerDown: () => snakeStore.turn(DIR_DOWN),
  steerLeft: () => snakeStore.turn(DIR_LEFT),
  steerRight: () => snakeStore.turn(DIR_RIGHT),
  confirm: () => snakeStore.confirm(),
  pauseToggle: () => snakeStore.togglePause(),
  restart: () => snakeStore.restart(),
  toggleMode: () => {
    const mode = snakeStore.getState().mode;
    snakeStore.setMode(mode === "walled" ? "wrap" : "walled");
  },
  setModeWalled: () => snakeStore.setMode("walled"),
  setModeWrap: () => snakeStore.setMode("wrap"),
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
  snakeStore.reset();
}

export function onNewPlayer(): void {}

export function onTick(_ctx: GameContext, dt: number): void {
  snakeStore.tick(dt);
}
