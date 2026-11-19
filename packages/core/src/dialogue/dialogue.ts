// @skill jgengine-gameplay
import { defineStore, type StoreHandle } from "../store/defineStore";

export const DIALOGUE_STORE_KEY = "jg.dialogue";

export const dialogueSlot: StoreHandle<string | undefined> = defineStore<string | undefined>(
  DIALOGUE_STORE_KEY,
  undefined,
);

interface DialogueStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

/**
 * `ctx.game.dialogue` — the blessed open/close bridge for the `talkable`/`dialogue.open` prompt flow. A game
 * opts in with `features.dialogue`, and the runtime both builds this surface and auto-registers the
 * `dialogue.open`/`dialogue.close` commands a `talkable(id)` prompt dispatches, so no game re-implements the
 * store, the command pair, or the open/close bookkeeping. the UI reads the open id via `useOpenDialogueId`.
 */
export interface GameDialogue {
  open(id: string): void;
  close(): void;
  openId(): string | null;
}

/** @capability dialogue-bridge open/close the talkable→DialogueBox flow with no per-game store or command glue */
export function createGameDialogue(store: DialogueStore): GameDialogue {
  return {
    open: (id) => store.set(DIALOGUE_STORE_KEY, id),
    close: () => store.delete(DIALOGUE_STORE_KEY),
    openId: () => {
      const value = store.get(DIALOGUE_STORE_KEY);
      return typeof value === "string" ? value : null;
    },
  };
}
