import type {
  AccessibilityState,
  ColorblindMode,
} from "../ui/accessibility";
import { DEFAULT_ACCESSIBILITY, clampTextScale } from "../ui/accessibility";
import type { GameSettingDef, SettingOption, SettingValue, SettingsStore } from "./settingsModel";

/**
 * A "hold or toggle" preference for actions that can be either (aim, sprint, crouch, block). Shared
 * because players expect one setting to cover them all, rather than each game inventing a flag.
 */
export type HoldVsToggle = "hold" | "toggle";

/** The persisted settings ids behind the accessibility section. */
export const ACCESSIBILITY_SETTING_IDS = {
  textScale: "accessibility.textScale",
  colorblind: "accessibility.colorblind",
  reducedMotion: "accessibility.reducedMotion",
  highContrast: "accessibility.highContrast",
  captions: "accessibility.captions",
  holdVsToggle: "controls.holdVsToggle",
} as const;

/** Text-scale choices, as numeric strings the settings store persists. */
export const TEXT_SCALE_OPTIONS: readonly SettingOption[] = [
  { value: "1", label: "100%" },
  { value: "1.15", label: "115%" },
  { value: "1.3", label: "130%" },
  { value: "1.5", label: "150%" },
  { value: "1.75", label: "175%" },
  { value: "2", label: "200%" },
];

/** Colorblind palette choices. `none` keeps the game's own colours. */
export const COLORBLIND_OPTIONS: readonly SettingOption[] = [
  { value: "none", label: "Off" },
  { value: "protanopia", label: "Protanopia" },
  { value: "deuteranopia", label: "Deuteranopia" },
  { value: "tritanopia", label: "Tritanopia" },
  { value: "grayscale", label: "Grayscale" },
];

/** Hold-versus-toggle choices for actions that support both. */
export const HOLD_VS_TOGGLE_OPTIONS: readonly SettingOption[] = [
  { value: "hold", label: "Hold" },
  { value: "toggle", label: "Toggle" },
];

/** Read a stored text scale, clamped to the supported range. */
export function readTextScale(store: SettingsStore): number {
  return clampTextScale(Number(store.get(ACCESSIBILITY_SETTING_IDS.textScale, 1)));
}

/** Read a stored colorblind mode, falling back to `none` for an unknown value. */
export function readColorblind(store: SettingsStore): ColorblindMode {
  const value = String(store.get(ACCESSIBILITY_SETTING_IDS.colorblind, "none"));
  const known = COLORBLIND_OPTIONS.some((option) => option.value === value);
  return known ? (value as ColorblindMode) : "none";
}

/** Read the hold-or-toggle preference, falling back to `hold`. */
export function readHoldVsToggle(store: SettingsStore): HoldVsToggle {
  const value: string = String(store.get(ACCESSIBILITY_SETTING_IDS.holdVsToggle, "hold"));
  return value === "toggle" ? "toggle" : "hold";
}

/**
 * Read the whole accessibility state the presentation needs (reduced motion, high contrast, text
 * scale, colorblind mode, captions) plus the hold/toggle preference, from the shared settings store.
 *
 * @capability accessibility-settings read accessibility preferences and the hold-vs-toggle choice from the shared settings store
 */
export function readAccessibilitySettings(store: SettingsStore): {
  state: AccessibilityState;
  holdVsToggle: HoldVsToggle;
} {
  return {
    state: {
      reducedMotion: Boolean(store.get(ACCESSIBILITY_SETTING_IDS.reducedMotion, DEFAULT_ACCESSIBILITY.reducedMotion)),
      highContrast: Boolean(store.get(ACCESSIBILITY_SETTING_IDS.highContrast, DEFAULT_ACCESSIBILITY.highContrast)),
      textScale: readTextScale(store),
      colorblind: readColorblind(store),
      captions: Boolean(store.get(ACCESSIBILITY_SETTING_IDS.captions, DEFAULT_ACCESSIBILITY.captions)),
    },
    holdVsToggle: readHoldVsToggle(store),
  };
}

/** One accessibility setting as the shared settings menu renders it. */
export interface AccessibilitySettingRow {
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
  /** When this row drives presentation, the accessibility state key it maps to. */
  affects?: keyof AccessibilityState;
}

/**
 * The accessibility rows, wired to the settings store: text scale, colorblind palette, reduced
 * motion, high contrast, captions and hold-vs-toggle. The shell adds them as its `accessibility`
 * category and any game can render them inside its own settings layout.
 *
 * @capability accessibility-settings-rows accessibility setting rows (text scale, colorblind, reduced motion, high contrast, captions, hold-vs-toggle) backed by the shared settings store
 */
