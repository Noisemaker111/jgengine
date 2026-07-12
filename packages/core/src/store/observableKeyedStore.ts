export interface ObservableKeyedStore<T> {
  set(key: string, value: T): void;
  delete(key: string): void;
  get(key: string): T | undefined;
  has(key: string): boolean;
  subscribe(listener: () => void): () => void;
  mapSnapshot(): ReadonlyMap<string, T>;
  arraySnapshot(): readonly T[];
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
  const EMPTY: readonly T[] = [];
  let arrayCache: readonly T[] = EMPTY;
  let arrayDirty = false;

  function emit(): void {
    arrayDirty = true;
    for (const listener of listeners) listener();
  }

  return {
    set(key, value) {
      const previous = store.get(key);
      if (previous !== undefined && areEqual?.(previous, value)) return;
      if (previous !== value) store.set(key, value);
      emit();
    },
    delete(key) {
      if (!store.has(key)) return;
      store.delete(key);
      emit();
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
    snapshot() {
      return Array.from(store.entries());
    },
    hydrate(data) {
      store.clear();
      for (const [key, value] of data) store.set(key, value);
      emit();
    },
  };
}
