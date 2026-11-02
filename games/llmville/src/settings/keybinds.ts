import { bindingMatches, normalizeKeyCode, type ActionBinding, type ActionBindingMap, type ActionCodes } from "@jgengine/core/input/actionBindings";
import type { BindingOverrides } from "@jgengine/core/input/bindingOverrides";
import { createRebindSession, type RebindSession } from "@jgengine/core/input/rebindSession";

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
  | "moveBack"
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
  moveBack: "moveBack",
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

/** Action ids saved settings used before they matched the shell's movement actions. */
const RENAMED_ACTIONS: Partial<Record<KeybindActionId, string>> = { moveBack: "moveBackward" };

export const BINDABLE_KEY = {
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
} as const satisfies Record<string, BindableKey>;

export type Keybind = ActionBinding<BindableKey>;

export type AppKeybinds = ActionBindingMap<KeybindActionId, BindableKey>;

/**
 * Where an action is read: walking the world, placing a build item, or browsing the storage tablet.
 * Actions in different contexts share keys on purpose (the arrows walk and also page storage).
 */
export type KeybindContext = "walk" | "build" | "storage";

export const KEYBIND_ACTIONS: readonly {
  id: KeybindActionId;
  label: string;
  description: string;
  context: KeybindContext;
}[] = [
  { id: KEYBIND_ACTION.moveForward, label: "Move Forward", description: "Walk forward in the world." , context: "walk" },
  { id: KEYBIND_ACTION.moveLeft, label: "Move Left", description: "Strafe left in the world." , context: "walk" },
  { id: KEYBIND_ACTION.moveBack, label: "Move Backward", description: "Walk backward in the world." , context: "walk" },
  { id: KEYBIND_ACTION.moveRight, label: "Move Right", description: "Strafe right in the world." , context: "walk" },
  { id: KEYBIND_ACTION.jump, label: "Jump", description: "Jump while moving in the world." , context: "walk" },
  { id: KEYBIND_ACTION.sprint, label: "Sprint", description: "Hold to sprint." , context: "walk" },
  { id: KEYBIND_ACTION.crouch, label: "Crouch", description: "Hold to crouch." , context: "walk" },
  { id: KEYBIND_ACTION.toggleTablet, label: "Toggle Tablet", description: "Open or close the tablet." , context: "walk" },
  { id: KEYBIND_ACTION.interact, label: "Interact", description: "Use nearby interactions like rack menus." , context: "walk" },
  { id: KEYBIND_ACTION.rotatePlacement, label: "Rotate Placement", description: "Rotate the current placement preview." , context: "build" },
  { id: KEYBIND_ACTION.confirmAction, label: "Confirm Action", description: "Confirm placement or primary selected action." , context: "build" },
  { id: KEYBIND_ACTION.cancelAction, label: "Cancel Action", description: "Back out of placement or menus." , context: "build" },
  { id: KEYBIND_ACTION.deleteItem, label: "Delete Item", description: "Trash or remove the selected item." , context: "build" },
  { id: KEYBIND_ACTION.cycleTabPrevious, label: "Prev Tab", description: "Move to the previous storage tab." , context: "storage" },
  { id: KEYBIND_ACTION.cycleTabNext, label: "Next Tab", description: "Move to the next storage tab." , context: "storage" },
  { id: KEYBIND_ACTION.cycleItemPrevious, label: "Prev Item", description: "Move selection upward in storage." , context: "storage" },
  { id: KEYBIND_ACTION.cycleItemNext, label: "Next Item", description: "Move selection downward in storage." , context: "storage" },
] as const;

export const DEFAULT_APP_KEYBINDS: AppKeybinds = {
  [KEYBIND_ACTION.moveForward]: { primary: "KeyW", secondary: "ArrowUp" },
  [KEYBIND_ACTION.moveLeft]: { primary: "KeyA", secondary: "ArrowLeft" },
  [KEYBIND_ACTION.moveBack]: { primary: "KeyS", secondary: "ArrowDown" },
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

/** Saved action id that an older build used for `actionId`, if it was renamed. */
export function renamedActionId(actionId: KeybindActionId): string | undefined {
  return RENAMED_ACTIONS[actionId];
}

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
    [KEYBIND_ACTION.moveBack]: sanitizeSingleKeybind(candidate, KEYBIND_ACTION.moveBack),
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
  const savedId = actionId in input ? actionId : RENAMED_ACTIONS[actionId];
  if (savedId === undefined || !(savedId in input)) return fallback;
  const rawValue = Reflect.get(input, savedId);
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

/** A keybind's slots as engine rebind codes, primary first; an unbound secondary is left out. */
export function keybindToCodes(keybind: Keybind): string[] {
  return keybind.secondary === null ? [keybind.primary] : [keybind.primary, keybind.secondary];
}

function isCodeList(codes: ActionCodes): codes is readonly string[] {
  return Array.isArray(codes);
}

/** Engine rebind codes back into primary and secondary slots; codes this game cannot bind fall back. */
export function keybindFromCodes(codes: ActionCodes, fallback: Keybind): Keybind {
  const list = isCodeList(codes) ? codes : [...(codes.hold ?? []), ...(codes.toggle ?? [])];
  const bindable = list.filter(isBindableKey);
  const primary = bindable[0];
  if (primary === undefined) return fallback;
  return { primary, secondary: bindable[1] ?? null };
}

export function keybindsEqual(a: Keybind, b: Keybind): boolean {
  return a.primary === b.primary && a.secondary === b.secondary;
}

/** A rebind session over every LLMville action, seeded with the player's keybinds. */
export function keybindRebindSession(keybinds: AppKeybinds): RebindSession {
  const overrides: BindingOverrides = {};
  for (const { id } of KEYBIND_ACTIONS) {
    if (!keybindsEqual(keybinds[id], DEFAULT_APP_KEYBINDS[id])) overrides[id] = keybindToCodes(keybinds[id]);
  }
  return createRebindSession({
    actions: KEYBIND_ACTIONS.map((action) => ({
      id: action.id,
      label: action.label,
      defaultCodes: keybindToCodes(DEFAULT_APP_KEYBINDS[action.id]),
      context: action.context,
    })),
    overrides,
  });
}

/** The keybinds a rebind session holds; a key this game cannot bind keeps the action's default. */
export function keybindsFromSession(session: RebindSession): AppKeybinds {
  const next: AppKeybinds = { ...DEFAULT_APP_KEYBINDS };
  for (const row of session.rows()) {
    const action = KEYBIND_ACTIONS.find((candidate) => candidate.id === row.actionId);
    if (action !== undefined) next[action.id] = keybindFromCodes(row.codes, DEFAULT_APP_KEYBINDS[action.id]);
  }
  return next;
}
