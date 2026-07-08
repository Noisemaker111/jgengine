export interface GameStateHandle<T> {
  get(): T;
  set(next: T): void;
  update(updater: (current: T) => T): void;
}

export interface GameStateStore {
  define<T>(id: string, initial: T): GameStateHandle<T>;
  handle<T>(id: string): GameStateHandle<T> | null;
  get<T>(id: string): T | undefined;
  set<T>(id: string, next: T): void;
  update<T>(id: string, updater: (current: T) => T): void;
  attach(id: string, source: { subscribe(listener: () => void): () => void }): () => void;
  invalidate(): void;
  ids(): readonly string[];
}

export function createGameStateStore(notify: () => void): GameStateStore {
  const values = new Map<string, unknown>();
  const attachedIds = new Set<string>();

  function exists(id: string): boolean {
    return values.has(id) || attachedIds.has(id);
  }

  function makeHandle<T>(id: string): GameStateHandle<T> {
    return {
      get: () => values.get(id) as T,
      set(next) {
        values.set(id, next);
        notify();
      },
      update(updater) {
        values.set(id, updater(values.get(id) as T));
        notify();
      },
    };
  }

  return {
    define<T>(id: string, initial: T) {
      if (!values.has(id)) values.set(id, initial);
      return makeHandle<T>(id);
    },
    handle<T>(id: string) {
      return exists(id) ? makeHandle<T>(id) : null;
    },
    get<T>(id: string) {
      return values.get(id) as T | undefined;
    },
    set<T>(id: string, next: T) {
      if (!exists(id)) throw new Error(`gameState.set: unknown state id "${id}"`);
      values.set(id, next);
      notify();
    },
    update<T>(id: string, updater: (current: T) => T) {
      if (!exists(id)) throw new Error(`gameState.update: unknown state id "${id}"`);
      values.set(id, updater(values.get(id) as T));
      notify();
    },
    attach(id, source) {
      attachedIds.add(id);
      const unsubscribe = source.subscribe(notify);
      return () => {
        unsubscribe();
        if (!values.has(id)) attachedIds.delete(id);
      };
    },
    invalidate() {
      notify();
    },
    ids() {
      return Array.from(new Set([...values.keys(), ...attachedIds]));
    },
  };
}
