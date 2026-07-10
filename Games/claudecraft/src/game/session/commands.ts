import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { castSlot } from "../combat/engine";
import { NPCS } from "../entities/npcs/catalog";
import { CLASS_ENTITY_ID } from "../model";
import { applySheet, clearAuras, heroOf, selectClass, storeKeys } from "./hero";
import { graveyardOf } from "../world/setup";

type Panel = "bags" | "character" | "quests";

function togglePanel(ctx: GameContext, panel: Panel): void {
  const key = storeKeys.panel(ctx.player.userId);
  ctx.game.store.set(key, ctx.game.store.get(key) === panel ? null : panel);
}

export function registerCommands(ctx: GameContext): void {
  const { commands } = ctx.game;
  commands.define<{ classId: string }>("class.select", {
    validate: (state, input) =>
      state.game.store.get(storeKeys.class(state.player.userId)) === undefined && input?.classId !== undefined
        ? null
        : { reason: "class-already-chosen" },
    apply(state, input) {
      selectClass(state, state.player.userId, input.classId);
    },
  });
  for (let slot = 0; slot < 6; slot += 1) {
    commands.define(`castSlot${slot + 1}`, {
      apply(state) {
        castSlot(state, state.player.userId, slot);
      },
    });
  }
  commands.define("attack", {
    apply(state) {
      const hero = heroOf(state.player.userId);
      if (hero === null) return;
      hero.autoAttack = !hero.autoAttack;
      state.game.store.set(storeKeys.autoAttack(state.player.userId), hero.autoAttack);
    },
  });
  commands.define("openBags", { apply: (state) => togglePanel(state, "bags") });
  commands.define("openCharacter", { apply: (state) => togglePanel(state, "character") });
  commands.define("openQuestLog", { apply: (state) => togglePanel(state, "quests") });
  commands.define<{ npcId: string }>("dialogue.open", {
    apply(state, input) {
      if (NPCS.some((npc) => npc.id === input.npcId)) {
        state.game.store.set(storeKeys.dialogue(state.player.userId), input.npcId);
      }
    },
  });
  commands.define("dialogue.close", {
    apply(state) {
      state.game.store.delete(storeKeys.dialogue(state.player.userId));
    },
  });
  commands.define<{ questId: string }>("quest.accept", {
    apply(state, input) {
      const rejection = state.game.quest.accept(state.player.userId, input.questId);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
      }
    },
  });
  commands.define<{ questId: string }>("quest.turnIn", {
    apply(state, input) {
      const rejection = state.game.quest.turnIn(state.player.userId, input.questId);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
      }
    },
  });
  commands.define<{ shopId: string }>("shop.open", {
    apply(state, input) {
      state.game.store.set(storeKeys.shop(state.player.userId), input.shopId);
      state.game.store.delete(storeKeys.dialogue(state.player.userId));
    },
  });
  commands.define("shop.close", {
    apply(state) {
      state.game.store.delete(storeKeys.shop(state.player.userId));
    },
  });
  commands.define<{ itemId: string }>("shop.buy", {
    apply(state, input) {
      const shopId = state.game.store.get(storeKeys.shop(state.player.userId));
      if (typeof shopId !== "string") return;
      const rejection = state.game.trade.buy(input.itemId, 1, { shop: shopId, inventoryId: "bags" });
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
      }
    },
  });
  commands.define<{ itemId: string }>("shop.sell", {
    apply(state, input) {
      const shopId = state.game.store.get(storeKeys.shop(state.player.userId));
      if (typeof shopId !== "string") return;
      const rejection = state.game.trade.sell(input.itemId, 1, { shop: shopId, inventoryId: "bags" });
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: rejection.reason, kind: "info" });
      }
    },
  });
  commands.define<{ itemId: string }>("bags.use", {
    apply(state, input) {
      const result = state.item.use.use({
        from: state.player.userId,
        itemId: input.itemId,
        inventoryId: "bags",
      });
      if (result.error !== undefined) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: result.error, kind: "info" });
      }
    },
  });
  commands.define("player.release", {
    apply(state) {
      const userId = state.player.userId;
      if (state.game.store.get(storeKeys.dead(userId)) !== true) return;
      const snapshot = state.game.store.get(`deathstats:${userId}`) as
        | { level: number; xp: number; xpMax: number }
        | undefined;
      const corpse = state.game.store.get(`corpse:${userId}`) as readonly [number, number] | undefined;
      const [gx, gz] = graveyardOf(corpse?.[0] ?? 0, corpse?.[1] ?? 0);
      state.scene.entity.spawn(CLASS_ENTITY_ID, {
        id: userId,
        position: [gx, state.world.groundHeightAt(gx, gz), gz],
      });
      if (snapshot !== undefined) {
        state.scene.entity.stats.set(userId, "level", { current: snapshot.level });
        state.scene.entity.stats.set(userId, "xp", { current: snapshot.xp, max: snapshot.xpMax });
      }
      clearAuras(state, userId);
      state.game.store.set(storeKeys.dead(userId), false);
      const hero = heroOf(userId);
      if (hero !== null) {
        hero.casting = null;
        hero.autoAttack = false;
        hero.combatUntil = 0;
      }
      state.game.store.delete(storeKeys.cast(userId));
      applySheet(state, userId, { fill: true });
    },
  });
}
