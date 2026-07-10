import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { poker } from "./game/poker";

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("dealDraw", {
    apply: () => {
      poker.dealOrDraw();
    },
  });
  ctx.game.commands.define("deal", {
    apply: () => {
      poker.deal();
    },
  });
  ctx.game.commands.define("draw", {
    apply: () => {
      poker.draw();
    },
  });
  ctx.game.commands.define("betOne", {
    apply: () => {
      poker.betOne();
    },
  });
  ctx.game.commands.define("betMax", {
    apply: () => {
      poker.betMax();
    },
  });
  ctx.game.commands.define("rebuy", {
    apply: () => {
      poker.rebuy();
    },
  });
  ctx.game.commands.define<{ bet: number }>("setBet", {
    apply: (_state, input) => {
      poker.setBet(input.bet);
    },
  });
  ctx.game.commands.define<{ index: number }>("toggleHold", {
    apply: (_state, input) => {
      poker.toggleHold(input.index);
    },
  });
  for (let slot = 1; slot <= 5; slot += 1) {
    const index = slot - 1;
    ctx.game.commands.define(`hold${slot}`, {
      apply: () => {
        poker.toggleHold(index);
      },
    });
  }
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, _dt: number): void {}
