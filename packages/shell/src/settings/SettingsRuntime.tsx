import { useMemo, useState, type ReactNode } from "react";

import type { SettingsSurface } from "@jgengine/core/settings/settingsModel";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/react/settings";

import { useSettingsCategories, type SettingsControllerInput } from "./settingsController";

export interface SettingsRuntimeProps extends SettingsControllerInput {
  mode: "overlay" | "page";
  surface: SettingsSurface | false;
  children: ReactNode;
}

export function SettingsRuntime({ mode, surface, children, ...input }: SettingsRuntimeProps) {
  const categories = useSettingsCategories(input);
  const [isOpen, setOpen] = useState(false);
  const controller = useMemo<SettingsController>(
    () => ({
      categories,
      mode,
      surface,
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      setOpen,
    }),
    [categories, mode, surface, isOpen],
  );
  return <SettingsControllerProvider controller={controller}>{children}</SettingsControllerProvider>;
}
