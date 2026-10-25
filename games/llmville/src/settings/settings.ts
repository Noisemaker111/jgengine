import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { bindingMatches, normalizeKeyCode, type ActionBinding, type ActionBindingMap } from "@jgengine/core/input/actionBindings";

export const BINDABLE_KEY_OPTIONS = [
  "Tab",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyR",
  "KeyC",
  "Space",
  "Shift",
  "Control",
  "Enter",
  "Escape",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
] as const;

export type BindableKey = (typeof BINDABLE_KEY_OPTIONS)[number];

export const KEYBIND_SLOT = {
  primary: "primary",
  secondary: "secondary",
} as const;

export type KeybindSlot = (typeof KEYBIND_SLOT)[keyof typeof KEYBIND_SLOT];

export type KeybindActionId =
  | "moveForward"
  | "moveLeft"
  | "moveBackward"
  | "moveRight"
  | "jump"
  | "sprint"
  | "crouch"
  | "toggleTablet"
  | "interact"
  | "rotatePlacement"
  | "confirmAction"
  | "cancelAction"
  | "deleteItem"
  | "cycleTabPrevious"
  | "cycleTabNext"
  | "cycleItemPrevious"
  | "cycleItemNext";

export const KEYBIND_ACTION = {
  moveForward: "moveForward",
  moveLeft: "moveLeft",
  moveBackward: "moveBackward",
  moveRight: "moveRight",
  jump: "jump",
  sprint: "sprint",
  crouch: "crouch",
  toggleTablet: "toggleTablet",
  interact: "interact",
  rotatePlacement: "rotatePlacement",
  confirmAction: "confirmAction",
  cancelAction: "cancelAction",
  deleteItem: "deleteItem",
  cycleTabPrevious: "cycleTabPrevious",
  cycleTabNext: "cycleTabNext",
  cycleItemPrevious: "cycleItemPrevious",
  cycleItemNext: "cycleItemNext",
} as const satisfies Record<string, KeybindActionId>;

export const BINDABLE_KEY = {
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
} as const satisfies Record<string, BindableKey>;

export type Keybind = ActionBinding<BindableKey>;

export type AppKeybinds = ActionBindingMap<KeybindActionId, BindableKey>;

export const KEYBIND_ACTIONS: readonly {
  id: KeybindActionId;
  label: string;
  description: string;
}[] = [
  { id: KEYBIND_ACTION.moveForward, label: "Move Forward", description: "Walk forward in the world." },
  { id: KEYBIND_ACTION.moveLeft, label: "Move Left", description: "Strafe left in the world." },
  { id: KEYBIND_ACTION.moveBackward, label: "Move Backward", description: "Walk backward in the world." },
  { id: KEYBIND_ACTION.moveRight, label: "Move Right", description: "Strafe right in the world." },
  { id: KEYBIND_ACTION.jump, label: "Jump", description: "Jump while moving in the world." },
  { id: KEYBIND_ACTION.sprint, label: "Sprint", description: "Hold to sprint." },
  { id: KEYBIND_ACTION.crouch, label: "Crouch", description: "Hold to crouch." },
  { id: KEYBIND_ACTION.toggleTablet, label: "Toggle Tablet", description: "Open or close the tablet." },
  { id: KEYBIND_ACTION.interact, label: "Interact", description: "Use nearby interactions like rack menus." },
  { id: KEYBIND_ACTION.rotatePlacement, label: "Rotate Placement", description: "Rotate the current placement preview." },
  { id: KEYBIND_ACTION.confirmAction, label: "Confirm Action", description: "Confirm placement or primary selected action." },
  { id: KEYBIND_ACTION.cancelAction, label: "Cancel Action", description: "Back out of placement or menus." },
  { id: KEYBIND_ACTION.deleteItem, label: "Delete Item", description: "Trash or remove the selected item." },
  { id: KEYBIND_ACTION.cycleTabPrevious, label: "Prev Tab", description: "Move to the previous storage tab." },
  { id: KEYBIND_ACTION.cycleTabNext, label: "Next Tab", description: "Move to the next storage tab." },
  { id: KEYBIND_ACTION.cycleItemPrevious, label: "Prev Item", description: "Move selection upward in storage." },
  { id: KEYBIND_ACTION.cycleItemNext, label: "Next Item", description: "Move selection downward in storage." },
] as const;

