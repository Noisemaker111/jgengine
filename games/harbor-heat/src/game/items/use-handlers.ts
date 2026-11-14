import type { ItemUseHandler } from "@jgengine/core/item/use";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { gearById } from "./gear";

const useMedkit: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) return { reason: "no-medkits" };
    return null;
  },
  apply(ctx, input) {
    const def = gearById(input.itemId);
    if (def?.heal === undefined) return { state: ctx, error: "not-a-medkit" };
    const health = ctx.scene.entity.stats.get(input.from, "health");
    if (health === null || health.current >= health.max) {
      ctx.scene.entity.floatText({ instanceId: input.from, text: "HEALTH FULL", kind: "warn" });
      return { state: ctx };
    }
    ctx.player.inventory.take("backpack", input.itemId, 1);
    ctx.scene.entity.effect({ from: input.from, to: input.from, effect: "heal", via: { amount: def.heal } });
    return { state: ctx };
  },
};

const wearVest: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) return { reason: "no-vest" };
    return null;
  },
  apply(ctx, input) {
    const def = gearById(input.itemId);
    if (def?.armor === undefined) return { state: ctx, error: "not-a-vest" };
    const armor = ctx.scene.entity.stats.get(input.from, "armor");
    if (armor === null || armor.current >= armor.max) {
      ctx.scene.entity.floatText({ instanceId: input.from, text: "ARMOR FULL", kind: "warn" });
      return { state: ctx };
    }
    ctx.player.inventory.take("backpack", input.itemId, 1);
    ctx.scene.entity.stats.set(input.from, "armor", { current: def.armor });
    return { state: ctx };
  },
};

export const itemUseHandlers: Record<string, ItemUseHandler<GameContext>> = {
  useMedkit,
  wearVest,
};
