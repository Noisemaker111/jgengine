import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";

import {
  createSettingsStore,
  type SettingsStore,
  type SettingValue,
} from "@jgengine/core/settings/settingsModel";

const SettingsStoreContext = createContext<SettingsStore | null>(null);

export function SettingsProvider({ store, children }: { store: SettingsStore; children: ReactNode }) {
  return <SettingsStoreContext.Provider value={store}>{children}</SettingsStoreContext.Provider>;
}

/** The shared settings store, or a standalone one when no provider is mounted (game code read outside the shell). */
export function useSettingsStore(): SettingsStore {
  const store = useContext(SettingsStoreContext);
  return store ?? fallbackStore();
}

let standalone: SettingsStore | null = null;
function fallbackStore(): SettingsStore {
  if (standalone === null) standalone = createSettingsStore();
  return standalone;
}

/** Read + write one persisted setting; re-renders when the value changes anywhere. */
export function useSetting<T extends SettingValue>(id: string, fallback: T): readonly [T, (value: SettingValue) => void] {
  const store = useSettingsStore();
  const value = useSyncExternalStore(
    store.subscribe,
    () => store.get(id, fallback),
    () => fallback,
  );
  const set = useCallback((next: SettingValue) => store.set(id, next), [store, id]);
  return [value, set];
}
