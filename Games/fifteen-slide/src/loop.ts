import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { store } from "./game/puzzle/store";

const SIMPLE_COMMANDS: Record<string, () => void> = {
  slideUp: () => store.move("up"),
  slideDown: () => store.move("down"),
  slideLeft: () => store.move("left"),
  slideRight: () => store.move("right"),
  newShuffle: () => store.newGame(),
  restart: () => store.restart(),
  size3: () => store.setSize(3),
  size4: () => store.setSize(4),
  size5: () => store.setSize(5),
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
  ctx.game.commands.define<{ index: number }>("clickTile", {
    apply(state, input) {
      store.clickTile(input.index);
      return state;
    },
  });
  store.init();
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, dt: number): void {
  store.tick(dt);
}
