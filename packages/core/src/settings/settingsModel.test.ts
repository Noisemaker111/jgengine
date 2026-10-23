import { describe, expect, test } from "bun:test";

import {
  busVolumeSettingId,
  createSettingsStore,
  loadSettingValue,
  saveSettingValue,
  settingStorageKey,
  SETTING_IDS,
  SettingsTypeError,
} from "./settingsModel";

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("settingsModel", () => {
  test("persists values and reads them back in their own type", () => {
    const storage = memStorage();
    saveSettingValue(SETTING_IDS.masterVolume, 0.4, storage);
    expect(loadSettingValue(SETTING_IDS.masterVolume, 1, storage)).toBe(0.4);
    saveSettingValue(SETTING_IDS.graphicsShadows, false, storage);
    expect(loadSettingValue(SETTING_IDS.graphicsShadows, true, storage)).toBe(false);
    expect(loadSettingValue("missing", "high", storage)).toBe("high");
  });

  test("store reads persisted values and notifies subscribers on set", () => {
    const storage = memStorage();
    saveSettingValue(SETTING_IDS.masterVolume, 0.25, storage);
    const store = createSettingsStore(storage);
    expect(store.get(SETTING_IDS.masterVolume, 1)).toBe(0.25);

    let notified = 0;
    const off = store.subscribe(() => (notified += 1));
    store.set(busVolumeSettingId("music"), 0.7);
    expect(notified).toBe(1);
    expect(store.get(busVolumeSettingId("music"), 1)).toBe(0.7);
    off();
  });

  test("a stored number read through a string fallback is the number, not the fallback", () => {
    const storage = memStorage();
    const store = createSettingsStore(storage);
    store.set(SETTING_IDS.graphicsFrameRateLimit, 60);
    expect(store.get(SETTING_IDS.graphicsFrameRateLimit, "display")).toBe("60");

    expect(loadSettingValue(SETTING_IDS.graphicsFrameRateLimit, "display", storage)).toBe("60");
    expect(createSettingsStore(storage).get(SETTING_IDS.graphicsFrameRateLimit, "display")).toBe("60");
  });

  test("an absent setting still yields the fallback", () => {
    const storage = memStorage();
    const store = createSettingsStore(storage);
    expect(store.get("sound.music", 1)).toBe(1);
    expect(store.get("graphics.quality", "high")).toBe("high");
    expect(store.get("accessibility.captions", false)).toBe(false);
    storage.setItem(settingStorageKey("sound.zzz"), "{not json");
    expect(loadSettingValue("sound.zzz", 0.5, storage)).toBe(0.5);
  });

  test("a correct-typed read is unchanged", () => {
    const storage = memStorage();
    const store = createSettingsStore(storage);
    store.set(SETTING_IDS.masterVolume, 0.35);
    store.set(SETTING_IDS.graphicsShadows, false);
    store.set(SETTING_IDS.graphicsQuality, "ultra");
    expect(store.get(SETTING_IDS.masterVolume, 1)).toBe(0.35);
    expect(store.get(SETTING_IDS.graphicsShadows, true)).toBe(false);
    expect(store.get(SETTING_IDS.graphicsQuality, "high")).toBe("ultra");
    expect(store.get(SETTING_IDS.graphicsShowFps, true)).toBe(true);
  });

  test("a type mismatch fails loudly, naming the key and both types", () => {
    const storage = memStorage();
    const store = createSettingsStore(storage);
    store.set(SETTING_IDS.graphicsShadows, true);

    let caught: unknown;
    try {
      store.get(SETTING_IDS.graphicsShadows, 1);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SettingsTypeError);
    const failure = caught as SettingsTypeError;
    expect(failure.message).toContain(SETTING_IDS.graphicsShadows);
    expect(failure.message).toContain("boolean");
    expect(failure.message).toContain("number");
    expect(failure.settingId).toBe(SETTING_IDS.graphicsShadows);
    expect(failure.storedType).toBe("boolean");
    expect(failure.fallbackType).toBe("number");

    storage.setItem(settingStorageKey(SETTING_IDS.graphicsShadows), JSON.stringify({ on: true }));
    expect(() => loadSettingValue(SETTING_IDS.graphicsShadows, true, storage)).toThrow(
      /"graphics\.shadows" stores object but was read as boolean/,
    );
  });

  test("legacy string spellings of numbers and booleans still read", () => {
    const storage = memStorage();
    storage.setItem(settingStorageKey(SETTING_IDS.masterVolume), '"0.5"');
    storage.setItem(settingStorageKey(SETTING_IDS.graphicsShadows), '"true"');
    expect(loadSettingValue(SETTING_IDS.masterVolume, 1, storage)).toBe(0.5);
    expect(loadSettingValue(SETTING_IDS.graphicsShadows, false, storage)).toBe(true);
  });
});