export function accessibilitySettingRows(store: SettingsStore): AccessibilitySettingRow[] {
  return [
    {
      id: ACCESSIBILITY_SETTING_IDS.textScale,
      label: "Text size",
      kind: "select",
      value: String(readTextScale(store)),
      options: TEXT_SCALE_OPTIONS,
      set: (value) => store.set(ACCESSIBILITY_SETTING_IDS.textScale, Number(value)),
      affects: "textScale",
    },
    {
      id: ACCESSIBILITY_SETTING_IDS.colorblind,
      label: "Colourblind palette",
      kind: "select",
      value: readColorblind(store),
      options: COLORBLIND_OPTIONS,
      set: (value) => store.set(ACCESSIBILITY_SETTING_IDS.colorblind, String(value)),
      affects: "colorblind",
    },
    {
      id: ACCESSIBILITY_SETTING_IDS.reducedMotion,
      label: "Reduce motion",
      kind: "toggle",
      value: Boolean(store.get(ACCESSIBILITY_SETTING_IDS.reducedMotion, DEFAULT_ACCESSIBILITY.reducedMotion)),
      set: (value) => store.set(ACCESSIBILITY_SETTING_IDS.reducedMotion, Boolean(value)),
      affects: "reducedMotion",
    },
    {
      id: ACCESSIBILITY_SETTING_IDS.highContrast,
      label: "High contrast",
      kind: "toggle",
      value: Boolean(store.get(ACCESSIBILITY_SETTING_IDS.highContrast, DEFAULT_ACCESSIBILITY.highContrast)),
      set: (value) => store.set(ACCESSIBILITY_SETTING_IDS.highContrast, Boolean(value)),
      affects: "highContrast",
    },
    {
      id: ACCESSIBILITY_SETTING_IDS.captions,
      label: "Captions",
      kind: "toggle",
      value: Boolean(store.get(ACCESSIBILITY_SETTING_IDS.captions, DEFAULT_ACCESSIBILITY.captions)),
      set: (value) => store.set(ACCESSIBILITY_SETTING_IDS.captions, Boolean(value)),
      affects: "captions",
    },
    {
      id: ACCESSIBILITY_SETTING_IDS.holdVsToggle,
      label: "Hold or toggle aim",
      kind: "select",
      value: readHoldVsToggle(store),
      options: HOLD_VS_TOGGLE_OPTIONS,
      set: (value) => store.set(ACCESSIBILITY_SETTING_IDS.holdVsToggle, String(value)),
    },
  ];
}

/**
 * Declarative form of the accessibility rows for `defineGame({ settings })`, for a game that wants
 * them inside its own setting categories rather than the built-in `accessibility` one.
 */
export function accessibilitySettingDefs(category = "accessibility"): GameSettingDef[] {
  return [
    { id: ACCESSIBILITY_SETTING_IDS.textScale, label: "Text size", category, kind: "select", default: "1", options: TEXT_SCALE_OPTIONS },
    { id: ACCESSIBILITY_SETTING_IDS.colorblind, label: "Colourblind palette", category, kind: "select", default: "none", options: COLORBLIND_OPTIONS },
    { id: ACCESSIBILITY_SETTING_IDS.reducedMotion, label: "Reduce motion", category, kind: "toggle", default: false },
    { id: ACCESSIBILITY_SETTING_IDS.highContrast, label: "High contrast", category, kind: "toggle", default: false },
    { id: ACCESSIBILITY_SETTING_IDS.captions, label: "Captions", category, kind: "toggle", default: false },
    { id: ACCESSIBILITY_SETTING_IDS.holdVsToggle, label: "Hold or toggle aim", category: "controls", kind: "select", default: "hold", options: HOLD_VS_TOGGLE_OPTIONS },
  ];
}

/** One frame of an action's raw input. */
export interface HoldToggleInput {
  /** The action's key/button went down this frame (the edge). */
  pressed: boolean;
  /** The action's key/button is down. */
  held: boolean;
}

/**
 * The action's active state for one frame under a {@link HoldVsToggle} preference: `hold` follows the
 * button, `toggle` latches on each press edge. Call with the previous result so toggle mode can flip
 * without the caller keeping a second flag.
 *
 * @capability hold-vs-toggle resolve one action frame under a hold-or-toggle preference
 */
export function holdToggleActive(previous: boolean, input: HoldToggleInput, mode: HoldVsToggle): boolean {
  if (mode === "hold") return input.held;
  return input.pressed ? !previous : previous;
}
