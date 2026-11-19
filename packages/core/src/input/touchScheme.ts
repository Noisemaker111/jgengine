/**
 * Touch control scheme derived from a game's existing action bindings: the
 * capture layer renders a virtual joystick, on-screen buttons, and a gesture
 * surface, and feeds synthetic `touch:<action>` codes into the same
 * ActionStateTracker the keyboard uses, so games gain touch play without any
 * per-game input code. Session-lifecycle actions (start/restart/pause/menu/…)
 * are left off the derived dock — they live in the start screen, pause menu, or
 * settings sheet, never as a chip over live play. Games refine the derived
 * defaults through TouchControlsConfig (gesture bindings, button curation) or
 * opt out entirely with `touch: false`.
 */

import { isCodeList, isHotbarSlotAction, type ActionCodesMap } from "./actionBindings";

export const TOUCH_CODE_PREFIX = "touch:";

export function touchCode(action: string): string {
  return `${TOUCH_CODE_PREFIX}${action}`;
}

export function withTouchCodes(map: ActionCodesMap | undefined): ActionCodesMap {
  const result: ActionCodesMap = {};
  for (const [action, codes] of Object.entries(map ?? {})) {
    const synthetic = touchCode(action);
    if (isCodeList(codes)) {
      result[action] = [...codes, synthetic];
      continue;
    }
    const { hold, toggle } = codes;
    const toggleOnly = (toggle?.length ?? 0) > 0 && (hold?.length ?? 0) === 0;
    result[action] = toggleOnly
      ? { ...(hold === undefined ? {} : { hold }), toggle: [...(toggle ?? []), synthetic] }
      : { hold: [...(hold ?? []), synthetic], ...(toggle === undefined ? {} : { toggle }) };
  }
  return result;
}

export interface TouchDragBinding {
  left?: string;
  right?: string;
  up?: string;
  down?: string;
  stepPx?: number;
}

export interface TouchGestureBindings {
  tap?: string;
  swipeUp?: string;
  swipeDown?: string;
  swipeLeft?: string;
  swipeRight?: string;
  drag?: TouchDragBinding;
}

/**
 * Physical silhouette a touch button wears. The capture layer draws each as its
 * own shape — a `pedal` reads as a foot pedal, a `lever` as a pull handle, a
 * `trigger` as a firing paddle — so a control looks like the thing it does
 * instead of a labelled circle. `circle`/`square` are the neutral fallbacks.
 */
export type TouchButtonShape = "circle" | "square" | "pedal" | "lever" | "trigger" | "wheel" | "tab";

/**
 * Screen zone a touch cluster or button docks to. The four corners plus the
 * mid `left`/`right` rails (vertical stacks, MMO-style hotbars) and the
 * `bottom-center` / `top-center` strips let controls use the whole viewport
 * instead of piling into one bottom bar.
 */
export type TouchAnchor =
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "left"
  | "right"
  | "top-left"
  | "top-center"
  | "top-right";

export type TouchStyle = "glass" | "arcade" | "mechanical" | "minimal";

export const TOUCH_STYLES: readonly TouchStyle[] = ["glass", "arcade", "mechanical", "minimal"];

export const TOUCH_STYLE_OPTIONS: readonly { value: TouchStyle; label: string }[] = [
  { value: "glass", label: "Glass" },
  { value: "arcade", label: "Arcade" },
  { value: "mechanical", label: "Mechanical" },
  { value: "minimal", label: "Minimal" },
];

export const DEFAULT_TOUCH_STYLE: TouchStyle = "glass";

/**
 * How the movement joystick behaves — the two shipped variants, player-selectable in
 * Settings → Controls. `fixed` is the classic always-visible stick in its dock corner;
 * `floating` keeps the corner as an empty capture zone and spawns the stick centered under
 * wherever the thumb lands, so the hand never has to find a fixed target mid-play.
 */
