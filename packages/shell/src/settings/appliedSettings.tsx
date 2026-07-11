import { useEffect, useReducer } from "react";

import type { AudioBusDef } from "@jgengine/core/audio/audioFalloff";
import {
  busVolumeSettingId,
  DEFAULT_GRAPHICS_QUALITY,
  DEFAULT_MASTER_VOLUME,
  GRAPHICS_QUALITY_DPR,
  SETTING_IDS,
  type GraphicsQuality,
  type SettingsStore,
} from "@jgengine/core/settings/settingsModel";

import type { AudioEngine } from "../audio/audioEngine";

export function useSettingsRevision(store: SettingsStore): number {
  const [rev, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => store.subscribe(() => bump()), [store]);
  return rev;
}

export function useGraphicsSettings(store: SettingsStore, shadowsDefault: boolean): { shadows: boolean; dpr: number } {
  useSettingsRevision(store);
  const quality = store.get(SETTING_IDS.graphicsQuality, DEFAULT_GRAPHICS_QUALITY) as GraphicsQuality;
  return {
    shadows: store.get(SETTING_IDS.graphicsShadows, shadowsDefault),
    dpr: GRAPHICS_QUALITY_DPR[quality] ?? GRAPHICS_QUALITY_DPR.high,
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
