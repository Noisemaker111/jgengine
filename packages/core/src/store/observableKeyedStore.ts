export interface ObservableKeyedStore<T> {
  set(key: string, value: T): void;
  delete(key: string): void;
  get(key: string): T | undefined;
  has(key: string): boolean;
  subscribe(listener: () => void): () => void;
  /** Notified only when membership changes (a key is added, deleted, or hydrated) — value updates on an existing key do not fire. Pair with {@link keysSnapshot}. */
  subscribeMembership(listener: () => void): () => void;
  mapSnapshot(): ReadonlyMap<string, T>;
  arraySnapshot(): readonly T[];
  /** Stable-identity list of keys; identity changes only when membership changes, so a per-frame `set` on an existing key does not churn it. */
  keysSnapshot(): readonly string[];
  /** Serializable `[key, value]` entries — the transport counterpart of {@link hydrate} for host→client mirroring. */
  snapshot(): readonly (readonly [string, T])[];
  /** Replace all entries with `data` (clears keys absent from it), emitting once. */
  hydrate(data: readonly (readonly [string, T])[]): void;
}

export function createObservableKeyedStore<T>(
  areEqual?: (previous: T, next: T) => boolean,
): ObservableKeyedStore<T> {
  const store = new Map<string, T>();
  const listeners = new Set<() => void>();
  const membershipListeners = new Set<() => void>();
  const EMPTY: readonly T[] = [];
  const EMPTY_KEYS: readonly string[] = [];
  let arrayCache: readonly T[] = EMPTY;
  let arrayDirty = false;
  let keysCache: readonly string[] = EMPTY_KEYS;
  let keysDirty = false;

  function emit(): void {
    arrayDirty = true;
    for (const listener of listeners) listener();
  }

  function emitMembership(): void {
    keysDirty = true;
    for (const listener of membershipListeners) listener();
  }

  return {
    set(key, value) {
      const had = store.has(key);
      const previous = store.get(key);
      if (had && areEqual?.(previous as T, value)) return;
      if (previous !== value) store.set(key, value);
      emit();
      if (!had) emitMembership();
    },
    delete(key) {
      if (!store.has(key)) return;
      store.delete(key);
      emit();
      emitMembership();
    },
    get(key) {
      return store.get(key);
    },
    has(key) {
      return store.has(key);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeMembership(listener) {
      membershipListeners.add(listener);
      return () => membershipListeners.delete(listener);
    },
    mapSnapshot() {
      return store;
    },
    arraySnapshot() {
      if (arrayDirty) {
        arrayCache = store.size === 0 ? EMPTY : Array.from(store.values());
        arrayDirty = false;
      }
      return arrayCache;
    },
    keysSnapshot() {
      if (keysDirty) {
        keysCache = store.size === 0 ? EMPTY_KEYS : Array.from(store.keys());
        keysDirty = false;
      }
      return keysCache;
    },
    snapshot() {
      return Array.from(store.entries());
    },
    hydrate(data) {
      store.clear();
      for (const [key, value] of data) store.set(key, value);
      emit();
      emitMembership();
    },
  };
}
