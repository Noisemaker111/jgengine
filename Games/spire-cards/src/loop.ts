import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { combat } from "./combat";
import { ENEMY_CATALOG_ID, ENEMY_ID, HERO_CATALOG_ID } from "./enemy";

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define<{ cardId: string }>("playCard", {
    validate: (_state, input) => {
      const reason = combat.canPlay(input.cardId);
      return reason === null ? null : { reason };
    },
    apply: (state, input) => {
      combat.playCard(state, input.cardId);
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("endTurn", {
    apply: (state) => {
      combat.endTurn(state);
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("restartCombat", {
    apply: (state) => {
      combat.start(state);
      return state;
    },
  });

  ctx.game.events.on("entity.died", (event) => {
    combat.onEntityDied(ctx, event.instanceId);
  });
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO_CATALOG_ID, { id: ctx.player.userId, role: "player", position: [-2, 0, 0] });
  ctx.scene.entity.spawn(ENEMY_CATALOG_ID, { id: ENEMY_ID, role: "npc", position: [2, 0, 0] });
  combat.start(ctx);
}

export function onTick(_ctx: GameContext, _dt: number): void {}
