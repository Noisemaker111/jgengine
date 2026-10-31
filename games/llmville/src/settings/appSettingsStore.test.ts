import { describe, expect, test } from "bun:test";

import { bindingOverridesStorageKey } from "@jgengine/core/input/bindingOverrides";
import { settingStorageKey, SETTING_IDS } from "@jgengine/core/settings/settingsModel";

import { createAppSettingsStore, DEFAULT_APP_SETTINGS, LEGACY_APP_SETTINGS_KEY, LLMVILLE_SETTINGS_GAME_ID } from "./appSettingsStore";
import { DEFAULT_APP_KEYBINDS } from "./keybinds";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("app settings store", () => {
  test("moves a legacy settings blob onto the engine settings cells and binding overrides", () => {
    const storage = memoryStorage({
      [LEGACY_APP_SETTINGS_KEY]: JSON.stringify({
        reducedMotion: true,
        graphicsQuality: "performance",
        keybinds: { jump: { primary: "KeyQ", secondary: "Enter" }, sprint: { primary: "NotAKey", secondary: null } },
      }),
    });

    const settings = createAppSettingsStore(storage).get();

    expect(settings.reducedMotion).toBe(true);
    expect(settings.graphicsQuality).toBe("performance");
    expect(settings.keybinds.jump).toEqual({ primary: "KeyQ", secondary: "Enter" });
    expect(settings.keybinds.sprint).toEqual(DEFAULT_APP_KEYBINDS.sprint);
    expect(storage.getItem(LEGACY_APP_SETTINGS_KEY)).toBeNull();
    expect(storage.getItem(settingStorageKey(SETTING_IDS.graphicsQuality))).toBe(JSON.stringify("low"));
    expect(JSON.parse(storage.getItem(bindingOverridesStorageKey(LLMVILLE_SETTINGS_GAME_ID)) ?? "{}")).toEqual({
      jump: ["KeyQ", "Enter"],
    });

    expect(createAppSettingsStore(storage).get()).toEqual(settings);
  });

  test("starts from defaults and persists updates", () => {
    const storage = memoryStorage();
    const store = createAppSettingsStore(storage);
    expect(store.get()).toEqual(DEFAULT_APP_SETTINGS);

    let notified = 0;
    store.subscribe(() => (notified += 1));
    store.update({ graphicsQuality: "high", keybinds: { ...DEFAULT_APP_KEYBINDS, interact: { primary: "KeyR", secondary: null } } });
    expect(notified).toBe(1);

    const reopened = createAppSettingsStore(storage).get();
    expect(reopened.graphicsQuality).toBe("high");
    expect(reopened.keybinds.interact).toEqual({ primary: "KeyR", secondary: null });

    store.update({ keybinds: DEFAULT_APP_KEYBINDS });
    expect(storage.getItem(bindingOverridesStorageKey(LLMVILLE_SETTINGS_GAME_ID))).toBeNull();
  });

  test("an unreadable legacy blob resets to defaults", () => {
    const storage = memoryStorage({ [LEGACY_APP_SETTINGS_KEY]: "{oops" });
    expect(createAppSettingsStore(storage).get()).toEqual(DEFAULT_APP_SETTINGS);
    expect(storage.getItem(LEGACY_APP_SETTINGS_KEY)).toBeNull();
  });
});
