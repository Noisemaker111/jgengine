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

/** A failed storage operation, retaining the backend's original error and affected key. */
export interface KeyValueStorageFailure {
  operation: "read" | "write" | "remove";
  key: string;
  error: unknown;
}

/** Fallback keeps session state after a failed operation; throw exposes failure and preserves the previous cell value. Observers must not throw. */
export interface KeyValueStorageErrorPolicy {
  errorMode?: "fallback" | "throw";
  onError?: (failure: KeyValueStorageFailure) => void;
}

/** @internal */
export function reportStorageFailure(policy: KeyValueStorageErrorPolicy, failure: KeyValueStorageFailure): void {
  policy.onError?.(failure);
  if (policy.errorMode === "throw") throw failure.error;
}

/** A single persisted, mutable cell: read the current value, overwrite it, or read-modify-write with {@link KeyValueStore.update}. Unlike a record book it has no monotonic guard — the value goes wherever you set it. */
export interface KeyValueStore<T> {
  get(): T;
  set(value: T): void;
  update(mutate: (previous: T) => T): T;
  clear(): void;
}

/** Config for {@link createKeyValueStore}: the storage `key`, the `initial` value used before anything is saved, an optional `storage` backend (defaults to `localStorage`, pass `null` for memory-only), and optional custom `serialize`/`deserialize` (default JSON). */
export interface KeyValueStoreConfig<T> extends KeyValueStorageErrorPolicy {
  readonly key: string;
  readonly initial: T;
  readonly storage?: KeyValueStorage | null;
  readonly serialize?: (value: T) => string;
  readonly deserialize?: (raw: string) => T;
}

/** A mutable local save cell through {@link KeyValueStorage}. Default fallback keeps session state on failure; `errorMode: "throw"` exposes failed reads/writes/removals through the original error. `storage: null` deliberately uses memory only. */
export function createKeyValueStore<T>(config: KeyValueStoreConfig<T>): KeyValueStore<T> {
  const fail = (operation: KeyValueStorageFailure["operation"], error: unknown): void =>
    reportStorageFailure(config, { operation, key: config.key, error });
  const storage = config.storage === undefined ? defaultKeyValueStorage((error) => fail("read", error)) : config.storage;
  const serialize = config.serialize ?? ((value: T) => JSON.stringify(value));
  const deserialize = config.deserialize ?? ((raw: string) => JSON.parse(raw) as T);

  const read = (): T => {
    if (storage === null) {
      if (config.storage !== null && config.errorMode === "throw") fail("read", new Error("Local storage is unavailable"));
      return config.initial;
    }
    try {
      const raw = storage.getItem(config.key);
      return raw === null ? config.initial : deserialize(raw);
    } catch (error) {
      fail("read", error);
      return config.initial;
    }
  };

  let current = read();

  const write = (value: T): void => {
    if (storage !== null) {
      try {
        storage.setItem(config.key, serialize(value));
      } catch (error) {
        fail("write", error);
      }
    }
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
      if (storage !== null) {
        try {
          storage.removeItem(config.key);
        } catch (error) {
          fail("remove", error);
        }
      }
      current = config.initial;
    },
  };
}
