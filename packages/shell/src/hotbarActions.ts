import { hotbarSlotActionIndex, type ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { Aim } from "@jgengine/core/scene/spatial";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

type Inventories = Record<string, { hud?: string }>;

/** Minimal playable slice — avoids coupling to shell vs core PlayableGame generics. */
export type HotbarPlayable = {
  game: { inventories?: Inventories; input?: ActionCodesMap };
};

export function findHotbarSlotActions(input: ActionCodesMap | undefined): { action: string; slot: number }[] {
  return Object.keys(input ?? {}).flatMap((action) => {
    const slot = hotbarSlotActionIndex(action);
    return slot === null ? [] : [{ action, slot }];
  });
}

export function hotbarIdFor(playable: HotbarPlayable): string | null {
  const declarations = Object.entries(playable.game.inventories ?? {});
  const hud = declarations.find(([, declaration]) => declaration.hud === "hotbar");
  return (hud ?? declarations[0])?.[0] ?? null;
}

export function executeHotbarSlot(
  ctx: GameContext,
  fromId: string,
  hotbarId: string,
  slot: number,
  yaw: number,
  pitch: number,
  aimOverride?: Aim,
): { ok: boolean; error?: string } {
  const stack = ctx.player.inventory.state(hotbarId).slots[slot];
  if (stack === undefined || stack === null) return { ok: false, error: `Hotbar slot ${slot + 1} is empty` };
  const result = ctx.item.use.use({
    from: fromId,
    itemId: stack.itemId,
    inventoryId: hotbarId,
    aim: aimOverride ?? { yaw, pitch },
  });
  return result.error === undefined ? { ok: true } : { ok: false, error: result.error };
}
