import type { GameEventMap, GameEvents } from "./events";

export interface FeedEntry<T = unknown> {
  at: number;
  data: T;
}

export interface GameFeedOptions {
  limit?: number;
}

export interface GameFeed {
  bind<TName extends keyof GameEventMap>(action: TName, events: GameEvents): () => void;
  push(action: string, entry: unknown): void;
  recent(action: string, options?: { limit?: number }): FeedEntry[];
  subscribe(action: string, listener: (entry: FeedEntry) => void): () => void;
  snapshot(): Record<string, FeedEntry[]>;
  hydrate(data: Record<string, FeedEntry[]>): void;
}

export function createGameFeed(options?: GameFeedOptions): GameFeed {
  const limit = options?.limit ?? 20;
  const buffers = new Map<string, FeedEntry[]>();
  const listeners = new Map<string, Set<(entry: FeedEntry) => void>>();

  function append(action: string, entry: FeedEntry): void {
    const buffer = buffers.get(action) ?? [];
    buffer.push(entry);
    if (buffer.length > limit) buffer.splice(0, buffer.length - limit);
    buffers.set(action, buffer);
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
      const buffer = buffers.get(action) ?? [];
      const count = opts?.limit ?? buffer.length;
      return buffer.slice(Math.max(0, buffer.length - count));
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
