import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";

import {
  createSettingsStore,
  type SettingCategory,
  type SettingKind,
  type SettingOption,
  type SettingsStore,
  type SettingsSurface,
  type SettingsVariant,
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

/** One editable setting rendered in a settings menu category. */
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

/** One rebindable action row rendered in the controls settings category. */
export interface SettingsKeybindRow {
  action: string;
  label: string;
  bindingLabel: string;
  isDefault: boolean;
  rebind: (code: string) => void;
  reset: () => void;
}

/** A settings menu category with its rows and keybinds, ready to render. */
export interface SettingsCategoryView {
  id: SettingCategory;
  label: string;
  rows: SettingsRow[];
  keybinds: SettingsKeybindRow[];
}

/** A resolved game-state action — `run` is already bound to the game context and closes the menu. */
export interface SettingsActionView {
  id: string;
  label: string;
  kind: "default" | "danger";
  description?: string;
  run: () => void;
}

/** The live settings controller — every category/row/keybind/action plus open-state. Render it any way you like or drive the engine menu. */
export interface SettingsController {
  categories: SettingsCategoryView[];
  /** Game-state actions (Restart, Quit…) — the menu shows them as its first "Game" tab. */
  actions: SettingsActionView[];
  variant: SettingsVariant;
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
  actions: [],
  variant: "panel",
  surface: false,
  isOpen: false,
  open: noop,
  close: noop,
  setOpen: noop,
};

/** True when the game has any setting or game-action to show — gate your own settings entry on it. */
export function useHasSettings(): boolean {
  const s = useSettings();
  return s.categories.length > 0 || s.actions.length > 0;
}

/**
 * Default HudTheme-token skin for {@link SettingsTrigger} — the 8×8 chrome button
 * games re-authored seven times. Pass your own `className` only to override placement
 * or brand chrome; the gear glyph already scales with `text-base` / `1em`.
 */
export const SETTINGS_TRIGGER_CLASSNAME =
  "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-[var(--jg-edge-bright)] bg-[var(--jg-surface)]/80 text-base text-[var(--jg-text-dim)] shadow-[0_1px_2px_rgba(0,0,0,0.6)] transition hover:bg-[var(--jg-surface-deep)] hover:text-[var(--jg-accent)]";

/**
 * Inline settings entry — drop it anywhere in your game's menu or HUD; it opens
 * the themed settings menu. Headless: pass `className` only when overriding the
 * default HudTheme skin; pass `children` to replace the gear glyph. Renders nothing
 * when the game has no settings to show, so it never leaves a dead button behind.
 */
export function SettingsTrigger({
  className = SETTINGS_TRIGGER_CLASSNAME,
  children,
  label = "Settings",
}: {
  className?: string;
  children?: ReactNode;
  label?: string;
}) {
  const settings = useSettings();
  if (settings.categories.length === 0 && settings.actions.length === 0) return null;
  return (
    <button type="button" aria-label={label} onClick={settings.open} className={className}>
      {children ?? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width="1em" height="1em" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )}
    </button>
  );
}
