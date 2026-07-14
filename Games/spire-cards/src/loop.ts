import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { combatHandle, createCombatStore } from "./game/combat";
import { createRunStore, runHandle } from "./game/run";

export function onInit(ctx: GameContext): void {
  const combat = createCombatStore();
  combatHandle.write(ctx, combat);
  runHandle.write(ctx, createRunStore(combat));

  ctx.game.commands.define<{ cardId: string }>("playCard", {
    validate: (state, input) => {
      const reason = runHandle.read(state).canPlay(input.cardId);
      return reason === null ? null : { reason };
    },
    apply: (state, input) => {
      runHandle.read(state).playCard(state, input.cardId);
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("endTurn", {
    apply: (state) => {
      runHandle.read(state).endTurn(state);
      return state;
    },
  });

  ctx.game.commands.define<{ cardType: string }>("chooseReward", {
    validate: (state, input) => (runHandle.read(state).canChooseReward(input.cardType) ? null : { reason: "not a valid reward" }),
    apply: (state, input) => {
      runHandle.read(state).chooseReward(state, input.cardType);
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("skipReward", {
    apply: (state) => {
      runHandle.read(state).skipReward(state);
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("startNewRun", {
    apply: (state) => {
      runHandle.read(state).start(state);
      return state;
    },
  });

  ctx.game.events.on("entity.died", (event) => {
    combatHandle.read(ctx).onEntityDied(ctx, event.instanceId);
  });
}

export function onNewPlayer(ctx: GameContext): void {
  runHandle.read(ctx).start(ctx);
}

export function onTick(_ctx: GameContext, _dt: number): void {}
