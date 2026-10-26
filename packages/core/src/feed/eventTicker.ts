import { appendFeed, pruneFeed, type TimedFeedEntry } from "./feed";

/**
 * One event pushed onto the ticker. `kind` and `icon` are free strings the game owns
 * and the model never interprets — they only ride through to the renderer so a game can
 * color, icon, and group each entry however it likes ("kill", "assist", "info", …).
 */
export interface EventTickerInput {
  /** Free-string category the game styles; the model never branches on it. */
  kind: string;
  /** The line to show (e.g. `"Ranger eliminated Marauder"`). */
  text: string;
  /** Optional free-string icon name the renderer resolves. */
  icon?: string;
}

/** A stored ticker entry — an {@link EventTickerInput} stamped with an id and clock time. */
export interface EventTickerEntry extends TimedFeedEntry {
  /** Stable id assigned at push time. */
  id: number;
  /** Clock time (ms) the entry was pushed, for age-based fade/prune. */
  at: number;
  /** The game-owned free-string category. */
  kind: string;
  /** The line to show. */
  text: string;
  /** Optional free-string icon name. */
  icon: string | undefined;
}

/**
 * A live ticker entry as handed to the renderer: the stored entry plus a `fade` value
 * `0..1` (age / `ttlMs`) — `0` for a fresh entry, approaching `1` as it nears expiry —
 * so the UI can drop opacity as an entry ages out. `fade` is always `0` when no `ttlMs`
 * is configured.
 */
export interface EventTickerView extends EventTickerEntry {
  /** How faded this entry should be, `0` (fresh) → `1` (about to expire). */
  fade: number;
}

/** Serializable state of the ticker, for save/restore. */
export interface EventTickerSnapshot {
  /** Wall-clock (ms) the snapshot was taken, so restore re-anchors entry ages. */
  now: number;
  /** Next id to hand out. */
  nextId: number;
  /** The kept entries, oldest first. */
  entries: readonly EventTickerEntry[];
}

/** Options for {@link createEventTicker}. */
export interface EventTickerOptions {
  /** Injected clock (ms). Default `Date.now`. */
  now?: () => number;
  /** Max entries kept — older ones drop off the tail. Omit for no count cap. */
  limit?: number;
  /**
   * How long (ms) an entry lives before it should be fully faded and pruned. Omit to keep
   * entries indefinitely with `fade` pinned at `0`.
   */
  ttlMs?: number;
}

/** A live, observable event/kill-feed ticker. */
export interface EventTicker {
  /**
   * Append an event. Stamps `at` from the injected clock, assigns an id, applies the count
   * cap, and notifies subscribers. Returns the new entry's id.
   */
  push(input: EventTickerInput): number;
  /**
   * Prune entries older than `ttlMs` (relative to `nowOverride ?? now()`), then return the
   * live entries newest-first, each carrying its `fade` `0..1`. Safe to call every frame:
   * it drops expired entries but does not notify (the caller re-renders on its own tick).
   */
  recent(nowOverride?: number): EventTickerView[];
  /** The kept entries oldest-first, without `fade` — a plain snapshot of the buffer. */
  entries(): EventTickerEntry[];
  /** Drop every entry. Notifies subscribers. */
  clear(): void;
  /** Observe changes (push, clear, restore). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): EventTickerSnapshot;
  /** Restore from an {@link EventTickerSnapshot}, re-anchoring entry ages to the current clock. */
  restore(snapshot: EventTickerSnapshot): void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A thin, serializable, observable event/kill-feed ticker over the flat {@link appendFeed} /
 * {@link pruneFeed} feed helpers: a single rolling, count-capped, time-fading list of
 * free-string entries. A game calls `push({ kind, text, icon? })` and the ticker stamps and
 * caps it; `recent()` prunes expired entries and returns the live list newest-first, each with
 * a `fade` `0..1` (age / `ttlMs`) for the renderer to drop opacity as entries age out. Nothing
 * here is genre-specific: `kind`, `text`, and `icon` are free strings the game owns and styles,
 * and the model never interprets them. `snapshot`/`restore` round-trips the buffer through a
 * save, re-anchoring ages so fades resume correctly.
 *
 * @capability event-ticker rolling capped, timed-fade event/kill-feed ticker of free-string entries over the feed helpers — push/recent-with-fade, snapshot/restore
 */
export function createEventTicker(config: EventTickerOptions = {}): EventTicker {
  const now = config.now ?? Date.now;
  const limit = config.limit;
  const ttlMs = config.ttlMs;

  let entries: EventTickerEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  /** Drop expired entries in place; returns `true` when the list changed. */
  function prune(t: number): boolean {
    if (ttlMs === undefined) return false;
    const kept = pruneFeed(entries, t, ttlMs);
    if (kept === entries) return false;
    entries = kept;
    return true;
  }

  return {
    push(input) {
      const id = nextId++;
      const entry: EventTickerEntry = {
        id,
        at: now(),
        kind: input.kind,
        text: input.text,
        icon: input.icon,
      };
      entries = appendFeed(entries, entry, limit === undefined ? undefined : { limit });
      notify();
      return id;
    },
    recent(nowOverride) {
      const t = nowOverride ?? now();
      prune(t);
      const out: EventTickerView[] = [];
      // Newest first: walk the tail-to-head of the oldest-first buffer.
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i]!;
        const fade = ttlMs === undefined || ttlMs <= 0 ? 0 : clamp01((t - entry.at) / ttlMs);
        out.push({ ...entry, fade });
      }
      return out;
    },
    entries() {
      return entries.slice();
    },
    clear() {
      if (entries.length === 0) return;
      entries = [];
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return {
        now: now(),
        nextId,
        entries: entries.map((entry) => ({ ...entry })),
      };
    },
    restore(snapshot) {
      nextId = snapshot.nextId;
      const drift = now() - snapshot.now;
      entries = snapshot.entries.map((entry) => ({ ...entry, at: entry.at + drift }));
      notify();
    },
  };
}
