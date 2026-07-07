import type { ItemUseHandler } from "@jgengine/core/item/use";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

const fireGun: ItemUseHandler<GameContext> = {
  apply(ctx, input) {
    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { item: input.itemId },
      aim,
      effect: "damage",
    });
    const settle = ctx.scene.entity.settleProjectile(shotId);
    if (settle.status === "settled") {
      for (const hit of settle.hits) {
        ctx.scene.entity.hitReaction({
          from: input.from,
          to: hit.instanceId,
          config: { hitstopMs: 90, knockback: 0.6, shake: { amplitude: 0.35, decay: 5 } },
        });
      }
    }
    return { state: ctx };
  },
};

export const itemUseHandlers: Record<string, ItemUseHandler<GameContext>> = {
  fireGun,
};