const DEFAULT_APP_KEYBINDS: AppKeybinds = {
  [KEYBIND_ACTION.moveForward]: { primary: "KeyW", secondary: "ArrowUp" },
  [KEYBIND_ACTION.moveLeft]: { primary: "KeyA", secondary: "ArrowLeft" },
  [KEYBIND_ACTION.moveBackward]: { primary: "KeyS", secondary: "ArrowDown" },
  [KEYBIND_ACTION.moveRight]: { primary: "KeyD", secondary: "ArrowRight" },
  [KEYBIND_ACTION.jump]: { primary: "Space", secondary: null },
  [KEYBIND_ACTION.sprint]: { primary: "Shift", secondary: null },
  [KEYBIND_ACTION.crouch]: { primary: "Control", secondary: "KeyC" },
  [KEYBIND_ACTION.toggleTablet]: { primary: BINDABLE_KEY.tab, secondary: null },
  [KEYBIND_ACTION.interact]: { primary: "KeyE", secondary: null },
  [KEYBIND_ACTION.rotatePlacement]: { primary: "KeyR", secondary: null },
  [KEYBIND_ACTION.confirmAction]: { primary: "Enter", secondary: "KeyE" },
  [KEYBIND_ACTION.cancelAction]: { primary: "Escape", secondary: null },
  [KEYBIND_ACTION.deleteItem]: { primary: BINDABLE_KEY.backspace, secondary: BINDABLE_KEY.delete },
  [KEYBIND_ACTION.cycleTabPrevious]: { primary: "KeyQ", secondary: "ArrowLeft" },
  [KEYBIND_ACTION.cycleTabNext]: { primary: "KeyE", secondary: "ArrowRight" },
  [KEYBIND_ACTION.cycleItemPrevious]: { primary: "ArrowUp", secondary: null },
  [KEYBIND_ACTION.cycleItemNext]: { primary: "ArrowDown", secondary: null },
};

export function isBindableKey(value: string): value is BindableKey {
  return BINDABLE_KEY_OPTIONS.some((key) => key === value);
}

export function normalizeKeyboardEventCode(event: KeyboardEvent): BindableKey | null {
  const code = normalizeKeyCode(event.code);
  return isBindableKey(code) ? code : null;
}

export function matchesKeybind(event: KeyboardEvent, keybind: Keybind): boolean {
  const normalizedCode = normalizeKeyboardEventCode(event);
  if (normalizedCode === null) return false;
  return bindingMatches(normalizedCode, keybind);
}

export function formatBindableKeyLabel(key: BindableKey | null): string {
  if (key === null) return "Unbound";
  if (key === "Space") return "Space";
  if (key === "Shift") return "Shift";
  if (key === "Control") return "Ctrl";
  if (key.startsWith("Key")) return key.slice(3);
  if (key.startsWith("Arrow")) return key.slice(5);
  return key;
}

export function sanitizeKeybinds(input: unknown): AppKeybinds {
  if (typeof input !== "object" || input === null) return DEFAULT_APP_KEYBINDS;

  const candidate = input;

  return {
    [KEYBIND_ACTION.moveForward]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.moveForward),
    [KEYBIND_ACTION.moveLeft]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.moveLeft),
    [KEYBIND_ACTION.moveBackward]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.moveBackward),
    [KEYBIND_ACTION.moveRight]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.moveRight),
    [KEYBIND_ACTION.jump]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.jump),
    [KEYBIND_ACTION.sprint]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.sprint),
    [KEYBIND_ACTION.crouch]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.crouch),
    [KEYBIND_ACTION.toggleTablet]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.toggleTablet),
    [KEYBIND_ACTION.interact]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.interact),
    [KEYBIND_ACTION.rotatePlacement]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.rotatePlacement),
    [KEYBIND_ACTION.confirmAction]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.confirmAction),
    [KEYBIND_ACTION.cancelAction]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.cancelAction),
    [KEYBIND_ACTION.deleteItem]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.deleteItem),
    [KEYBIND_ACTION.cycleTabPrevious]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.cycleTabPrevious),
    [KEYBIND_ACTION.cycleTabNext]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.cycleTabNext),
    [KEYBIND_ACTION.cycleItemPrevious]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.cycleItemPrevious),
    [KEYBIND_ACTION.cycleItemNext]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.cycleItemNext),
  };
}

