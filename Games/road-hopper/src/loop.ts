import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { roadHopperStore } from "./game/hopper/store";

const COMMANDS: Record<string, () => void> = {
  hopUp: () => roadHopperStore.hop("up"),
  hopDown: () => roadHopperStore.hop("down"),
  hopLeft: () => roadHopperStore.hop("left"),
  hopRight: () => roadHopperStore.hop("right"),
  confirm: () => roadHopperStore.confirm(),
  pauseToggle: () => roadHopperStore.togglePause(),
  restart: () => roadHopperStore.restart(),
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
  roadHopperStore.tick(dt);
}
