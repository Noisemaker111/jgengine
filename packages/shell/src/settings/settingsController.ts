import { useEffect, useReducer } from "react";

import { actionLabel, bindingLabel, type ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { BindingOverrides } from "@jgengine/core/input/bindingOverrides";
import type { AudioBusDef } from "@jgengine/core/audio/audioFalloff";
import {
  busVolumeSettingId,
  DEFAULT_GRAPHICS_QUALITY,
  DEFAULT_GRAPHICS_SHADOWS,
  DEFAULT_MASTER_VOLUME,
  GRAPHICS_QUALITY_OPTIONS,
  SETTING_IDS,
  type GameSettingDef,
  type SettingCategory,
  type SettingOption,
  type SettingValue,
} from "@jgengine/core/settings/settingsModel";
import { useSettingsStore } from "@jgengine/react/settings";

import { usePlayerFov } from "../camera/PlayerFov";

export interface SettingsRow {
  id: string;
  label: string;
  kind: "slider" | "toggle" | "select";
  value: SettingValue;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly SettingOption[];
  format?: (value: number) => string;
  set: (value: SettingValue) => void;
}

export interface KeybindRow {
  action: string;
  label: string;
  bindingLabel: string;
  isDefault: boolean;
  rebind: (code: string) => void;
  reset: () => void;
}

export interface SettingsCategoryView {
  id: SettingCategory;
  label: string;
  rows: SettingsRow[];
  keybinds: KeybindRow[];
}

export interface SettingsController {
  mode: "overlay" | "page";
  categories: SettingsCategoryView[];
}

const CATEGORY_LABELS: Record<SettingCategory, string> = {
  sound: "Sound",
  graphics: "Graphics",
  gameplay: "Gameplay",
  controls: "Controls",
};

const CATEGORY_ORDER: readonly SettingCategory[] = ["sound", "graphics", "gameplay", "controls"];

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export interface SettingsControllerInput {
  mode: "overlay" | "page";
  input: ActionCodesMap;
  buses: Record<string, AudioBusDef> | undefined;
  extra: readonly GameSettingDef[];
  hide: readonly SettingCategory[];
  fovEnabled: boolean;
  overrides: BindingOverrides;
  rebind: (action: string, code: string) => void;
  resetBinding: (action: string) => void;
}

export function useSettingsController(config: SettingsControllerInput): SettingsController {
  const store = useSettingsStore();
  const fov = usePlayerFov();
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => store.subscribe(() => force()), [store]);

  const hidden = new Set(config.hide);
  const extrasFor = (category: SettingCategory): SettingsRow[] =>
    config.extra
      .filter((def) => def.category === category)
      .map((def) => ({
        id: def.id,
        label: def.label,
        kind: def.kind,
        value: store.get(def.id, def.default),
        min: def.min,
        max: def.max,
        step: def.step,
        options: def.options,
        set: (value: SettingValue) => store.set(def.id, value),
      }));

  const soundRows: SettingsRow[] = [
    {
      id: SETTING_IDS.masterVolume,
      label: "Master volume",
      kind: "slider",
      value: store.get(SETTING_IDS.masterVolume, DEFAULT_MASTER_VOLUME),
      min: 0,
      max: 1,
      step: 0.01,
      format: percent,
      set: (value) => store.set(SETTING_IDS.masterVolume, value),
    },
    ...Object.values(config.buses ?? {}).map((bus): SettingsRow => {
      const id = busVolumeSettingId(bus.id);
      return {
        id,
        label: `${bus.id.charAt(0).toUpperCase()}${bus.id.slice(1)} volume`,
        kind: "slider",
        value: store.get(id, bus.gain ?? 1),
        min: 0,
        max: 1,
        step: 0.01,
        format: percent,
        set: (value) => store.set(id, value),
      };
    }),
    ...extrasFor("sound"),
  ];

  const graphicsRows: SettingsRow[] = [
    {
      id: SETTING_IDS.graphicsQuality,
      label: "Quality",
      kind: "select",
      value: store.get(SETTING_IDS.graphicsQuality, DEFAULT_GRAPHICS_QUALITY),
      options: GRAPHICS_QUALITY_OPTIONS,
      set: (value) => store.set(SETTING_IDS.graphicsQuality, value),
    },
    {
      id: SETTING_IDS.graphicsShadows,
      label: "Shadows",
      kind: "toggle",
      value: store.get(SETTING_IDS.graphicsShadows, DEFAULT_GRAPHICS_SHADOWS),
      set: (value) => store.set(SETTING_IDS.graphicsShadows, value),
    },
    ...extrasFor("graphics"),
  ];

  const gameplayRows: SettingsRow[] = [
    ...(config.fovEnabled
      ? [
          {
            id: "gameplay.fov",
            label: "Field of view",
            kind: "slider" as const,
            value: fov.fov,
            min: fov.bounds.min,
            max: fov.bounds.max,
            step: 1,
            format: (value: number) => `${Math.round(value)}`,
            set: (value: SettingValue) => fov.setFov(Number(value)),
          },
        ]
      : []),
    ...extrasFor("gameplay"),
  ];

  const keybinds: KeybindRow[] = Object.keys(config.input).map((action) => {
    const override = config.overrides[action];
    const effective = override === undefined ? config.input : { ...config.input, [action]: override };
    return {
      action,
      label: humanizeAction(action),
      bindingLabel: actionLabel(effective, action) ?? "Unbound",
      isDefault: override === undefined,
      rebind: (code: string) => config.rebind(action, code),
      reset: () => config.resetBinding(action),
    };
  });

  const built: Record<SettingCategory, SettingsCategoryView> = {
    sound: { id: "sound", label: CATEGORY_LABELS.sound, rows: soundRows, keybinds: [] },
    graphics: { id: "graphics", label: CATEGORY_LABELS.graphics, rows: graphicsRows, keybinds: [] },
    gameplay: { id: "gameplay", label: CATEGORY_LABELS.gameplay, rows: gameplayRows, keybinds: [] },
    controls: { id: "controls", label: CATEGORY_LABELS.controls, rows: extrasFor("controls"), keybinds },
  };

  const categories = CATEGORY_ORDER.filter((id) => !hidden.has(id))
    .map((id) => built[id])
    .filter((view) => view.rows.length > 0 || view.keybinds.length > 0);

  return { mode: config.mode, categories };
}

function humanizeAction(action: string): string {
  const spaced = action
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export { bindingLabel };
