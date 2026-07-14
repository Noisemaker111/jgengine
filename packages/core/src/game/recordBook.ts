import { defaultKeyValueStorage, type KeyValueStorage } from "./keyValueStore";

/** The structural storage backend a record book persists through — an alias of the shared {@link KeyValueStorage} seam (browser `localStorage`, a test stub, or `null`). */
export type RecordStorage = KeyValueStorage;

export type RecordDirection = "lower" | "higher";

export interface RecordBookConfig<K extends string> {
  readonly key: string;
  readonly fields: Readonly<Record<K, RecordDirection>>;
  readonly storage?: RecordStorage | null;
}

export interface RecordSubmission<K extends string> {
  readonly improved: readonly K[];
  readonly best: Readonly<Partial<Record<K, number>>>;
}

export interface RecordBook<K extends string> {
  best(): Readonly<Partial<Record<K, number>>>;
  bestOf(field: K): number | null;
  submit(run: Readonly<Partial<Record<K, number>>>): RecordSubmission<K>;
  clear(): void;
}

function loadStored<K extends string>(config: RecordBookConfig<K>, storage: RecordStorage | null): Partial<Record<K, number>> {
  if (storage === null) return {};
  let raw: string | null;
  try {
    raw = storage.getItem(config.key);
  } catch {
    return {};
  }
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const best: Partial<Record<K, number>> = {};
  for (const field of Object.keys(config.fields) as K[]) {
    const value = (parsed as Record<string, unknown>)[field];
    if (typeof value === "number" && Number.isFinite(value)) best[field] = value;
  }
  return best;
}

/**
 * A personal-best record book: named numeric fields each racing toward "lower"
 * (times) or "higher" (scores, streaks), persisted through a structural
 * key-value storage (pass `localStorage` in a browser, a stub in tests, or
 * `null` for in-memory only). Corrupt or unavailable storage degrades to an
 * empty book — a record write never throws into a game tick.
 *
 * @capability best-record persist personal-best times/scores with safe storage fallback
 */
export function createRecordBook<K extends string>(config: RecordBookConfig<K>): RecordBook<K> {
  const storage = config.storage === undefined ? defaultKeyValueStorage() : config.storage;
  let best = loadStored(config, storage);

  function persist(): void {
    if (storage === null) return;
    try {
      storage.setItem(config.key, JSON.stringify(best));
    } catch {
      return;
    }
  }

  return {
    best() {
      return { ...best };
    },
    bestOf(field) {
      return best[field] ?? null;
    },
    submit(run) {
      const improved: K[] = [];
      for (const field of Object.keys(config.fields) as K[]) {
        const value = run[field];
        if (value === undefined || !Number.isFinite(value)) continue;
        const current = best[field];
        const beats = current === undefined || (config.fields[field] === "lower" ? value < current : value > current);
        if (beats) {
          best[field] = value;
          improved.push(field);
        }
      }
      if (improved.length > 0) persist();
      return { improved, best: { ...best } };
    },
    clear() {
      best = {};
      if (storage === null) return;
      try {
        storage.removeItem(config.key);
      } catch {
        return;
      }
    },
  };
}