function sanitizeSingleKeybind(input: object, actionId: KeybindActionId): Keybind {
  const fallback = DEFAULT_APP_KEYBINDS[actionId];
  if (!(actionId in input)) return fallback;
  const rawValue = Reflect.get(input, actionId);
  if (typeof rawValue !== "object" || rawValue === null) return fallback;

  const primary =
    "primary" in rawValue && typeof rawValue.primary === "string" && isBindableKey(rawValue.primary)
      ? rawValue.primary
      : fallback.primary;
  const secondary =
    "secondary" in rawValue
      ? rawValue.secondary === null
        ? null
        : typeof rawValue.secondary === "string" && isBindableKey(rawValue.secondary)
          ? rawValue.secondary
          : fallback.secondary
      : fallback.secondary;

  return { primary, secondary };
}

export const APP_SETTINGS_STORAGE_KEY = "llmville:app-settings";

export const GRAPHICS_QUALITY_OPTIONS = [
  {
    id: "performance",
    label: "Performance",
    description: "Keep effects lighter for smoother menus and gameplay.",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Use the default mix of clarity and visual polish.",
  },
  {
    id: "high",
    label: "High",
    description: "Favor richer presentation on stronger hardware.",
  },
] as const;

export type GraphicsQuality = (typeof GRAPHICS_QUALITY_OPTIONS)[number]["id"];

export interface AppSettings {
  reducedMotion: boolean;
  graphicsQuality: GraphicsQuality;
  keybinds: AppKeybinds;
}

export type SettingsTabId = "general" | "video" | "sound" | "keybinds" | "credits";

export const SETTINGS_TAB_ID = {
  general: "general",
  video: "video",
  sound: "sound",
  keybinds: "keybinds",
  credits: "credits",
} as const satisfies Record<string, SettingsTabId>;

export const SETTINGS_TABS: readonly { id: SettingsTabId; label: string }[] = [
  { id: SETTINGS_TAB_ID.general, label: "General" },
  { id: SETTINGS_TAB_ID.video, label: "Video" },
  { id: SETTINGS_TAB_ID.sound, label: "Sound" },
  { id: SETTINGS_TAB_ID.keybinds, label: "Keybinds" },
  { id: SETTINGS_TAB_ID.credits, label: "Credits" },
] as const;

export function isSettingsTabId(value: unknown): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export interface HomeRouteSearch {
  settings?: boolean;
  tab?: SettingsTabId;
}

export function parseHomeRouteSearch(raw: Record<string, unknown>): HomeRouteSearch {
  return {
    settings: raw["settings"] === true ? true : undefined,
    tab: isSettingsTabId(raw["tab"]) ? raw["tab"] : undefined,
  };
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  reducedMotion: false,
  graphicsQuality: "balanced",
  keybinds: DEFAULT_APP_KEYBINDS,
};

export function isGraphicsQuality(value: string): value is GraphicsQuality {
  return GRAPHICS_QUALITY_OPTIONS.some((option) => option.id === value);
}

const listeners = new Set<() => void>();

let currentSettings = DEFAULT_APP_SETTINGS;
let initialized = false;
let storageListenerBound = false;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function parseStoredSettings(raw: string | null): AppSettings {
  if (!raw) return DEFAULT_APP_SETTINGS;

  try {
    const parsed = JSON.parse(raw);
    const reducedMotion = typeof parsed === "object" && parsed !== null && "reducedMotion" in parsed && parsed.reducedMotion === true;
    const graphicsQuality =
      typeof parsed === "object" && parsed !== null && "graphicsQuality" in parsed && typeof parsed.graphicsQuality === "string" && isGraphicsQuality(parsed.graphicsQuality)
        ? parsed.graphicsQuality
        : DEFAULT_APP_SETTINGS.graphicsQuality;
    const keybinds =
      typeof parsed === "object" && parsed !== null && "keybinds" in parsed
        ? sanitizeKeybinds(parsed.keybinds)
        : DEFAULT_APP_KEYBINDS;
    return {
      reducedMotion,
      graphicsQuality,
      keybinds,
    };
  } catch {
    // Settings are low-value UI state, so invalid or old payloads reset to defaults.
    return DEFAULT_APP_SETTINGS;
  }
}

