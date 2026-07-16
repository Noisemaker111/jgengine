export interface RosterEntry {
  id: string;
  catalogId: string;
  capturedAt: number;
  equipped: boolean;
}

export interface RosterCaptureOptions {
  id?: string;
  capturedAt?: number;
}

export interface Roster {
  capture(userId: string, catalogId: string, options?: RosterCaptureOptions): RosterEntry;
  release(userId: string, entryId: string): boolean;
  has(userId: string, entryId: string): boolean;
  get(userId: string, entryId: string): RosterEntry | null;
  list(userId: string): readonly RosterEntry[];
  equippedList(userId: string): readonly RosterEntry[];
  setEquipped(userId: string, entryId: string, equipped: boolean): RosterEntry | null;
  snapshot(userId: string): readonly RosterEntry[];
  hydrate(userId: string, entries: readonly RosterEntry[]): void;
  /** Whole-store capture across every owner — the world-save/replication seam (per-owner `snapshot` can't enumerate owners). */
  snapshotAll(): Record<string, readonly RosterEntry[]>;
  hydrateAll(data: Record<string, readonly RosterEntry[]>): void;
}

export interface RosterDeps {
  now?: () => number;
}

export function createRoster(deps: RosterDeps = {}): Roster {
  const now = deps.now ?? Date.now;
  const rosters = new Map<string, Map<string, RosterEntry>>();
  let counter = 0;

  function requireEntries(userId: string): Map<string, RosterEntry> {
    let entries = rosters.get(userId);
    if (entries === undefined) {
      entries = new Map();
      rosters.set(userId, entries);
    }
    return entries;
  }

  return {
    capture(userId, catalogId, options = {}) {
      counter += 1;
      const id = options.id ?? `roster_${counter}`;
      const entry: RosterEntry = {
        id,
        catalogId,
        capturedAt: options.capturedAt ?? now(),
        equipped: false,
      };
      requireEntries(userId).set(id, entry);
      return entry;
    },
    release(userId, entryId) {
      return rosters.get(userId)?.delete(entryId) ?? false;
    },
    has(userId, entryId) {
      return rosters.get(userId)?.has(entryId) ?? false;
    },
    get(userId, entryId) {
      return rosters.get(userId)?.get(entryId) ?? null;
    },
    list(userId) {
      return Array.from(rosters.get(userId)?.values() ?? []);
    },
    equippedList(userId) {
      return Array.from(rosters.get(userId)?.values() ?? []).filter((entry) => entry.equipped);
    },
    setEquipped(userId, entryId, equipped) {
      const entries = rosters.get(userId);
      const entry = entries?.get(entryId);
      if (entries === undefined || entry === undefined) return null;
      const next = { ...entry, equipped };
      entries.set(entryId, next);
      return next;
    },
    snapshot(userId) {
      return Array.from(rosters.get(userId)?.values() ?? []);
    },
    hydrate(userId, entries) {
      rosters.set(userId, new Map(entries.map((entry) => [entry.id, entry])));
    },
    snapshotAll() {
      const out: Record<string, readonly RosterEntry[]> = {};
      for (const [userId, entries] of rosters) out[userId] = Array.from(entries.values());
      return out;
    },
    hydrateAll(data) {
      rosters.clear();
      for (const [userId, entries] of Object.entries(data)) {
        rosters.set(userId, new Map(entries.map((entry) => [entry.id, entry])));
      }
    },
  };
}
