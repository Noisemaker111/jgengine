import { useEffect, useMemo, useState } from "react";

import {
  accessibilitySettingRows,
  readAccessibilitySettings,
  readHoldVsToggle,
  type AccessibilitySettingRow,
  type HoldVsToggle,
} from "@jgengine/core/settings/accessibilitySettings";
import type { AccessibilityState } from "@jgengine/core/ui/accessibility";

import { useSettingsStore } from "./settings";

function useSettingsRevision(): number {
  const store = useSettingsStore();
  const [revision, setRevision] = useState(0);
  useEffect(() => store.subscribe(() => setRevision((value) => value + 1)), [store]);
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
  const revision = useSettingsRevision();
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
  const revision = useSettingsRevision();
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
  const revision = useSettingsRevision();
  return useMemo(() => accessibilitySettingRows(store), [store, revision]);
}
