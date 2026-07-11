import { useState } from "react";

import type { AudioBusDef } from "@jgengine/core/audio/audioFalloff";
import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { BindingOverrides } from "@jgengine/core/input/bindingOverrides";
import type { GameSettingsConfig } from "@jgengine/core/settings/settingsModel";

import { QuickControls } from "./QuickControls";
import { SettingsButton } from "./SettingsButton";
import { SettingsMenu } from "./SettingsMenu";
import { useSettingsController } from "./settingsController";

export interface GameSettingsProps {
  input: ActionCodesMap;
  buses: Record<string, AudioBusDef> | undefined;
  config: GameSettingsConfig;
  fovEnabled: boolean;
  overrides: BindingOverrides;
  rebind: (action: string, code: string) => void;
  resetBinding: (action: string) => void;
}

export function GameSettings({ input, buses, config, fovEnabled, overrides, rebind, resetBinding }: GameSettingsProps) {
  const [open, setOpen] = useState(false);
  const controller = useSettingsController({
    mode: config.mode ?? "overlay",
    input,
    buses,
    extra: config.extra ?? [],
    hide: config.hide ?? [],
    fovEnabled,
    overrides,
    rebind,
    resetBinding,
  });

  if (controller.categories.length === 0) return null;
  if (config.surface === "quick") return <QuickControls controller={controller} />;

  return (
    <>
      <SettingsButton onOpen={() => setOpen(true)} />
      {open ? <SettingsMenu controller={controller} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
