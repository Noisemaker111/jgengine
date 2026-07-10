import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { keeperStore } from "./game/store";
import type { Dir } from "./game/sokoban";

const MOVE_COMMANDS: Record<string, Dir> = {
  up: "U",
  down: "D",
  left: "L",
  right: "R",
};

export function onInit(ctx: GameContext): void {
  for (const [name, dir] of Object.entries(MOVE_COMMANDS)) {
    ctx.game.commands.define(name, {
      apply: (state) => {
        keeperStore.move(dir);
        return state;
      },
    });
  }
  ctx.game.commands.define("undo", {
    apply: (state) => {
      keeperStore.undo();
      return state;
    },
  });
  ctx.game.commands.define("restart", {
    apply: (state) => {
      keeperStore.restart();
      return state;
    },
  });
  ctx.game.commands.define("nextLevel", {
    apply: (state) => {
      keeperStore.nextLevel();
      return state;
    },
  });
  ctx.game.commands.define("select", {
    apply: (state) => {
      keeperStore.openSelect();
      return state;
    },
  });
  ctx.game.commands.define("continue", {
    apply: (state) => {
      keeperStore.continueCampaign();
      return state;
    },
  });
  ctx.game.commands.define<{ index: number }>("selectLevel", {
    apply: (state, input) => {
      keeperStore.selectLevel(input.index);
      return state;
    },
  });
}

export function onNewPlayer(_ctx: GameContext): void {
  keeperStore.begin();
}

export function onTick(_ctx: GameContext, _dt: number): void {}
