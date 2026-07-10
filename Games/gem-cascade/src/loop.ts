import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { store } from "./game/store";

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define<{ x: number; y: number }>("select", {
    apply: (state, input) => {
      store.selectCell({ x: input.x, y: input.y });
      return state;
    },
  });

  ctx.game.commands.define<{ fromX: number; fromY: number; toX: number; toY: number }>("swap", {
    apply: (state, input) => {
      store.requestSwap({ x: input.fromX, y: input.fromY }, { x: input.toX, y: input.toY });
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("hint", {
    apply: (state) => {
      store.useHint();
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("newGame", {
    apply: (state) => {
      store.newGame();
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("setEndless", {
    apply: (state) => {
      store.setMode("endless");
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("setTimed", {
    apply: (state) => {
      store.setMode("timed");
      return state;
    },
  });
}

export function onNewPlayer(_ctx: GameContext): void {
  store.newGame("endless");
}

export function onTick(_ctx: GameContext, dt: number): void {
  store.advance(dt);
}
