import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

/** New, game-owned preferences and service record. Existing engine/save keys are untouched. */
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
function load(): CommanderPreferences {
  try {
    const data = JSON.parse(localStorage.getItem(COMMANDER_KEY) ?? "null");
    if (!data || typeof data !== "object") return defaults;
    return {
      largeText: data.largeText === true, highContrast: data.highContrast === true,
      reducedMotion: data.reducedMotion === true,
      wins: Number.isSafeInteger(data.wins) && data.wins >= 0 ? data.wins : 0,
      losses: Number.isSafeInteger(data.losses) && data.losses >= 0 ? data.losses : 0,
      bestVictory: typeof data.bestVictory === "number" && Number.isFinite(data.bestVictory) && data.bestVictory > 0 ? data.bestVictory : null,
    };
  } catch { return defaults; }
}
export const preferences = perContext(() => {
  let value = { ...load() };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(patch: Partial<CommanderPreferences>) {
      value = { ...value, ...patch };
      try { localStorage.setItem(COMMANDER_KEY, JSON.stringify(value)); } catch { /* Session still works in private/blocked storage. */ }
      for (const listener of listeners) listener();
    },
  };
});
export function recordOutcome(ctx: GameContext, won: boolean, elapsed: number): void {
  const store = preferences(ctx);
  const value = store.get();
  store.set(won
    ? { wins: value.wins + 1, bestVictory: Math.min(value.bestVictory ?? Infinity, Math.max(1, Math.floor(elapsed))) }
    : { losses: value.losses + 1 });
}
