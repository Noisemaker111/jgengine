import type { GameContext } from "../runtime/gameContext";
import { perContext } from "../runtime/perContext";

/**
 * Scatter placements taken out of the world at runtime — a felled tree, a mined rock, a picked bush.
 * The scatter renderer skips every hidden id; whatever cleared it (a harvest field, a building that
 * claimed the ground) shows it again when it grows back. Plain ids, so a save carries it as a list.
 */
export interface ScatterClearing {
  /** The hidden placement ids; a new set object after every change, so it works as a React snapshot. */
  hidden(): ReadonlySet<string>;
  /** Hide (`true`) or show (`false`) one placement. */
  set(id: string, hidden: boolean): void;
  /** Replace the whole hidden set (a load). */
  replace(ids: Iterable<string>): void;
  subscribe(listener: () => void): () => void;
}

/**
 * A set of hidden scatter placements with change notification.
 *
 * @capability scatter-clearing hide and restore individual scatter placements at runtime — felled trees, mined rocks
 */
export function createScatterClearing(): ScatterClearing {
  let hidden: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    hidden: () => hidden,
    set(id, hide) {
      if (hidden.has(id) === hide) return;
      const next = new Set(hidden);
      if (hide) next.add(id);
      else next.delete(id);
      hidden = next;
      emit();
    },
    replace(ids) {
      hidden = new Set(ids);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The game's one scatter clearing; the authored scene renderer reads it. */
export const scatterClearingOf: (ctx: GameContext) => ScatterClearing = perContext(() => createScatterClearing());
