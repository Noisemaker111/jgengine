export interface ObservableKeyedStore<T> {
  set(key: string, value: T): void;
  delete(key: string): void;
  get(key: string): T | undefined;
  has(key: string): boolean;
  subscribe(listener: () => void): () => void;
  mapSnapshot(): ReadonlyMap<string, T>;
  arraySnapshot(): readonly T[];
}

export function createObservableKeyedStore<T>(
  areEqual?: (previous: T, next: T) => boolean,
): ObservableKeyedStore<T> {
  const store = new Map<string, T>();
  const listeners = new Set<() => void>();
  const EMPTY: readonly T[] = [];
  let arrayCache: readonly T[] = EMPTY;

  function emit(): void {
    arrayCache = store.size === 0 ? EMPTY : Array.from(store.values());
    for (const listener of listeners) listener();
  }

  return {
    set(key, value) {
      const previous = store.get(key);
      if (previous !== undefined && areEqual?.(previous, value)) return;
      store.set(key, value);
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
      return arrayCache;
    },
  };
}
