import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { suspendPlayControls } from "@jgengine/core/game/controlGate";

import type { SettingsSurface, SettingsVariant } from "@jgengine/core/settings/settingsModel";
import {
  SettingsControllerProvider,
  useSettings,
  type SettingsActionView,
  type SettingsController,
} from "@jgengine/react/settings";

import { useSettingsCategories, type SettingsControllerInput } from "./settingsController";

export interface SettingsRuntimeProps extends SettingsControllerInput {
  variant: SettingsVariant;
  surface: SettingsSurface | false;
  actions: readonly SettingsActionView[];
  children: ReactNode;
}

export function SettingsRuntime({ variant, surface, actions, children, ...input }: SettingsRuntimeProps) {
  const categories = useSettingsCategories(input);
  const [isOpen, setOpen] = useState(false);
  const controller = useMemo<SettingsController>(
    () => ({
      categories,
      actions: [...actions],
      variant,
      surface,
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      setOpen,
    }),
    [categories, actions, variant, surface, isOpen],
  );
  return <SettingsControllerProvider controller={controller}>{children}</SettingsControllerProvider>;
}

/** Owns settings' suspension for this live context, including close, replacement and unmount. @internal */
export function SettingsPlayControlGate({ ctx }: { ctx: GameContext }) {
  const { isOpen } = useSettings();
  useLayoutEffect(() => {
    if (!isOpen) return;
    return suspendPlayControls(ctx);
  }, [ctx, isOpen]);
  return null;
}
