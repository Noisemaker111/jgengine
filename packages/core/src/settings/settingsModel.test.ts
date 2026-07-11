import { describe, expect, test } from "bun:test";

import {
  busVolumeSettingId,
  createSettingsStore,
  loadSettingValue,
  saveSettingValue,
  SETTING_IDS,
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
  test("persists and coerces by fallback type", () => {
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
});
