import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { suspendPlayControls } from "@jgengine/core/game/controlGate";

import type { SettingsSurface, SettingsVariant } from "@jgengine/core/settings/settingsModel";
import {
  SettingsControllerProvider,
  useSettings,
  type SettingsActionView,
  type SettingsController,
} from "@jgengine/react/settings";

import { createPlaySurfaceFocusOwnership } from "../presentationRecovery";

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
  const anchor = useRef<HTMLSpanElement | null>(null);
  const openedSurface = useRef<{ owner: GameContext; surface: HTMLElement | null } | null>(null);
  const focus = useRef(createPlaySurfaceFocusOwnership<GameContext>());
  useLayoutEffect(() => {
    if (isOpen) {
      openedSurface.current = { owner: ctx, surface: anchor.current?.closest<HTMLElement>('div[tabindex="0"]') ?? null };
      return;
    }
    const previous = openedSurface.current;
    openedSurface.current = null;
    if (previous?.owner !== ctx) return;
    focus.current.request(ctx);
    focus.current.reveal(ctx, previous.surface, document.activeElement, document.body);
  }, [ctx, isOpen]);
  useLayoutEffect(() => {
    if (!isOpen) return;
    return suspendPlayControls(ctx);
  }, [ctx, isOpen]);
  return <span hidden ref={anchor} />;
}
