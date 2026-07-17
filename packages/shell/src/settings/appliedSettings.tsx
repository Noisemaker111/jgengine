import { useEffect, useReducer } from "react";

import type { AudioBusDef } from "@jgengine/core/audio/audioFalloff";
import {
  busVolumeSettingId,
  DEFAULT_GRAPHICS_QUALITY,
  DEFAULT_MASTER_VOLUME,
  DEFAULT_UI_SCALE,
  GRAPHICS_QUALITY_DPR,
  SETTING_IDS,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  type GraphicsQuality,
  type SettingsStore,
} from "@jgengine/core/settings/settingsModel";

import { TOUCH_STYLES, type TouchStyle } from "@jgengine/core/input/touchScheme";

import type { AudioEngine } from "../audio/audioEngine";

/** Sentinel Controls value meaning "defer to the game's suggested touch skin". */
export const TOUCH_STYLE_AUTO = "auto";

/** Shell-internal: binds the SettingsStore touch-style choice to the touch renderer. @internal */
export function useTouchStyle(store: SettingsStore, fallback: TouchStyle): TouchStyle {
  useSettingsRevision(store);
  const raw = store.get(SETTING_IDS.touchStyle, TOUCH_STYLE_AUTO);
  return TOUCH_STYLES.includes(raw as TouchStyle) ? (raw as TouchStyle) : fallback;
}

export function useSettingsRevision(store: SettingsStore): number {
  const [rev, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => store.subscribe(() => bump()), [store]);
  return rev;
}

export function useGraphicsSettings(
  store: SettingsStore,
  shadowsDefault: boolean,
): { shadows: boolean; dpr: number; uiScale: number; quality: GraphicsQuality } {
  useSettingsRevision(store);
  const rawQuality = store.get(SETTING_IDS.graphicsQuality, DEFAULT_GRAPHICS_QUALITY) as GraphicsQuality;
  const quality: GraphicsQuality = GRAPHICS_QUALITY_DPR[rawQuality] !== undefined ? rawQuality : "high";
  const rawUiScale = store.get(SETTING_IDS.graphicsUiScale, DEFAULT_UI_SCALE);
  return {
    shadows: store.get(SETTING_IDS.graphicsShadows, shadowsDefault),
    dpr: GRAPHICS_QUALITY_DPR[quality],
    uiScale: Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, rawUiScale)),
    quality,
  };
}

export function AudioSettingsBridge({
  store,
  engine,
  buses,
}: {
  store: SettingsStore;
  engine: AudioEngine;
  buses: Record<string, AudioBusDef> | undefined;
}): null {
  const rev = useSettingsRevision(store);
  useEffect(() => {
    engine.setMasterGain(store.get(SETTING_IDS.masterVolume, DEFAULT_MASTER_VOLUME));
    for (const bus of Object.values(buses ?? {})) {
      engine.setBusGain(bus.id, store.get(busVolumeSettingId(bus.id), bus.gain ?? 1));
    }
  }, [store, engine, buses, rev]);
  return null;
}
