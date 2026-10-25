import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { selectedSlotStore } from "./stores";

let slot = 0;

export const session = {
  selectedSlot(): number {
    return slot;
  },
  selectSlot(ctx: GameContext, next: number): void {
    slot = Math.max(0, Math.min(3, next));
    selectedSlotStore.write(ctx, slot);
  },
  reset(ctx: GameContext): void {
    slot = 0;
    selectedSlotStore.write(ctx, 0);
  },
};
