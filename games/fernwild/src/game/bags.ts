import type { GameContext } from "@jgengine/core/runtime/gameContext";

/** The survivor's two inventories, as ARK lays them out: the bag and the ten-slot hotbar. */
export const BAG = "inventory";
export const HOTBAR = "hotbar";
export const BAG_SLOTS = 60;
export const HOTBAR_SLOTS = 10;

/** Put as many of `count` as fit in the bag, then the hotbar; returns how many went in. */
export function stow(ctx: GameContext, item: string, count: number): number {
  let stowed = 0;
  for (const inventoryId of [BAG, HOTBAR]) {
    let tryCount = count - stowed;
    while (tryCount > 0) {
      if (ctx.player.inventory.put(inventoryId, item, tryCount).status === "ok") {
        stowed += tryCount;
        tryCount = Math.min(tryCount, count - stowed);
      } else tryCount = Math.floor(tryCount / 2);
    }
  }
  return stowed;
}
