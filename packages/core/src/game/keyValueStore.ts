/** Structural, DOM-free storage backend: the browser `localStorage` satisfies it, as does a test stub or `null`. The one storage seam core primitives target so persistence code never needs the DOM `Storage` lib. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The ambient `localStorage` as a {@link KeyValueStorage} when one exists (browser), otherwise `null` (server/tests) — never references the DOM `Storage` type, so it is safe in core. */
export function defaultKeyValueStorage(): KeyValueStorage | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return (globalThis as { localStorage?: KeyValueStorage }).localStorage ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

/** A single persisted, mutable cell: read the current value, overwrite it, or read-modify-write with {@link KeyValueStore.update}. Unlike a record book it has no monotonic guard — the value goes wherever you set it. */
export interface KeyValueStore<T> {
  get(): T;
  set(value: T): void;
  update(mutate: (previous: T) => T): T;
  clear(): void;
}

/** Config for {@link createKeyValueStore}: the storage `key`, the `initial` value used before anything is saved, an optional `storage` backend (defaults to `localStorage`, pass `null` for memory-only), and optional custom `serialize`/`deserialize` (default JSON). */
export interface KeyValueStoreConfig<T> {
  readonly key: string;
  readonly initial: T;
  readonly storage?: KeyValueStorage | null;
  readonly serialize?: (value: T) => string;
  readonly deserialize?: (raw: string) => T;
}

/** A lightweight mutable local save cell for single-player state (a credit bank, a settings blob, level progress) — the read-modify-write counterpart to the monotonic `recordBook`. Persists through a {@link KeyValueStorage} (browser `localStorage` by default); corrupt or unavailable storage degrades to in-memory and never throws into a game tick. */
export function createKeyValueStore<T>(config: KeyValueStoreConfig<T>): KeyValueStore<T> {
  const storage = config.storage === undefined ? defaultKeyValueStorage() : config.storage;
  const serialize = config.serialize ?? ((value: T) => JSON.stringify(value));
  const deserialize = config.deserialize ?? ((raw: string) => JSON.parse(raw) as T);

  const read = (): T => {
    if (storage === null) return config.initial;
    try {
      const raw = storage.getItem(config.key);
      return raw === null ? config.initial : deserialize(raw);
    } catch {
      return config.initial;
    }
  };

  let current = read();

  const write = (value: T): void => {
    current = value;
    if (storage === null) return;
    try {
      storage.setItem(config.key, serialize(value));
    } catch {
      // storage rejected the write; keep the value in memory for this session
    }
  };

  return {
    get: () => current,
    set: (value: T) => write(value),
    update: (mutate: (previous: T) => T) => {
      const next = mutate(current);
      write(next);
      return next;
    },
    clear: () => {
      current = config.initial;
      if (storage === null) return;
      try {
        storage.removeItem(config.key);
      } catch {
        // ignore removal failure; in-memory value already reset
      }
    },
  };
}
