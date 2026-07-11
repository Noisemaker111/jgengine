import type { ItemUseHandler } from "@jgengine/core/item/use";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { itemDefById } from "./catalog";
import { applyFood } from "../combat/engine";
import type { EquipSlot } from "../model";
import { applySheet, equipsOf, inCombat, storeKeys } from "../session/hero";

const COMBAT_SAFE = /potion|elixir/;

export const useHandlers: Record<string, ItemUseHandler<GameContext>> = {
  consume: {
    can(ctx, input) {
      const item = itemDefById(input.itemId);
      if (item === null) return { reason: "unknown-item" };
      if (!COMBAT_SAFE.test(item.id) && inCombat(ctx, input.from)) {
        return { reason: "Cannot eat or drink in combat" };
      }
      if (ctx.player.inventory.count("bags", input.itemId) < 1) return { reason: "none-left" };
      return null;
    },
    apply(ctx, input) {
      const item = itemDefById(input.itemId);
      if (item === null) return { state: ctx, error: "unknown-item" };
      ctx.player.inventory.take("bags", input.itemId, 1);
      if (COMBAT_SAFE.test(item.id)) {
        if (item.heal !== undefined && item.heal > 0) {
          ctx.scene.entity.effect({
            from: input.from,
            to: input.from,
            effect: "heal",
            via: { amount: -item.heal },
          });
        }
        if (item.restore !== undefined && item.restore > 0) {
          ctx.scene.entity.stats.delta(input.from, "resource", item.restore);
        }
        return { state: ctx };
      }
      applyFood(ctx, input.from, item);
      return { state: ctx };
    },
  },
  equip: {
    can(ctx, input) {
      const item = itemDefById(input.itemId);
      if (item === null || item.slot === undefined) return { reason: "not-equippable" };
      const level = ctx.scene.entity.stats.get(input.from, "level")?.current ?? 1;
      if (item.levelReq !== undefined && item.levelReq > level) {
        return { reason: `Requires level ${item.levelReq}` };
      }
      if (ctx.player.inventory.count("bags", input.itemId) < 1) return { reason: "none-left" };
      return null;
    },
    apply(ctx, input) {
      const item = itemDefById(input.itemId);
      if (item === null || item.slot === undefined) return { state: ctx, error: "not-equippable" };
      const slot = item.slot as EquipSlot;
      const equips = { ...equipsOf(ctx, input.from) };
      const previous = equips[slot];
      ctx.player.inventory.take("bags", input.itemId, 1);
      if (previous !== undefined) ctx.player.inventory.put("bags", previous, 1);
      equips[slot] = input.itemId;
      ctx.game.store.set(storeKeys.equip(input.from), equips);
      applySheet(ctx, input.from);
      return { state: ctx };
    },
  },
};
