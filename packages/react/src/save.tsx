import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import type { SaveStatus, SaveStore } from "@jgengine/core/game/saveStore";

/** The reactive slice of a {@link SaveStore} returned by {@link useSaveStore} — the live value plus bound save actions, all re-rendering on change. */
export interface SaveStoreView<T> {
  value: T;
  status: SaveStatus;
  slot: string;
  /** True while the initial `load()` is in flight — gate a loading screen on it. */
  loading: boolean;
  /** True while a write is in flight — show a "Saving…" indicator. */
  saving: boolean;
  set: (value: T) => void;
  patch: (mutate: (previous: T) => T) => void;
  save: () => Promise<void>;
  clear: () => Promise<void>;
}

/**
 * Bind a {@link SaveStore} to React: returns the live `value` and `status` and
 * re-renders whenever either changes. By default it calls `load()` once on
 * mount (pass `{ load: false }` to hydrate yourself). The same hook works for
 * offline (localStorage) and cloud (Convex/DB) saves — only the store's backend
 * differs.
 */
export function useSaveStore<T>(store: SaveStore<T>, options?: { load?: boolean }): SaveStoreView<T> {
  useSyncExternalStore(store.subscribe, store.revision, store.revision);

  const shouldLoad = options?.load !== false;
  const loadedFor = useRef<SaveStore<T> | null>(null);
  useEffect(() => {
    if (!shouldLoad) return;
    if (loadedFor.current === store) return;
    loadedFor.current = store;
    void store.load();
  }, [store, shouldLoad]);

  const set = useCallback((value: T) => store.set(value), [store]);
  const patch = useCallback((mutate: (previous: T) => T) => void store.patch(mutate), [store]);
  const save = useCallback(() => store.save(), [store]);
  const clear = useCallback(() => store.clear(), [store]);

  const status = store.status();
  return {
    value: store.value(),
    status,
    slot: store.slot(),
    loading: status === "loading",
    saving: status === "saving",
    set,
    patch,
    save,
    clear,
  };
}