export type TouchJoystickVariant = "fixed" | "floating";

export const TOUCH_JOYSTICK_VARIANTS: readonly TouchJoystickVariant[] = ["fixed", "floating"];

export const TOUCH_JOYSTICK_VARIANT_OPTIONS: readonly { value: TouchJoystickVariant; label: string }[] = [
  { value: "floating", label: "Floating (under your thumb)" },
  { value: "fixed", label: "Fixed" },
];

export const DEFAULT_TOUCH_JOYSTICK_VARIANT: TouchJoystickVariant = "floating";

export interface TouchLayoutConfig {
  movement?: TouchAnchor;
  actions?: TouchAnchor;
  utility?: TouchAnchor;
}

export interface ResolvedTouchLayout {
  movement: TouchAnchor;
  actions: TouchAnchor;
  utility: TouchAnchor;
}

export interface TouchButtonSpec {
  action: string;
  label?: string;
  icon?: string | false;
  main?: boolean;
  kind?: TouchButtonKind;
  shape?: TouchButtonShape;
  /** Docks this button on its own instead of joining its cluster — e.g. a brake pedal pinned to the right rail. */
  anchor?: TouchAnchor;
  /** Custom art drawn as the button face instead of the built-in silhouette — any image URL or `data:image/svg+xml` URI (a slot frame, spell plate, …); the icon/label still sits on top. */
  image?: string;
}

export interface TouchMovementConfig {
  axis?: "both" | "horizontal" | "vertical";
}

export type TouchControlsModeConfig = Omit<TouchControlsConfig, "modes">;

/** Edge bands, in CSS pixels, that touch clusters stay clear of. */
export interface TouchReserve {
  top?: number;
  bottom?: number;
}

export interface TouchControlsConfig {
  movement?: false | TouchMovementConfig;
  buttons?: readonly (string | TouchButtonSpec)[];
  gestures?: TouchGestureBindings;
  /** Drag-to-look on the play surface; defaults to true for first-person games. */
  look?: boolean;
  /** Radians of look rotation per pixel of touch travel. Default 0.005. */
  lookSensitivity?: number;
  hidden?: readonly string[];
  layout?: TouchLayoutConfig;
  style?: TouchStyle;
  /** Screen bands the clusters keep clear of, in CSS pixels, for HUD the game docks at an edge (a bottom tab bar, a top banner). Default 0. */
  reserve?: TouchReserve;
  /**
   * Per-context control sets for games whose verbs change at runtime — on foot vs driving vs
   * flying. Each key is a mode name whose fields *replace* the matching base fields while that
   * mode is active (base config = the default mode). Gameplay switches with
   * `setTouchControlsMode(ctx, "car")` and back with `null`; only the actions a context actually
   * uses should be visible in it, so a runner on foot never sees flight or vehicle chrome.
   */
  modes?: Record<string, TouchControlsModeConfig>;
}

export interface TouchJoystick {
  up: string | null;
  down: string | null;
  left: string | null;
  right: string | null;
}

export type TouchButtonKind = "primary" | "utility";

export interface TouchButton {
  action: string;
  label: string;
  icon: string | false | null;
  /** Set when the game marked this the cluster's main button; otherwise the dock picks one. */
  main?: boolean;
  kind: TouchButtonKind;
  shape: TouchButtonShape;
  anchor: TouchAnchor | null;
  image: string | null;
}

export interface TouchScheme {
  joystick: TouchJoystick | null;
  buttons: readonly TouchButton[];
  /** Weapon/item slot actions (`selectSlot1`…), in slot order, collapsed into one small numbered strip instead of a big button each. */
  slots: readonly string[];
  gestures: TouchGestureBindings | null;
  look: boolean;
  lookSensitivity: number;
  layout: ResolvedTouchLayout;
  style: TouchStyle;
  reserve: { top: number; bottom: number };
}

const DEFAULT_LOOK_SENSITIVITY = 0.005;

