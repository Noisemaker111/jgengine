import { useMemo, useSyncExternalStore } from "react";

import { defaultKeyValueStorage } from "@jgengine/core/game/keyValueStore";
import type { SettingsStore } from "@jgengine/core/settings/settingsModel";

import { DEFAULT_APP_SETTINGS, createAppSettingsStore, type AppSettings, type AppSettingsStore } from "./appSettingsStore";
import { formatBindableKeyLabel } from "./keybinds";

export interface HomeRouteSearch {
  settings?: boolean | undefined;
  /** The settings tab open on the main menu. */
  tab?: string | undefined;
}

export function parseHomeRouteSearch(raw: Record<string, unknown>): HomeRouteSearch {
  const tab = raw["tab"];
  return {
    settings: raw["settings"] === true ? true : undefined,
    tab: typeof tab === "string" && tab.length > 0 ? tab : undefined,
  };
}

let appSettings: AppSettingsStore | null = null;

function appSettingsStore(): AppSettingsStore {
  if (appSettings === null) {
    appSettings = createAppSettingsStore(defaultKeyValueStorage());
    if (typeof document !== "undefined") {
      document.documentElement.dataset["reducedMotion"] = appSettings.get().reducedMotion ? "true" : "false";
    }
  }
  return appSettings;
}

/** The engine settings store LLMville's settings live in, for the main menu's settings blocks. */
export function appEngineSettings(): SettingsStore {
  return appSettingsStore().engine;
}

export function subscribeToAppSettings(listener: () => void) {
  return appSettingsStore().subscribe(listener);
}

export function getAppSettingsSnapshot(): AppSettings {
  return appSettingsStore().get();
}

export function updateAppSettings(partial: Partial<AppSettings>) {
  appSettingsStore().update(partial);
}

export function useAppSettings(): AppSettings {
  return useSyncExternalStore(subscribeToAppSettings, getAppSettingsSnapshot, () => DEFAULT_APP_SETTINGS);
}

export function useStoragePanelKeybindLabels() {
  const { keybinds } = useAppSettings();
  return useMemo(
    () => ({
      previousTab: formatBindableKeyLabel(keybinds.cycleTabPrevious.primary),
      nextTab: formatBindableKeyLabel(keybinds.cycleTabNext.primary),
      interact: formatBindableKeyLabel(keybinds.interact.primary),
      confirm: formatBindableKeyLabel(keybinds.confirmAction.primary),
      rotatePlacement: formatBindableKeyLabel(keybinds.rotatePlacement.primary),
      cancel: formatBindableKeyLabel(keybinds.cancelAction.primary),
    }),
    [keybinds],
  );
}
