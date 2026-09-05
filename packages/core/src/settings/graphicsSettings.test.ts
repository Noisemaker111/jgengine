import { describe, expect, test } from "bun:test";

import { DEFAULT_GRAPHICS_PROFILES } from "./graphicsProfile";
import {
  applyGraphicsQuality,
  graphicsPostStageSettingId,
  readGraphicsQuality,
  readGraphicsSettings,
  RENDER_SCALE_MAX,
} from "./graphicsSettings";
import { createSettingsStore, SETTING_IDS } from "./settingsModel";

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("graphicsSettings", () => {
  test("empty store resolves to the default tier profile", () => {
    const store = createSettingsStore(memStorage());
    const state = readGraphicsSettings(store);
    expect(state.quality).toBe("high");
    expect(state.profile).toEqual(DEFAULT_GRAPHICS_PROFILES.high);
  });

  test("unknown stored quality falls back to the default", () => {
    const store = createSettingsStore(memStorage());
    store.set(SETTING_IDS.graphicsQuality, "ultra");
    expect(readGraphicsQuality(store)).toBe("high");
  });

  test("stored stage toggles and render scale override the tier", () => {
    const store = createSettingsStore(memStorage());
    store.set(SETTING_IDS.graphicsQuality, "medium");
    store.set(graphicsPostStageSettingId("ao"), false);
    store.set(SETTING_IDS.graphicsRenderScale, 0.75);
    const state = readGraphicsSettings(store);
    expect(state.profile.postStages).toEqual({ ao: false, bloom: true, dof: true, smaa: true });
    expect(state.profile.renderScale).toBe(0.75);
    expect(state.profile.shadowMapSize).toBe(1024);
  });

  test("render scale is clamped to the slider bounds", () => {
    const store = createSettingsStore(memStorage());
    store.set(SETTING_IDS.graphicsRenderScale, 9);
    expect(readGraphicsSettings(store).profile.renderScale).toBe(RENDER_SCALE_MAX);
  });

  test("game overrides feed the tier defaults", () => {
    const store = createSettingsStore(memStorage());
    store.set(SETTING_IDS.graphicsQuality, "low");
    const state = readGraphicsSettings(store, { low: { renderScale: 0.8, postStages: { bloom: false } } });
    expect(state.profile.renderScale).toBe(0.8);
    expect(state.profile.postStages.bloom).toBe(false);
  });

  test("applying a tier resets stage and render-scale overrides", () => {
    const store = createSettingsStore(memStorage());
    store.set(graphicsPostStageSettingId("dof"), false);
    store.set(SETTING_IDS.graphicsRenderScale, 0.5);
    applyGraphicsQuality(store, "low");
    const state = readGraphicsSettings(store);
    expect(state.quality).toBe("low");
    expect(state.profile).toEqual(DEFAULT_GRAPHICS_PROFILES.low);
    expect(store.get(graphicsPostStageSettingId("dof"), true)).toBe(false);
  });
});
