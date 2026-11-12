import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createGameSave } from "@jgengine/core/save/saveDocument";
import { localSaveBackend } from "@jgengine/core/save/saveStore";

/**
 * The commander's preferences and service record: one shared save document, slot `commander`,
 * whose `preferences` section is the whole record. It is the commander's, not a campaign's, so it
 * sits beside the campaign slots rather than in one.
 */
export const COMMANDER_SAVE_KEY = "ember-command.commander";
export const COMMANDER_SLOT = "commander";
/** Where an older build kept the record; read once and rewritten as the document's section. */
export const COMMANDER_KEY = "ember-command.commander.v1";
export interface CommanderPreferences {
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  wins: number;
  losses: number;
  bestVictory: number | null;
}
const defaults: CommanderPreferences = {
  largeText: false, highContrast: false, reducedMotion: false,
  wins: 0, losses: 0, bestVictory: null,
};

/** A stored `preferences` section, field by field; anything missing or bad is the default. */
export function readPreferences(value: unknown): CommanderPreferences {
  if (!value || typeof value !== "object") return { ...defaults };
  const data = value as Partial<Record<keyof CommanderPreferences, unknown>>;
  const count = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  return {
    largeText: data.largeText === true, highContrast: data.highContrast === true,
    reducedMotion: data.reducedMotion === true,
    wins: count(data.wins) ? data.wins : 0,
    losses: count(data.losses) ? data.losses : 0,
    bestVictory: typeof data.bestVictory === "number" && Number.isFinite(data.bestVictory) && data.bestVictory > 0 ? data.bestVictory : null,
  };
}

/**
 * This context's commander record. It starts at the defaults and takes the stored record once the
 * document is read (`ready`); a change made before then is kept on top of what was stored.
 */
export const preferences = perContext(() => {
  let value = { ...defaults };
  let early: Partial<CommanderPreferences> = {};
  let loaded = false;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const save = createGameSave({
    backend: localSaveBackend(undefined, { errorMode: "throw" }),
    game: "ember-command",
    key: COMMANDER_SAVE_KEY,
    slot: COMMANDER_SLOT,
    systems: [{
      name: "preferences",
      snapshot: () => value,
      restore: (next) => { value = { ...readPreferences(next), ...early }; },
    }],
    legacy: { keys: () => [COMMANDER_KEY], lift: (stored) => ({ preferences: JSON.parse(stored[COMMANDER_KEY] ?? "null") as unknown }) },
  });
  // Private or blocked storage still plays this session; the load and every write fail quietly.
  const ready = save.load().then(
    () => { loaded = true; notify(); },
    () => { loaded = true; },
  );
  return {
    get: () => value,
    /** Settles once the stored record has been read. */
    ready,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(patch: Partial<CommanderPreferences>) {
      value = { ...value, ...patch };
      if (!loaded) early = { ...early, ...patch };
      void ready.then(() => save.save());
      notify();
    },
    /** The document's state digest, for a restore test. */
    digest: () => save.digest(),
  };
});
export function recordOutcome(ctx: GameContext, won: boolean, elapsed: number): void {
  const store = preferences(ctx);
  const value = store.get();
  store.set(won
    ? { wins: value.wins + 1, bestVictory: Math.min(value.bestVictory ?? Infinity, Math.max(1, Math.floor(elapsed))) }
    : { losses: value.losses + 1 });
}