function applySettingsToDocument(settings: AppSettings) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.reducedMotion = settings.reducedMotion ? "true" : "false";
  document.documentElement.dataset.graphicsQuality = settings.graphicsQuality;
}

function handleStorageChange(event: StorageEvent) {
  if (event.key !== APP_SETTINGS_STORAGE_KEY) return;
  currentSettings = parseStoredSettings(event.newValue);
  applySettingsToDocument(currentSettings);
  emitChange();
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  if (typeof window === "undefined") return;

  currentSettings = parseStoredSettings(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY));
  applySettingsToDocument(currentSettings);

  if (!storageListenerBound) {
    storageListenerBound = true;
    window.addEventListener("storage", handleStorageChange);
  }
}

export function subscribeToAppSettings(listener: () => void) {
  ensureInitialized();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAppSettingsSnapshot() {
  ensureInitialized();
  return currentSettings;
}

export function updateAppSettings(partial: Partial<AppSettings>) {
  ensureInitialized();

  currentSettings = {
    ...currentSettings,
    ...partial,
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(currentSettings));
  }

  applySettingsToDocument(currentSettings);
  emitChange();
}

// ---- settings-runtime.ts ----

export function useAppSettings() {
  const settings = useSyncExternalStore(subscribeToAppSettings, getAppSettingsSnapshot, () => DEFAULT_APP_SETTINGS);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = settings.reducedMotion ? "true" : "false";
    document.documentElement.dataset.graphicsQuality = settings.graphicsQuality;
  }, [settings]);

  return {
    ...settings,
    setReducedMotion: (reducedMotion: boolean) => updateAppSettings({ reducedMotion }),
    setGraphicsQuality: (graphicsQuality: GraphicsQuality) => updateAppSettings({ graphicsQuality }),
    setKeybind: (actionId: KeybindActionId, slot: KeybindSlot, key: BindableKey | null) =>
      updateAppSettings({
        keybinds: {
          ...settings.keybinds,
          [actionId]: {
            ...settings.keybinds[actionId],
            [slot]: key,
          },
        },
      }),
    resetKeybinds: () => updateAppSettings({ keybinds: DEFAULT_APP_KEYBINDS }),
  };
}

export function useStoragePanelKeybindLabels() {
  const { keybinds } = useAppSettings();
  return useMemo(
    () => ({
      previousTab: formatBindableKeyLabel(keybinds.cycleTabPrevious.primary),
      nextTab: formatBindableKeyLabel(keybinds.cycleTabNext.primary),
      interact: formatBindableKeyLabel(keybinds.interact.primary),
      confirm: formatBindableKeyLabel(keybinds.confirmAction.primary),
      rotatePlacement: formatBindableKeyLabel(keybinds.rotatePlacement.primary),
      cancel: formatBindableKeyLabel(keybinds.cancelAction.primary),
    }),
    [keybinds],
  );
}

export interface EditingKeybind {
  actionId: KeybindActionId;
  slot: KeybindSlot;
}

export function useKeybindEditor(
  setKeybind: (actionId: KeybindActionId, slot: KeybindSlot, key: BindableKey | null) => void,
) {
  const [editing, setEditing] = useState<EditingKeybind | null>(null);

  useEffect(() => {
    if (editing === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setEditing(null);
        return;
      }

      const normalizedCode = normalizeKeyboardEventCode(event);
      if (normalizedCode === null) return;

      setKeybind(editing.actionId, editing.slot, normalizedCode);
      setEditing(null);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [editing, setKeybind]);

  return {
    editing,
    startEditing: setEditing,
    stopEditing: useCallback(() => setEditing(null), []),
  };
}
