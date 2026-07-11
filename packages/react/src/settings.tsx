import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";

import {
  createSettingsStore,
  type SettingCategory,
  type SettingKind,
  type SettingOption,
  type SettingsStore,
  type SettingsSurface,
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

export interface SettingsRow {
  id: string;
  label: string;
  kind: SettingKind;
  value: SettingValue;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly SettingOption[];
  format?: (value: number) => string;
  set: (value: SettingValue) => void;
}

export interface SettingsKeybindRow {
  action: string;
  label: string;
  bindingLabel: string;
  isDefault: boolean;
  rebind: (code: string) => void;
  reset: () => void;
}

export interface SettingsCategoryView {
  id: SettingCategory;
  label: string;
  rows: SettingsRow[];
  keybinds: SettingsKeybindRow[];
}

/** The live settings controller — every category/row/keybind plus open-state. Render it any way you like or drive the engine menu. */
export interface SettingsController {
  categories: SettingsCategoryView[];
  mode: "overlay" | "page";
  surface: SettingsSurface | false;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

const SettingsControllerContext = createContext<SettingsController | null>(null);

export function SettingsControllerProvider({
  controller,
  children,
}: {
  controller: SettingsController;
  children: ReactNode;
}) {
  return <SettingsControllerContext.Provider value={controller}>{children}</SettingsControllerContext.Provider>;
}

/** The engine settings controller for the current game — render your own settings UI from `categories`, or open the built-in menu with `open()`. Null-safe stub when mounted outside the shell. */
export function useSettings(): SettingsController {
  return useContext(SettingsControllerContext) ?? EMPTY_CONTROLLER;
}

const noop = () => undefined;
const EMPTY_CONTROLLER: SettingsController = {
  categories: [],
  mode: "overlay",
  surface: "menu",
  isOpen: false,
  open: noop,
  close: noop,
  setOpen: noop,
};
