import { useState } from "react";

import type { SettingsVariant } from "@jgengine/core/settings/settingsModel";
import { SettingsMenu } from "@jgengine/shell/settings/SettingsMenu";
import type {
  SettingsActionView,
  SettingsCategoryView,
  SettingsController,
  SettingsKeybindRow,
  SettingsRow,
} from "@jgengine/react/settings";

const noop = () => undefined;
const percent = (value: number): string => `${Math.round(value * 100)}%`;

function slider(id: string, label: string, value: number, min: number, max: number, step: number, format?: (v: number) => string): SettingsRow {
  return { id, label, kind: "slider", value, min, max, step, format, set: noop };
}

function keybind(action: string, label: string, bindingLabel: string, isDefault: boolean): SettingsKeybindRow {
  return { action, label, bindingLabel, isDefault, rebind: noop, reset: noop };
}

const CATEGORIES: SettingsCategoryView[] = [
  {
    id: "sound",
    label: "Sound",
    rows: [
      slider("sound.master", "Master volume", 0.8, 0, 1, 0.01, percent),
      slider("sound.bus.music", "Music volume", 0.65, 0, 1, 0.01, percent),
      slider("sound.bus.sfx", "Sfx volume", 0.9, 0, 1, 0.01, percent),
    ],
    keybinds: [],
  },
  {
    id: "graphics",
    label: "Graphics",
    rows: [
      {
        id: "graphics.quality",
        label: "Quality",
        kind: "select",
        value: "high",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
        set: noop,
      },
      { id: "graphics.shadows", label: "Shadows", kind: "toggle", value: true, set: noop },
    ],
    keybinds: [],
  },
  {
    id: "gameplay",
    label: "Gameplay",
    rows: [slider("gameplay.fov", "Field of view", 75, 40, 120, 1, (v) => `${Math.round(v)}`)],
    keybinds: [],
  },
  {
    id: "controls",
    label: "Controls",
    rows: [],
    keybinds: [
      keybind("moveLeft", "Move left", "A", true),
      keybind("moveRight", "Move right", "D", true),
      keybind("jump", "Jump", "Space", true),
      keybind("interact", "Interact", "F", false),
      keybind("sprint", "Sprint", "Shift", true),
    ],
  },
];

const ACTIONS: SettingsActionView[] = [
  { id: "restart", label: "Restart run", kind: "danger", description: "Start this run over from the top.", run: noop },
  { id: "quit", label: "Quit to menu", kind: "default", description: "Leave the run and return to the title.", run: noop },
];

export function SettingsPreview({ variant, initialTab }: { variant: SettingsVariant; initialTab?: string }) {
  const [controller] = useState<SettingsController>(() => ({
    categories: CATEGORIES,
    actions: ACTIONS,
    variant,
    surface: false,
    isOpen: true,
    open: noop,
    close: noop,
    setOpen: noop,
  }));
  return (
    <div
      data-ui-preview-ready
      className="relative h-full w-full overflow-hidden"
      style={{ background: "radial-gradient(120% 90% at 50% 0%, #223047 0%, #0c0f18 55%, #05060b 100%)" }}
    >
      <div className="absolute inset-0 flex items-center justify-center text-6xl font-black tracking-tight text-white/5">
        {variant.toUpperCase()}
      </div>
      <SettingsMenu controller={controller} onClose={noop} initialTab={initialTab} />
    </div>
  );
}
