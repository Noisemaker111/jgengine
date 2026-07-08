import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { HOTBAR_ITEMS } from "./blocks";

const SLOT_COUNT = HOTBAR_ITEMS.length;
let selected = 1;
const listeners = new Set<() => void>();

export function getSelectedSlot(): number {
  return selected;
}

export function subscribeSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setSelected(next: number): void {
  const clamped = Math.max(0, Math.min(SLOT_COUNT - 1, next));
  if (clamped === selected) return;
  selected = clamped;
  for (const listener of listeners) listener();
}

export function selectSlot(index: number): void {
  setSelected(index);
}

export function registerSelectionCommands(ctx: GameContext): void {
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    ctx.game.commands.define(`selectSlot${index + 1}`, {
      apply(state) {
        setSelected(index);
        return state;
      },
    });
  }
  ctx.game.commands.define("ui.hotbarScrollNext", {
    apply(state) {
      setSelected(selected + 1);
      return state;
    },
  });
  ctx.game.commands.define("ui.hotbarScrollPrev", {
    apply(state) {
      setSelected(selected - 1);
      return state;
    },
  });
}
