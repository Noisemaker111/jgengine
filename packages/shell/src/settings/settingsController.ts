import { useEffect, useReducer } from "react";

import { actionLabel, bindingLabel, type ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { BindingOverrides } from "@jgengine/core/input/bindingOverrides";
import type { AudioBusDef } from "@jgengine/core/audio/audioFalloff";
import {
  BUILT_IN_SETTING_CATEGORIES,
  busVolumeSettingId,
  DEFAULT_GRAPHICS_QUALITY,
  DEFAULT_GRAPHICS_SHADOWS,
  DEFAULT_MASTER_VOLUME,
  GRAPHICS_QUALITY_OPTIONS,
  SETTING_IDS,
  type GameSettingDef,
  type SettingCategory,
  type SettingCategoryDef,
  type SettingValue,
} from "@jgengine/core/settings/settingsModel";
import {
  useSettingsStore,
  type SettingsActionView,
  type SettingsKeybindRow,
  type SettingsCategoryView,
  type SettingsController,
  type SettingsRow,
} from "@jgengine/react/settings";

import { usePlayerFov } from "../camera/PlayerFov";

export type { SettingsActionView, SettingsKeybindRow, SettingsCategoryView, SettingsController, SettingsRow };

const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  sound: "Sound",
  graphics: "Graphics",
  gameplay: "Gameplay",
  controls: "Controls",
};

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export interface SettingsControllerInput {
  input: ActionCodesMap;
  buses: Record<string, AudioBusDef> | undefined;
  extra: readonly GameSettingDef[];
  categories: readonly SettingCategoryDef[];
  hide: readonly SettingCategory[];
  fovEnabled: boolean;
  hideBindings: readonly string[];
  overrides: BindingOverrides;
  rebind: (action: string, code: string) => void;
  resetBinding: (action: string) => void;
}

export function useSettingsCategories(config: SettingsControllerInput): SettingsCategoryView[] {
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

  const hiddenBindings = new Set(config.hideBindings);
  const keybinds: SettingsKeybindRow[] = Object.keys(config.input)
    .filter((action) => !hiddenBindings.has(action))
    .map((action) => {
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

  const builtInRows: Record<string, SettingsRow[]> = {
    sound: soundRows,
    graphics: graphicsRows,
    gameplay: gameplayRows,
    controls: extrasFor("controls"),
  };
  const builtInKeybinds: Record<string, SettingsKeybindRow[]> = { controls: keybinds };

  const declaredLabels = new Map(config.categories.map((c) => [c.id, c.label]));
  const declaredOrder = new Map(config.categories.map((c, index) => [c.id, c.order ?? 1000 + index]));
  const order: SettingCategory[] = [];
  const push = (id: SettingCategory): void => {
    if (!order.includes(id)) order.push(id);
  };
  for (const id of BUILT_IN_SETTING_CATEGORIES) push(id);
  for (const c of config.categories) push(c.id);
  for (const def of config.extra) push(def.category);

  const views = order
    .filter((id) => !hidden.has(id))
    .map((id): SettingsCategoryView => ({
      id,
      label: declaredLabels.get(id) ?? DEFAULT_CATEGORY_LABELS[id] ?? humanizeAction(id),
      rows: builtInRows[id] ?? extrasFor(id),
      keybinds: builtInKeybinds[id] ?? [],
    }))
    .filter((view) => view.rows.length > 0 || view.keybinds.length > 0);

  views.sort((a, b) => (declaredOrder.get(a.id) ?? indexOrder(order, a.id)) - (declaredOrder.get(b.id) ?? indexOrder(order, b.id)));
  return views;
}

function indexOrder(order: readonly SettingCategory[], id: SettingCategory): number {
  const index = order.indexOf(id);
  return index === -1 ? 999 : index;
}

function humanizeAction(action: string): string {
  const spaced = action
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export { bindingLabel };