const DEFAULT_TOUCH_LAYOUT: ResolvedTouchLayout = {
  movement: "bottom-left",
  actions: "bottom-right",
  utility: "bottom-right",
};

const SHAPE_BY_ACTION: ReadonlyMap<string, TouchButtonShape> = new Map([
  ["brake", "pedal"],
  ["accelerate", "pedal"],
  ["throttle", "pedal"],
  ["throttleUp", "pedal"],
  ["throttleDown", "pedal"],
  ["gas", "pedal"],
  ["clutch", "pedal"],
  ["handbrake", "lever"],
  ["gearUp", "lever"],
  ["gearDown", "lever"],
  ["shift", "lever"],
  ["boost", "lever"],
  ["fire", "trigger"],
  ["shoot", "trigger"],
  ["attack", "trigger"],
  ["primaryFire", "trigger"],
  ["secondaryFire", "trigger"],
  ["steer", "wheel"],
  ["inventory", "square"],
  ["bag", "square"],
  ["spellbook", "square"],
]);

const WHEEL_PREFIXES = ["steer"] as const;
const SQUARE_PREFIXES = ["spell", "slot", "item"] as const;

/** @capability touch-controls default on-screen button silhouette for a touch action */
export function touchButtonShape(action: string): TouchButtonShape {
  const direct = SHAPE_BY_ACTION.get(action);
  if (direct !== undefined) return direct;
  for (const prefix of WHEEL_PREFIXES) {
    if (action.startsWith(prefix)) return "wheel";
  }
  for (const prefix of SQUARE_PREFIXES) {
    if (action.startsWith(prefix)) return "square";
  }
  return "circle";
}

const JOYSTICK_AXES = {
  up: ["moveForward", "moveUp", "forward", "accelerate", "throttleUp", "pitchUp", "climb"],
  down: ["moveBack", "moveBackward", "moveDown", "backward", "reverse", "brake", "throttleDown", "pitchDown", "dive"],
  left: ["moveLeft", "turnLeft", "steerLeft", "yawLeft", "strafeLeft", "bankLeft", "rollLeft"],
  right: ["moveRight", "turnRight", "steerRight", "yawRight", "strafeRight", "bankRight", "rollRight"],
} as const;

const BUTTONABLE_RESERVED: ReadonlySet<string> = new Set(["jump", "sprint", "interact", "useAbility"]);

const UTILITY_ACTIONS: ReadonlySet<string> = new Set([
  "start",
  "restart",
  "reset",
  "retry",
  "pause",
  "resume",
  "menu",
  "quit",
  "exit",
  "mute",
  "unmute",
  "help",
  "settings",
  "options",
  "map",
  "inventory",
  "scoreboard",
  "leaderboard",
]);

const UTILITY_PREFIXES = ["toggle", "cycle", "switch", "open", "close", "show", "hide", "zoom"] as const;

/**
 * Session-lifecycle and menu-chrome actions never auto-derive an on-screen
 * touch button: they belong to the start screen, pause menu, or settings sheet
 * (surfaced via `settings.actions` plus a `<SettingsTrigger>`), not the live
 * control dock — a `restart` chip stapled over play is the anti-pattern, and a
 * mis-tap on it wrecks the match. A game that truly wants one docked lists it
 * explicitly in `touch.buttons`, which bypasses derivation entirely.
 */
const LIFECYCLE_ACTIONS: ReadonlySet<string> = new Set([
  "start",
  "restart",
  "reset",
  "retry",
  "pause",
  "resume",
  "menu",
  "quit",
  "exit",
  "settings",
  "options",
]);

export function touchButtonKind(action: string): TouchButtonKind {
  if (UTILITY_ACTIONS.has(action)) return "utility";
  for (const prefix of UTILITY_PREFIXES) {
    if (!action.startsWith(prefix)) continue;
    const next = action.charAt(prefix.length);
    if (next !== "" && next === next.toUpperCase()) return "utility";
  }
  return "primary";
}

