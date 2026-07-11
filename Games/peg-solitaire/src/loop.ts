import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { store } from "./game/peg/store";

const SIMPLE_COMMANDS: Record<string, () => void> = {
  undoMove: () => store.undo(),
  restartBoard: () => store.restart(),
  showHint: () => store.showHint(),
  selectEnglish: () => store.setBoard("english"),
  selectEuropean: () => store.setBoard("european"),
  clearSelection: () => store.clearSelection(),
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
  ctx.game.commands.define<{ r: number; c: number }>("pickHole", {
    apply(state, input) {
      store.pickHole(input.r, input.c);
      return state;
    },
  });
  store.init();
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, dt: number): void {
  store.tick(dt);
}
