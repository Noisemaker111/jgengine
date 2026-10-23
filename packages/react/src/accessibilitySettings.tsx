import { useEffect, useMemo, useRef, useState } from "react";

import {
  accessibilitySettingRows,
  readAccessibilitySettings,
  readHoldVsToggle,
  type AccessibilitySettingRow,
  type HoldVsToggle,
} from "@jgengine/core/settings/accessibilitySettings";
import type { SettingsStore } from "@jgengine/core/settings/settingsModel";
import type { AccessibilityState } from "@jgengine/core/ui/accessibility";

import { useSettingsStore } from "./settings";

/** Every accessibility value as one comparable string, read with the same fallbacks the hooks use. */
function accessibilitySignature(store: SettingsStore): string {
  const { state, holdVsToggle } = readAccessibilitySettings(store);
  return JSON.stringify([
    state.reducedMotion,
    state.highContrast,
    state.textScale,
    state.colorblind,
    state.captions,
    holdVsToggle,
  ]);
}

/**
 * A counter that changes on every settings write, so the hooks below re-render. React runs this
 * subscription in a passive effect, after the render that showed the old value; a write landing in
 * that window (a saved profile or the demo path seeding settings) would otherwise stay invisible
 * until the player changed something else. Reading the value again on subscribe closes the window.
 */
function useSettingsRevision(store: SettingsStore): number {
  const [revision, setRevision] = useState(0);
  const rendered = useRef("");
  rendered.current = accessibilitySignature(store);
  useEffect(() => {
    const bump = () => setRevision((value) => value + 1);
    const unsubscribe = store.subscribe(bump);
    if (accessibilitySignature(store) !== rendered.current) bump();
    return unsubscribe;
  }, [store]);
  return revision;
}

/**
 * The live accessibility preferences (reduced motion, high contrast, text scale, colorblind mode,
 * captions) from the shared settings store. Re-renders whenever any setting changes, so a root that
 * spreads them onto the HUD updates the moment the player picks a value.
 *
 * @capability use-accessibility-settings live accessibility preferences from the shared settings store
 */
export function useAccessibilitySettings(): AccessibilityState {
  const store = useSettingsStore();
  const revision = useSettingsRevision(store);
  return useMemo(() => readAccessibilitySettings(store).state, [store, revision]);
}

/**
 * The live hold-versus-toggle preference for actions that support both (aim, sprint, crouch).
 * Pair it with `holdToggleActive` (`@jgengine/core/settings/accessibilitySettings`) per frame.
 *
 * @capability use-hold-vs-toggle live hold-or-toggle preference from the shared settings store
 */
export function useHoldVsToggle(): HoldVsToggle {
  const store = useSettingsStore();
  const revision = useSettingsRevision(store);
  return useMemo(() => readHoldVsToggle(store), [store, revision]);
}

/**
 * The accessibility rows backed by the shared settings store, for a settings screen the game lays
 * out itself: map them through `SettingsRowControl` (`@jgengine/react/settingsBlocks`). The shell's
 * stock settings menu shows the same rows as its `accessibility` category.
 *
 * @capability use-accessibility-rows accessibility setting rows for a game-owned settings layout
 */
export function useAccessibilityRows(): AccessibilitySettingRow[] {
  const store = useSettingsStore();
  const revision = useSettingsRevision(store);
  return useMemo(() => accessibilitySettingRows(store), [store, revision]);
}