export function touchActionLabel(action: string): string {
  const spaced = action.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function gestureActions(gestures: TouchGestureBindings | undefined): Set<string> {
  const used = new Set<string>();
  if (gestures === undefined) return used;
  for (const action of [gestures.tap, gestures.swipeUp, gestures.swipeDown, gestures.swipeLeft, gestures.swipeRight]) {
    if (action !== undefined) used.add(action);
  }
  const drag = gestures.drag;
  for (const action of [drag?.left, drag?.right, drag?.up, drag?.down]) {
    if (action !== undefined) used.add(action);
  }
  return used;
}

const TOUCH_SLOT_ACTION = /^(?:select|equip|use|switchTo|weapon|item)(?:hotbar|weapon|item)?slot(\d+)$/i;

/**
 * 1-based slot number for a game-routed slot picker action (`selectSlot2` → 2), or null.
 *
 * @capability touch-controls collapse numbered slot pickers into one compact touch slot strip
 */
export function touchSlotNumber(action: string): number | null {
  const match = TOUCH_SLOT_ACTION.exec(action);
  return match === null ? null : Number(match[1]);
}

const ACTION_PRIORITY: readonly (readonly [readonly string[], number])[] = [
  [["fire", "shoot", "attack"], 0],
  [["aim", "ads", "scope"], 1],
  [["jump"], 2],
  [["reload"], 3],
  [["crouch", "slide", "prone"], 4],
  [["interact", "use"], 5],
  [["sprint", "dash", "dodge"], 6],
  [["grenade", "throw", "ability", "ult"], 7],
];

function actionPriority(action: string): number {
  const id = action.toLowerCase();
  // Healing items (`useHealthVial`) read as consumables, not as the interact verb `use` would suggest.
  if (/heal|vial|medkit|potion|bandage/.test(id)) return 8;
  for (const [keywords, rank] of ACTION_PRIORITY) {
    if (keywords.some((keyword) => id.includes(keyword))) return rank;
  }
  return 9;
}

export interface DeriveTouchSchemeOptions {
  reserved: ReadonlySet<string>;
  firstPerson: boolean;
  config?: TouchControlsConfig | false | undefined;
  mode?: string | null;
}

function resolveModeConfig(
  config: TouchControlsConfig | false | undefined,
  mode: string | null | undefined,
): TouchControlsConfig | false | undefined {
  if (config === false || config === undefined || mode === null || mode === undefined) return config;
  const active = config.modes?.[mode];
  if (active === undefined) return config;
  const { modes: _modes, ...base } = config;
  return { ...base, ...active };
}

/**
 * Auto-derived thumb-cluster button count past which the dock stops being playable — the main
 * button plus two full arcs. Slot pickers and menu-type buttons fold into small chips and do not
 * count. A curated `touch.buttons` list may exceed it deliberately; blind derivation may not.
 */
const DERIVED_BUTTON_BUDGET = 9;

export function deriveTouchScheme(
  input: ActionCodesMap | undefined,
  { reserved, firstPerson, config: rawConfig, mode }: DeriveTouchSchemeOptions,
): TouchScheme | null {
  const config = resolveModeConfig(rawConfig, mode);
  if (config === false) return null;
  const actions = Object.keys(input ?? {});
  const bound = new Set(actions);

  const joystickMapped = new Set<string>();
  let joystick: TouchJoystick | null = null;
  if (config?.movement !== false) {
    const axis = config?.movement?.axis ?? "both";
    const resolveAxis = (candidates: readonly string[], enabled: boolean): string | null => {
      if (!enabled) return null;
      const action = candidates.find((candidate) => bound.has(candidate)) ?? null;
      if (action !== null) joystickMapped.add(action);
      return action;
    };
    const axes: TouchJoystick = {
      up: resolveAxis(JOYSTICK_AXES.up, axis !== "horizontal"),
      down: resolveAxis(JOYSTICK_AXES.down, axis !== "horizontal"),
      left: resolveAxis(JOYSTICK_AXES.left, axis !== "vertical"),
      right: resolveAxis(JOYSTICK_AXES.right, axis !== "vertical"),
    };
    joystick = axes.up === null && axes.down === null && axes.left === null && axes.right === null ? null : axes;
  }

  const gestures = config?.gestures ?? null;
  const consumedByGestures = gestureActions(config?.gestures);
  const hidden = new Set(config?.hidden ?? []);

  let buttons: TouchButton[];
  if (config?.buttons !== undefined) {
    buttons = config.buttons.map((spec): TouchButton =>
      typeof spec === "string"
        ? {
            action: spec,
            label: touchActionLabel(spec),
            icon: null,
            kind: touchButtonKind(spec),
            shape: touchButtonShape(spec),
            anchor: null,
            image: null,
          }
        : {
            action: spec.action,
            label: spec.label ?? touchActionLabel(spec.action),
            icon: spec.icon ?? null,
            kind: spec.kind ?? touchButtonKind(spec.action),
            shape: spec.shape ?? touchButtonShape(spec.action),
            anchor: spec.anchor ?? null,
            image: spec.image ?? null,
            ...(spec.main === true ? { main: true } : {}),
          },
    );
  } else {
    buttons = actions
      .filter((action) => !joystickMapped.has(action))
      .filter((action) => !isHotbarSlotAction(action))
      .filter((action) => !consumedByGestures.has(action))
      .filter((action) => !hidden.has(action))
      .filter((action) => !LIFECYCLE_ACTIONS.has(action))
      .filter((action) => !reserved.has(action) || BUTTONABLE_RESERVED.has(action))
      .map((action) => ({
        action,
        label: touchActionLabel(action),
        icon: null,
        kind: touchButtonKind(action),
        shape: touchButtonShape(action),
        anchor: null,
        image: null,
      }))
      .sort((a, b) => actionPriority(a.action) - actionPriority(b.action));
    const thumbButtons = buttons.filter((button) => button.kind === "primary" && touchSlotNumber(button.action) === null);
    if (thumbButtons.length > DERIVED_BUTTON_BUDGET) {
      console.warn(
        `[jgengine:touch] derived ${thumbButtons.length} thumb buttons (${thumbButtons
          .map((button) => button.action)
          .join(", ")}) — more than a thumb can reach. Curate touch.buttons, hide actions with touch.hidden, or split contexts with touch.modes.`,
      );
    }
  }

  const slots = buttons
    .filter((button) => button.anchor === null && touchSlotNumber(button.action) !== null)
    .sort((a, b) => (touchSlotNumber(a.action) ?? 0) - (touchSlotNumber(b.action) ?? 0))
    .map((button) => button.action);
  if (slots.length > 0) buttons = buttons.filter((button) => !slots.includes(button.action));

  const look = config?.look ?? firstPerson;
  if (joystick === null && buttons.length === 0 && slots.length === 0 && gestures === null && !look) return null;

  return {
    joystick,
    buttons,
    slots,
    gestures,
    look,
    lookSensitivity: config?.lookSensitivity ?? DEFAULT_LOOK_SENSITIVITY,
    layout: {
      movement: config?.layout?.movement ?? DEFAULT_TOUCH_LAYOUT.movement,
      actions: config?.layout?.actions ?? DEFAULT_TOUCH_LAYOUT.actions,
      utility: config?.layout?.utility ?? DEFAULT_TOUCH_LAYOUT.utility,
    },
    style: config?.style ?? DEFAULT_TOUCH_STYLE,
    reserve: { top: Math.max(0, config?.reserve?.top ?? 0), bottom: Math.max(0, config?.reserve?.bottom ?? 0) },
  };
}
