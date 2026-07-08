import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { combat } from "./game/combat";
import { run } from "./game/run";

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define<{ cardId: string }>("playCard", {
    validate: (_state, input) => {
      const reason = run.canPlay(input.cardId);
      return reason === null ? null : { reason };
    },
    apply: (state, input) => {
      run.playCard(state, input.cardId);
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("endTurn", {
    apply: (state) => {
      run.endTurn(state);
      return state;
    },
  });

  ctx.game.commands.define<{ cardType: string }>("chooseReward", {
    validate: (_state, input) => (run.canChooseReward(input.cardType) ? null : { reason: "not a valid reward" }),
    apply: (state, input) => {
      run.chooseReward(state, input.cardType);
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("skipReward", {
    apply: (state) => {
      run.skipReward(state);
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("startNewRun", {
    apply: (state) => {
      run.start(state);
      return state;
    },
  });

  ctx.game.events.on("entity.died", (event) => {
    combat.onEntityDied(ctx, event.instanceId);
  });
}

export function onNewPlayer(ctx: GameContext): void {
  run.start(ctx);
}

export function onTick(_ctx: GameContext, _dt: number): void {}
