import type { GameEventMap, GameEvents } from "./events";

export interface FeedEntry<T = unknown> {
  at: number;
  data: T;
}

/** Any feed entry carrying a game-time (or wall-clock) `at` stamp for age-based pruning. */
export interface TimedFeedEntry {
  at: number;
}

/** Bounds for {@link appendFeed} / {@link pruneFeed}: newest-`limit` cap and/or `ttl` age window. */
export interface FeedWindow {
  /** Keep only the newest `limit` entries. Omit for no count cap. */
  limit?: number;
  /** Drop entries older than `ttl` game-seconds before the newest `at`. Omit for no age cap. */
  ttl?: number;
}

export interface GameFeedOptions {
  limit?: number;
}

/**
 * Append `entry` to a flat, serializable feed list, then bound it by age (`ttl`, relative to the
 * appended entry's `at`) and/or count (`limit`, newest kept). Works on the game's own flat entry
 * shape — anything with an `at` stamp — so `{ id, text, tone, at }`-style notice lists and event
 * logs drop into serialized state with no `{ at, data }` envelope. Returns a new array.
 *
 * @capability notice-feed serializable tone-tagged notice/event feed bounded by count and age (toasts, life events, killfeed)
 */
export function appendFeed<T extends TimedFeedEntry>(
  list: readonly T[],
  entry: T,
  options?: FeedWindow,
): T[] {
  let next: T[] = [...list, entry];
  if (options?.ttl !== undefined) {
    const cutoff = entry.at - options.ttl;
    next = next.filter((item) => item.at > cutoff);
  }
  const limit = options?.limit;
  return limit !== undefined && next.length > limit ? next.slice(next.length - limit) : next;
}

/**
 * Drop feed entries older than `ttl` game-seconds before `now`. Returns the same array reference
 * when nothing expired, so equality checks skip a redundant state write. The tick-time counterpart
 * to {@link appendFeed}'s age bound.
 *
 * @capability notice-feed serializable tone-tagged notice/event feed bounded by count and age (toasts, life events, killfeed)
 */
export function pruneFeed<T extends TimedFeedEntry>(list: readonly T[], now: number, ttl: number): T[] {
  const cutoff = now - ttl;
  const kept = list.filter((item) => item.at > cutoff);
  return kept.length === list.length ? (list as T[]) : kept;
}

export function appendFeedEntry<T>(
  buffer: readonly FeedEntry<T>[],
  entry: FeedEntry<T>,
  limit: number,
): FeedEntry<T>[] {
  return appendFeed(buffer, entry, { limit });
}

export function recentFeedEntries<T>(buffer: readonly FeedEntry<T>[], limit?: number): FeedEntry<T>[] {
  const count = limit ?? buffer.length;
  return buffer.slice(Math.max(0, buffer.length - count));
}

export interface GameFeed {
  bind<TName extends keyof GameEventMap>(action: TName, events: GameEvents): () => void;
  push(action: string, entry: unknown): void;
  recent(action: string, options?: { limit?: number }): FeedEntry[];
  subscribe(action: string, listener: (entry: FeedEntry) => void): () => void;
  snapshot(): Record<string, FeedEntry[]>;
  hydrate(data: Record<string, FeedEntry[]>): void;
}

/**
 * A rolling per-action feed of recent gameplay events, bindable to the event bus — the HUD ticker and killfeed history.
 *
 * @capability event-feed a rolling feed of recent gameplay events for a HUD ticker or killfeed
 */
export function createGameFeed(options?: GameFeedOptions): GameFeed {
  const limit = options?.limit ?? 20;
  const buffers = new Map<string, FeedEntry[]>();
  const listeners = new Map<string, Set<(entry: FeedEntry) => void>>();

  function append(action: string, entry: FeedEntry): void {
    buffers.set(action, appendFeedEntry(buffers.get(action) ?? [], entry, limit));
    for (const listener of listeners.get(action) ?? []) listener(entry);
  }

  return {
    bind(action, events) {
      return events.on(action, (payload) => append(action as string, { at: Date.now(), data: payload }));
    },
    push(action, data) {
      append(action, { at: Date.now(), data });
    },
    recent(action, opts) {
      return recentFeedEntries(buffers.get(action) ?? [], opts?.limit);
    },
    subscribe(action, listener) {
      let set = listeners.get(action);
      if (!set) {
        set = new Set();
        listeners.set(action, set);
      }
      set.add(listener);
      return () => set.delete(listener);
    },
    snapshot() {
      const out: Record<string, FeedEntry[]> = {};
      for (const [action, buffer] of buffers) out[action] = buffer.slice();
      return out;
    },
    hydrate(data) {
      buffers.clear();
      for (const [action, buffer] of Object.entries(data)) buffers.set(action, buffer.slice(-limit));
    },
  };
}
