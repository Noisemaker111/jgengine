import { defineStore, type StoreHandle } from "../store/defineStore";

/** Store slot holding the id of the dialogue currently open, or absent when none is showing. */
export const DIALOGUE_STORE_KEY = "jg.dialogue";

/** Typed handle onto the open-dialogue slot — React reads it via `useOpenDialogueId`; game code uses `ctx.game.dialogue`. */
export const dialogueSlot: StoreHandle<string | undefined> = defineStore<string | undefined>(
  DIALOGUE_STORE_KEY,
  undefined,
);

/** The minimal keyed-store surface {@link createGameDialogue} writes through — satisfied by `ctx.game.store`. */
interface DialogueStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

/**
 * `ctx.game.dialogue` — the blessed open/close bridge for the `talkable`/`dialogue.open` prompt flow. A game
 * opts in with `features.dialogue`, and the runtime both builds this surface and auto-registers the
 * `dialogue.open`/`dialogue.close` commands a `talkable(id)` prompt dispatches, so no game re-implements the
 * store, the command pair, or the open/close bookkeeping. React reads the open id via `useOpenDialogueId`.
 */
export interface GameDialogue {
  /** Show the dialogue with this catalog id (what a `talkable(id)` prompt / `dialogue.open` command carries). */
  open(id: string): void;
  /** Close whatever dialogue is open — the no-op when nothing is showing. */
  close(): void;
  /** The open dialogue id, or `null` when none is showing. */
  openId(): string | null;
}

/**
 * Build a {@link GameDialogue} over one keyed-store slot. Writes flow through the reactive store, so opening
 * or closing bumps `ctx.version()` and a `useOpenDialogueId` selector re-renders.
 *
 * @capability dialogue-bridge open/close the talkable→DialogueBox flow with no per-game store or command glue
 */
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
