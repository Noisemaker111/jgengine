import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { defaultKeyValueStorage } from "@jgengine/core/game/keyValueStore";

import {
  DEFAULT_APP_SETTINGS,
  createAppSettingsStore,
  type AppSettings,
  type AppSettingsStore,
  type GraphicsPreset,
} from "./appSettingsStore";
import {
  DEFAULT_APP_KEYBINDS,
  formatBindableKeyLabel,
  normalizeKeyboardEventCode,
  type BindableKey,
  type KeybindActionId,
  type KeybindSlot,
} from "./keybinds";

export type SettingsTabId = "general" | "video" | "sound" | "keybinds" | "credits";

export const SETTINGS_TAB_ID = {
  general: "general",
  video: "video",
  sound: "sound",
  keybinds: "keybinds",
  credits: "credits",
} as const satisfies Record<string, SettingsTabId>;

export const SETTINGS_TABS: readonly { id: SettingsTabId; label: string }[] = [
  { id: SETTINGS_TAB_ID.general, label: "General" },
  { id: SETTINGS_TAB_ID.video, label: "Video" },
  { id: SETTINGS_TAB_ID.sound, label: "Sound" },
  { id: SETTINGS_TAB_ID.keybinds, label: "Keybinds" },
  { id: SETTINGS_TAB_ID.credits, label: "Credits" },
] as const;

export function isSettingsTabId(value: unknown): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export interface HomeRouteSearch {
  settings?: boolean | undefined;
  tab?: SettingsTabId | undefined;
}

export function parseHomeRouteSearch(raw: Record<string, unknown>): HomeRouteSearch {
  return {
    settings: raw["settings"] === true ? true : undefined,
    tab: isSettingsTabId(raw["tab"]) ? raw["tab"] : undefined,
  };
}

let appSettings: AppSettingsStore | null = null;

function appSettingsStore(): AppSettingsStore {
  if (appSettings === null) {
    appSettings = createAppSettingsStore(defaultKeyValueStorage());
    applySettingsToDocument(appSettings.get());
  }
  return appSettings;
}

function applySettingsToDocument(settings: AppSettings) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset["reducedMotion"] = settings.reducedMotion ? "true" : "false";
  document.documentElement.dataset["graphicsQuality"] = settings.graphicsQuality;
}

export function subscribeToAppSettings(listener: () => void) {
  return appSettingsStore().subscribe(listener);
}

export function getAppSettingsSnapshot(): AppSettings {
  return appSettingsStore().get();
}

export function updateAppSettings(partial: Partial<AppSettings>) {
  applySettingsToDocument(appSettingsStore().update(partial));
}

export function useAppSettings() {
  const settings = useSyncExternalStore(subscribeToAppSettings, getAppSettingsSnapshot, () => DEFAULT_APP_SETTINGS);

  useEffect(() => {
    applySettingsToDocument(settings);
  }, [settings]);

  return {
    ...settings,
    setReducedMotion: (reducedMotion: boolean) => updateAppSettings({ reducedMotion }),
    setGraphicsQuality: (graphicsQuality: GraphicsPreset) => updateAppSettings({ graphicsQuality }),
    setKeybind: (actionId: KeybindActionId, slot: KeybindSlot, key: BindableKey | null) =>
      updateAppSettings({
        keybinds: {
          ...settings.keybinds,
          [actionId]: {
            ...settings.keybinds[actionId],
            [slot]: key,
          },
        },
      }),
    resetKeybinds: () => updateAppSettings({ keybinds: DEFAULT_APP_KEYBINDS }),
  };
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

export interface EditingKeybind {
  actionId: KeybindActionId;
  slot: KeybindSlot;
}

export function useKeybindEditor(
  setKeybind: (actionId: KeybindActionId, slot: KeybindSlot, key: BindableKey | null) => void,
) {
  const [editing, setEditing] = useState<EditingKeybind | null>(null);

  useEffect(() => {
    if (editing === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setEditing(null);
        return;
      }

      const normalizedCode = normalizeKeyboardEventCode(event);
      if (normalizedCode === null) return;

      setKeybind(editing.actionId, editing.slot, normalizedCode);
      setEditing(null);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [editing, setKeybind]);

  return {
    editing,
    startEditing: setEditing,
    stopEditing: useCallback(() => setEditing(null), []),
  };
}
