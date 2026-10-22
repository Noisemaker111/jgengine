import { describe, expect, test } from "bun:test";

import {
  ACCESSIBILITY_SETTING_IDS,
  accessibilitySettingRows,
  holdToggleActive,
  readAccessibilitySettings,
} from "@jgengine/core/settings/accessibilitySettings";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("readAccessibilitySettings", () => {
  test("defaults to no assistance and hold", () => {
    const store = createSettingsStore(memoryStorage());
    const read = readAccessibilitySettings(store);
    expect(read.state).toEqual({
      reducedMotion: false,
      highContrast: false,
      textScale: 1,
      colorblind: "none",
      captions: false,
    });
    expect(read.holdVsToggle).toBe("hold");
  });

  test("reads persisted values, clamps text scale and rejects unknown palettes", () => {
    const store = createSettingsStore(memoryStorage());
    store.set(ACCESSIBILITY_SETTING_IDS.textScale, 9);
    store.set(ACCESSIBILITY_SETTING_IDS.colorblind, "sepia");
    store.set(ACCESSIBILITY_SETTING_IDS.reducedMotion, true);
    store.set(ACCESSIBILITY_SETTING_IDS.holdVsToggle, "toggle");
    const read = readAccessibilitySettings(store);
    expect(read.state.textScale).toBe(2);
    expect(read.state.colorblind).toBe("none");
    expect(read.state.reducedMotion).toBe(true);
    expect(read.holdVsToggle).toBe("toggle");
  });
});

describe("accessibilitySettingRows", () => {
  test("exposes every C3.1 accessibility control, wired to the store", () => {
    const store = createSettingsStore(memoryStorage());
    const rows = accessibilitySettingRows(store);
    expect(rows.map((row) => row.id)).toEqual([
      ACCESSIBILITY_SETTING_IDS.textScale,
      ACCESSIBILITY_SETTING_IDS.colorblind,
      ACCESSIBILITY_SETTING_IDS.reducedMotion,
      ACCESSIBILITY_SETTING_IDS.highContrast,
      ACCESSIBILITY_SETTING_IDS.captions,
      ACCESSIBILITY_SETTING_IDS.holdVsToggle,
    ]);
    rows.find((row) => row.id === ACCESSIBILITY_SETTING_IDS.textScale)!.set("1.5");
    rows.find((row) => row.id === ACCESSIBILITY_SETTING_IDS.reducedMotion)!.set(true);
    expect(store.get(ACCESSIBILITY_SETTING_IDS.textScale, 1)).toBe(1.5);
    expect(store.get(ACCESSIBILITY_SETTING_IDS.reducedMotion, false)).toBe(true);
    expect(readAccessibilitySettings(store).state.textScale).toBe(1.5);
  });
});

describe("holdToggleActive", () => {
  test("hold follows the button", () => {
    expect(holdToggleActive(false, { pressed: true, held: true }, "hold")).toBe(true);
    expect(holdToggleActive(true, { pressed: false, held: false }, "hold")).toBe(false);
  });

  test("toggle latches on each press edge and holds between presses", () => {
    let active = false;
    active = holdToggleActive(active, { pressed: true, held: true }, "toggle");
    expect(active).toBe(true);
    active = holdToggleActive(active, { pressed: false, held: false }, "toggle");
    expect(active).toBe(true);
    active = holdToggleActive(active, { pressed: true, held: true }, "toggle");
    expect(active).toBe(false);
  });
});
