/** Definition of one achievement. Content-agnostic — the game supplies names, targets, and icons. */
export interface AchievementDef {
  id: string;
  name: string;
  description?: string;
  /**
   * Counter goal: the achievement unlocks when accumulated progress reaches it.
   * Omit for a boolean achievement unlocked directly with `unlock(id)`.
   */
  target?: number;
  /** Hide the name/description in UI until unlocked (a spoiler-guarded achievement). */
  secret?: boolean;
  /** Optional score weight (gamerscore-style), summed by {@link AchievementTracker.score}. */
  points?: number;
  category?: string;
  /** Optional icon id / glyph the game renders; the engine never picks art. */
  icon?: string;
}

/** A definition plus its live unlock/progress state — what UI renders. */
export interface AchievementView extends AchievementDef {
  unlocked: boolean;
  /** Unlock time from the injected clock, or null while locked. */
  unlockedAt: number | null;
  /** Current counter value (0 for untouched or boolean achievements). */
  progress: number;
  /** `progress / target` in `[0, 1]`; 1 when unlocked or when there is no target. */
  fraction: number;
}

/** Emitted the instant an achievement unlocks — wire to a toast, feed, or sound. */
export interface AchievementUnlock {
  id: string;
  def: AchievementDef;
  at: number;
}

/** Whole serializable state of a tracker — drop into a save blob. */
export interface AchievementSnapshot {
  /** Achievement id → unlock timestamp. */
  unlocked: Record<string, number>;
  /** Achievement id → counter progress. */
  counters: Record<string, number>;
}

/** Live achievement state over a fixed definition set — drives progress, unlocks, score, and a UI view list. */
export interface AchievementTracker {
  /** Add `amount` (default 1) to a counter achievement; unlocks on reaching `target`. Returns the unlock if it just crossed, else null. */
  progress(id: string, amount?: number): AchievementUnlock | null;
  /** Set a counter achievement's absolute value; unlocks on reaching `target`. Returns the unlock if it just crossed, else null. */
  setProgress(id: string, value: number): AchievementUnlock | null;
  /** Unlock directly (boolean or counter). Returns the unlock, or null if unknown or already unlocked. */
  unlock(id: string): AchievementUnlock | null;
  isUnlocked(id: string): boolean;
  get(id: string): AchievementView | null;
  /** All achievements with live state, in definition order. Stable identity between changes (safe for `useSyncExternalStore`). */
  list(): readonly AchievementView[];
  unlocked(): readonly AchievementView[];
  /** Total `points` across unlocked achievements. */
  score(): number;
  /** Fraction of achievements unlocked, `[0, 1]`. */
  completion(): number;
  subscribe(listener: () => void): () => void;
  snapshot(): AchievementSnapshot;
  restore(snapshot: AchievementSnapshot): void;
}

/** Options for {@link createAchievementTracker}. */
export interface AchievementTrackerOptions {
  defs: readonly AchievementDef[];
  /** Injected clock (ms). Default `Date.now`. */
  now?: () => number;
  /** Fires whenever an achievement unlocks — the seam for toasts, kill-feed lines, sounds, or telemetry. */
  onUnlock?: (unlock: AchievementUnlock) => void;
}

/**
 * Tracks achievement/trophy unlocks over caller-driven events — counter goals
 * (`progress`/`setProgress`) and boolean flags (`unlock`) — with score,
 * completion, an `onUnlock` seam, and serializable `snapshot`/`restore`. State
 * is plain data; the view list keeps a stable identity between changes so React
 * can read it through `useSyncExternalStore` without re-projecting every frame.
 *
 * @capability achievements track achievement/trophy unlocks over counter goals and boolean flags, with score, completion, an onUnlock seam, and serializable snapshot/restore
 */
export function createAchievementTracker(options: AchievementTrackerOptions): AchievementTracker {
  const now = options.now ?? Date.now;
  const order: string[] = [];
  const defs = new Map<string, AchievementDef>();
  for (const def of options.defs) {
    if (defs.has(def.id)) continue;
    defs.set(def.id, def);
    order.push(def.id);
  }
  const unlockedAt = new Map<string, number>();
  const counters = new Map<string, number>();
  const listeners = new Set<() => void>();
  let cache: readonly AchievementView[] | null = null;

  function notify(): void {
    cache = null;
    for (const listener of listeners) listener();
  }

  function viewOf(id: string): AchievementView {
    const def = defs.get(id)!;
    const at = unlockedAt.get(id) ?? null;
    const progress = counters.get(id) ?? 0;
    const fraction =
      at !== null ? 1 : def.target !== undefined && def.target > 0 ? Math.min(1, progress / def.target) : 0;
    return { ...def, unlocked: at !== null, unlockedAt: at, progress, fraction };
  }

  function doUnlock(id: string): AchievementUnlock {
    const at = now();
    unlockedAt.set(id, at);
    const def = defs.get(id)!;
    if (def.target !== undefined) counters.set(id, def.target);
    const unlock: AchievementUnlock = { id, def, at };
    options.onUnlock?.(unlock);
    return unlock;
  }

  function applyCounter(id: string, value: number): AchievementUnlock | null {
    const def = defs.get(id);
    if (def === undefined || def.target === undefined) return null;
    if (unlockedAt.has(id)) return null;
    const clamped = Math.max(0, Math.min(def.target, value));
    counters.set(id, clamped);
    if (clamped >= def.target) {
      const unlock = doUnlock(id);
      notify();
      return unlock;
    }
    notify();
    return null;
  }

  const tracker: AchievementTracker = {
    progress(id, amount = 1) {
      return applyCounter(id, (counters.get(id) ?? 0) + amount);
    },
    setProgress(id, value) {
      return applyCounter(id, value);
    },
    unlock(id) {
      if (!defs.has(id) || unlockedAt.has(id)) return null;
      const unlock = doUnlock(id);
      notify();
      return unlock;
    },
    isUnlocked(id) {
      return unlockedAt.has(id);
    },
    get(id) {
      return defs.has(id) ? viewOf(id) : null;
    },
    list() {
      if (cache === null) cache = order.map(viewOf);
      return cache;
    },
    unlocked() {
      return tracker.list().filter((view) => view.unlocked);
    },
    score() {
      let total = 0;
      for (const id of unlockedAt.keys()) total += defs.get(id)?.points ?? 0;
      return total;
    },
    completion() {
      return order.length === 0 ? 0 : unlockedAt.size / order.length;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        unlocked: Object.fromEntries(unlockedAt),
        counters: Object.fromEntries(counters),
      };
    },
    restore(snapshot) {
      unlockedAt.clear();
      counters.clear();
      for (const [id, at] of Object.entries(snapshot.counters)) {
        if (defs.has(id)) counters.set(id, at);
      }
      for (const [id, at] of Object.entries(snapshot.unlocked)) {
        if (defs.has(id)) unlockedAt.set(id, at);
      }
      notify();
    },
  };

  return tracker;
}
