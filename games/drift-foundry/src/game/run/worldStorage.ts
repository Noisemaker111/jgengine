import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { browserRecordStorage, type RunStorage } from "./records";

/** The game-store key the run's records ride under when the page has no `localStorage`. */
export const WORLD_STORAGE_KEY = "aisle9.storage";

type Records = Readonly<Record<string, string>>;

export interface GameRunStorage {
  storage: RunStorage | undefined;
  /** True once since the last call when the world save restored records this storage did not write. */
  restored(): boolean;
}

/**
 * Where the run's career, records, parked cart and receipts are kept: the browser's `localStorage`
 * when there is one, otherwise a key-value entry of the game store, which the engine's world save
 * persists and restores - so a host without `localStorage` (a headless run, an embedded player)
 * still saves and continues through the game's own save path.
 */
export function gameRunStorage(ctx: GameContext): GameRunStorage {
  const browser = browserRecordStorage();
  if (browser !== undefined) return { storage: browser, restored: () => false };
  let written: unknown = ctx.game.store.get(WORLD_STORAGE_KEY);
  // Opening the game reads the world save back (an empty slot loads nothing); `restored` then reports it.
  void ctx.game.save?.load().catch(() => undefined);
  const records = (): Records => {
    const value = ctx.game.store.get(WORLD_STORAGE_KEY);
    return typeof value === "object" && value !== null ? (value as Records) : {};
  };
  return {
    storage: {
      getItem: (key) => records()[key] ?? null,
      setItem(key, value) {
        written = { ...records(), [key]: value };
        ctx.game.store.set(WORLD_STORAGE_KEY, written);
        // Records are written at moments that matter (a park, a checkout), so the world save keeps them at once.
        void ctx.game.save?.save().catch(() => undefined);
      },
    },
    restored() {
      const now = ctx.game.store.get(WORLD_STORAGE_KEY);
      if (now === written) return false;
      written = now;
      return true;
    },
  };
}
