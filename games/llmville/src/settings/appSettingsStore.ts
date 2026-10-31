import type { KeyValueStorage } from "@jgengine/core/game/keyValueStore";
import {
  clearAllBindingOverrides,
  clearBindingOverride,
  loadBindingOverrides,
  saveBindingOverride,
} from "@jgengine/core/input/bindingOverrides";
import { ACCESSIBILITY_SETTING_IDS } from "@jgengine/core/settings/accessibilitySettings";
import { createSettingsStore, SETTING_IDS, type GraphicsQuality } from "@jgengine/core/settings/settingsModel";

import {
  DEFAULT_APP_KEYBINDS,
  KEYBIND_ACTIONS,
  keybindFromCodes,
  keybindsEqual,
  keybindToCodes,
  sanitizeKeybinds,
  type AppKeybinds,
} from "./keybinds";

/** The game id the engine keys this game's binding overrides under. */
export const LLMVILLE_SETTINGS_GAME_ID = "llmville";

/** The single JSON blob settings lived in before they moved onto the engine settings store. */
export const LEGACY_APP_SETTINGS_KEY = "llmville:app-settings";

export const GRAPHICS_PRESET_OPTIONS = [
  {
    id: "performance",
    label: "Performance",
    description: "Keep effects lighter for smoother menus and gameplay.",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Use the default mix of clarity and visual polish.",
  },
  {
    id: "high",
    label: "High",
    description: "Favor richer presentation on stronger hardware.",
  },
] as const;

export type GraphicsPreset = (typeof GRAPHICS_PRESET_OPTIONS)[number]["id"];

export interface AppSettings {
  reducedMotion: boolean;
  graphicsQuality: GraphicsPreset;
  keybinds: AppKeybinds;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  reducedMotion: false,
  graphicsQuality: "balanced",
  keybinds: DEFAULT_APP_KEYBINDS,
};

const PRESET_QUALITY: Record<GraphicsPreset, GraphicsQuality> = {
  performance: "low",
  balanced: "medium",
  high: "high",
};

export function isGraphicsQuality(value: string): value is GraphicsPreset {
  return GRAPHICS_PRESET_OPTIONS.some((option) => option.id === value);
}

function presetForQuality(quality: string): GraphicsPreset {
  if (quality === "low") return "performance";
  if (quality === "high" || quality === "ultra") return "high";
  return "balanced";
}

/** Reads the legacy blob the way the old settings module did: anything unreadable falls back to defaults. */
function parseLegacyAppSettings(raw: string): AppSettings {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_APP_SETTINGS;
    return {
      reducedMotion: "reducedMotion" in parsed && parsed.reducedMotion === true,
      graphicsQuality:
        "graphicsQuality" in parsed && typeof parsed.graphicsQuality === "string" && isGraphicsQuality(parsed.graphicsQuality)
          ? parsed.graphicsQuality
          : DEFAULT_APP_SETTINGS.graphicsQuality,
      keybinds: "keybinds" in parsed ? sanitizeKeybinds(parsed.keybinds) : DEFAULT_APP_KEYBINDS,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

/** LLMville's settings over the engine settings store and binding overrides, on one injected storage. */
export interface AppSettingsStore {
  get(): AppSettings;
  update(partial: Partial<AppSettings>): AppSettings;
  subscribe(listener: () => void): () => void;
  snapshot(): AppSettings;
  restore(settings: AppSettings): void;
  reset(): void;
}

/**
 * Builds the store and moves a legacy `llmville:app-settings` blob onto the engine cells once:
 * values are written through the engine store, keybinds that differ from the defaults become
 * binding overrides, and the old key is removed.
 */
export function createAppSettingsStore(storage: KeyValueStorage | null): AppSettingsStore {
  const settings = createSettingsStore(storage);
  const listeners = new Set<() => void>();

  const readKeybinds = (): AppKeybinds => {
    const overrides = loadBindingOverrides(LLMVILLE_SETTINGS_GAME_ID, storage);
    const keybinds: AppKeybinds = { ...DEFAULT_APP_KEYBINDS };
    for (const { id } of KEYBIND_ACTIONS) {
      const codes = overrides[id];
      if (codes !== undefined) keybinds[id] = keybindFromCodes(codes, DEFAULT_APP_KEYBINDS[id]);
    }
    return keybinds;
  };

  const writeKeybinds = (keybinds: AppKeybinds): void => {
    for (const { id } of KEYBIND_ACTIONS) {
      const keybind = keybinds[id];
      if (keybindsEqual(keybind, DEFAULT_APP_KEYBINDS[id])) clearBindingOverride(LLMVILLE_SETTINGS_GAME_ID, id, storage);
      else saveBindingOverride(LLMVILLE_SETTINGS_GAME_ID, id, keybindToCodes(keybind), storage);
    }
  };

  const read = (): AppSettings => ({
    reducedMotion: settings.get(ACCESSIBILITY_SETTING_IDS.reducedMotion, DEFAULT_APP_SETTINGS.reducedMotion),
    graphicsQuality: presetForQuality(
      settings.get<string>(SETTING_IDS.graphicsQuality, PRESET_QUALITY[DEFAULT_APP_SETTINGS.graphicsQuality]),
    ),
    keybinds: readKeybinds(),
  });

  const write = (next: AppSettings, previous: AppSettings | null): void => {
    settings.set(ACCESSIBILITY_SETTING_IDS.reducedMotion, next.reducedMotion);
    settings.set(SETTING_IDS.graphicsQuality, PRESET_QUALITY[next.graphicsQuality]);
    if (previous === null || previous.keybinds !== next.keybinds) writeKeybinds(next.keybinds);
  };

  const legacy = readLegacy(storage);
  if (legacy !== null) {
    write(parseLegacyAppSettings(legacy), null);
    removeLegacy(storage);
  }

  let current = safeRead(read);

  const commit = (next: AppSettings): AppSettings => {
    write(next, current);
    current = next;
    listeners.forEach((listener) => listener());
    return current;
  };

  return {
    get: () => current,
    update: (partial) => commit({ ...current, ...partial }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    restore: (next) => {
      commit(next);
    },
    reset: () => {
      clearAllBindingOverrides(LLMVILLE_SETTINGS_GAME_ID, storage);
      commit(DEFAULT_APP_SETTINGS);
    },
  };
}

function safeRead(read: () => AppSettings): AppSettings {
  try {
    return read();
  } catch {
    // A stored value of the wrong type is low-value UI state; start from defaults.
    return DEFAULT_APP_SETTINGS;
  }
}

function readLegacy(storage: KeyValueStorage | null): string | null {
  try {
    return storage?.getItem(LEGACY_APP_SETTINGS_KEY) ?? null;
  } catch {
    return null;
  }
}

function removeLegacy(storage: KeyValueStorage | null): void {
  try {
    storage?.removeItem(LEGACY_APP_SETTINGS_KEY);
  } catch {
    // Private mode or quota: the migration reruns harmlessly next boot.
  }
}
