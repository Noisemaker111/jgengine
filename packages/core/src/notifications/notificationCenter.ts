/** One persistent notification — unlike a transient toast, it stays in the log until dismissed. */
export interface NotificationEntry<TMeta = unknown> {
  id: string;
  /** Severity/category (`"info"`, `"success"`, `"warning"`, `"danger"`, or a game kind). */
  kind: string;
  title: string;
  body?: string;
  /** Creation time from the injected clock. */
  at: number;
  read: boolean;
  meta?: TMeta;
}

/** Fields accepted by {@link NotificationStore.push}. */
export interface NotificationInput<TMeta = unknown> {
  id?: string;
  kind?: string;
  title: string;
  body?: string;
  at?: number;
  meta?: TMeta;
}

/** Filter for {@link NotificationStore.list}. */
export interface NotificationFilter {
  kind?: string;
  unreadOnly?: boolean;
}

/** Serializable, observable log of persistent notifications with read tracking. */
export interface NotificationStore<TMeta = unknown> {
  push(input: NotificationInput<TMeta>): NotificationEntry<TMeta>;
  /** Newest-first; filter by kind and/or unread. Stable identity between changes for the unfiltered read. */
  list(filter?: NotificationFilter): readonly NotificationEntry<TMeta>[];
  unreadCount(): number;
  markRead(id: string): void;
  markAllRead(): void;
  remove(id: string): boolean;
  clear(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): readonly NotificationEntry<TMeta>[];
  restore(snapshot: readonly NotificationEntry<TMeta>[]): void;
}

/** Options for {@link createNotificationCenter}. */
export interface NotificationCenterOptions {
  /** Injected clock (ms). Default `Date.now`. */
  now?: () => number;
  /** Keep only the newest `cap` notifications. Default 100; 0 = unbounded. */
  cap?: number;
}

/**
 * A persistent notification log with read/unread tracking — the "notification
 * center" surface toasts don't cover. Newest-first, capped, serializable, and
 * observable; a game pushes durable events (quest updates, trades, party news)
 * here and a HUD renders the list + an unread badge. `snapshot`/`restore`
 * round-trip through a save.
 *
 * @capability notification-center persistent, read-tracked notification log (newest-first, capped, serializable) behind an unread badge — the durable counterpart to transient toasts
 */
export function createNotificationCenter<TMeta = unknown>(
  options: NotificationCenterOptions = {},
): NotificationStore<TMeta> {
  const now = options.now ?? Date.now;
  const cap = options.cap ?? 100;
  let entries: NotificationEntry<TMeta>[] = []; // newest-first
  const listeners = new Set<() => void>();
  let cache: readonly NotificationEntry<TMeta>[] | null = null;
  let counter = 0;

  function notify(): void {
    cache = null;
    for (const listener of listeners) listener();
  }

  function generateId(): string {
    counter += 1;
    return `notice-${counter}`;
  }

  return {
    push(input) {
      const entry: NotificationEntry<TMeta> = {
        id: input.id ?? generateId(),
        kind: input.kind ?? "info",
        title: input.title,
        at: input.at ?? now(),
        read: false,
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.meta !== undefined ? { meta: input.meta } : {}),
      };
      entries = [entry, ...entries.filter((existing) => existing.id !== entry.id)];
      if (cap > 0 && entries.length > cap) entries = entries.slice(0, cap);
      notify();
      return entry;
    },
    list(filter) {
      if (filter === undefined) {
        if (cache === null) cache = [...entries];
        return cache;
      }
      return entries.filter(
        (entry) =>
          (filter.kind === undefined || entry.kind === filter.kind) &&
          (filter.unreadOnly !== true || !entry.read),
      );
    },
    unreadCount() {
      let count = 0;
      for (const entry of entries) if (!entry.read) count += 1;
      return count;
    },
    markRead(id) {
      const entry = entries.find((candidate) => candidate.id === id);
      if (entry === undefined || entry.read) return;
      entry.read = true;
      notify();
    },
    markAllRead() {
      let changed = false;
      for (const entry of entries) {
        if (!entry.read) {
          entry.read = true;
          changed = true;
        }
      }
      if (changed) notify();
    },
    remove(id) {
      const next = entries.filter((entry) => entry.id !== id);
      if (next.length === entries.length) return false;
      entries = next;
      notify();
      return true;
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
      if (cache === null) cache = [...entries];
      return cache;
    },
    restore(snapshot) {
      entries = snapshot.map((entry) => ({ ...entry }));
      if (cap > 0 && entries.length > cap) entries = entries.slice(0, cap);
      notify();
    },
  };
}
