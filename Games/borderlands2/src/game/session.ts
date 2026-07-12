import type { GameContext } from "@jgengine/core/runtime/gameContext";

let slot = 0;

export const session = {
  selectedSlot(): number {
    return slot;
  },
  selectSlot(ctx: GameContext, next: number): void {
    slot = Math.max(0, Math.min(3, next));
    ctx.game.store.set("selectedSlot", slot);
  },
  reset(ctx: GameContext): void {
    slot = 0;
    ctx.game.store.set("selectedSlot", 0);
  },
};
