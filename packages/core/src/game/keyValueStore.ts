/** Structural, DOM-free storage backend: the browser `localStorage` satisfies it, as does a test stub or `null`. The one storage seam core primitives target so persistence code never needs the DOM `Storage` lib. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The ambient `localStorage` when available, otherwise `null`. An optional observer receives denied getter errors; it may rethrow to reject fallback. Never references the DOM `Storage` type, so it is safe in core. */
export function defaultKeyValueStorage(onError?: (error: unknown) => void): KeyValueStorage | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return (globalThis as { localStorage?: KeyValueStorage }).localStorage ?? null;
    }
  } catch (error) {
    onError?.(error);
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
  readonly storage?: KeyValueStorage | null | undefined;
  readonly serialize?: (value: T) => string;
  readonly deserialize?: (raw: string) => T;
}

/** A mutable local save cell through {@link KeyValueStorage}. A failed read, write or removal throws the storage's own error and leaves the cell as it was; `storage: null` deliberately uses memory only. */
export function createKeyValueStore<T>(config: KeyValueStoreConfig<T>): KeyValueStore<T> {
  const storage =
    config.storage === undefined
      ? defaultKeyValueStorage((error) => {
          throw error;
        })
      : config.storage;
  if (storage === null && config.storage !== null) throw new Error("Local storage is unavailable");
  const serialize = config.serialize ?? ((value: T) => JSON.stringify(value));
  const deserialize = config.deserialize ?? ((raw: string) => JSON.parse(raw) as T);

  const read = (): T => {
    if (storage === null) return config.initial;
    const raw = storage.getItem(config.key);
    return raw === null ? config.initial : deserialize(raw);
  };

  let current = read();

  const write = (value: T): void => {
    storage?.setItem(config.key, serialize(value));
    current = value;
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
      storage?.removeItem(config.key);
      current = config.initial;
    },
  };
}
