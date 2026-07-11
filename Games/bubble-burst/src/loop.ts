import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { AIM_STEP } from "./game/bubble/constants";
import { bubbleStore } from "./game/bubble/store";

const COMMANDS: Record<string, () => void> = {
  fire: () => bubbleStore.fire(),
  swap: () => bubbleStore.swap(),
  restart: () => bubbleStore.reset(),
  aimLeft: () => bubbleStore.nudgeAim(-AIM_STEP),
  aimRight: () => bubbleStore.nudgeAim(AIM_STEP),
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
  bubbleStore.reset();
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, dt: number): void {
  bubbleStore.tick(dt);
}
