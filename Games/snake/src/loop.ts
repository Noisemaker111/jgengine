import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase, type GamePhase } from "@jgengine/core/game/gamePhase";

import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP, type Phase } from "./game/logic";
import { snakeStore } from "./game/store";

function toGamePhase(phase: Phase): GamePhase {
  if (phase === "start") return "menu";
  if (phase === "gameover") return "ended";
  return phase;
}

function syncPhase(ctx: GameContext): void {
  setGamePhase(ctx, toGamePhase(snakeStore.getState().phase));
}

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
        syncPhase(state);
        return state;
      },
    });
  }
  snakeStore.reset();
  syncPhase(ctx);
}

export function onNewPlayer(): void {}

export function onTick(ctx: GameContext, dt: number): void {
  snakeStore.tick(dt);
  syncPhase(ctx);
}
