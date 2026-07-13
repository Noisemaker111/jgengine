/**
 * Touch control scheme derived from a game's existing action bindings: the
 * capture layer renders a virtual joystick, on-screen buttons, and a gesture
 * surface, and feeds synthetic `touch:<action>` codes into the same
 * ActionStateTracker the keyboard uses, so games gain touch play without any
 * per-game input code. Games refine the derived defaults through
 * TouchControlsConfig (gesture bindings, button curation) or opt out entirely
 * with `touch: false`.
 */

import { isHotbarSlotAction, type ActionCodes, type ActionCodesMap } from "./actionBindings";

export const TOUCH_CODE_PREFIX = "touch:";

export function touchCode(action: string): string {
  return `${TOUCH_CODE_PREFIX}${action}`;
}

/** Every action gains a synthetic touch code alongside its physical codes. */
export function withTouchCodes(map: ActionCodesMap | undefined): ActionCodesMap {
  const result: ActionCodesMap = {};
  for (const action of Object.keys(map ?? {})) {
    const codes = (map as ActionCodesMap)[action] as ActionCodes;
    const synthetic = touchCode(action);
    if (Array.isArray(codes)) {
      result[action] = [...codes, synthetic];
    } else {
      const modes = codes as { hold?: readonly string[]; toggle?: readonly string[] };
      const toggleOnly = (modes.toggle?.length ?? 0) > 0 && (modes.hold?.length ?? 0) === 0;
      result[action] = toggleOnly
        ? { hold: modes.hold, toggle: [...(modes.toggle ?? []), synthetic] }
        : { hold: [...(modes.hold ?? []), synthetic], toggle: modes.toggle };
    }
  }
  return result;
}

export interface TouchDragBinding {
  /** Action fired once per `stepPx` of travel toward that side. */
  left?: string;
  right?: string;
  up?: string;
  down?: string;
  stepPx?: number;
}

export interface TouchGestureBindings {
  /** Action fired by a quick still tap on the play surface. */
  tap?: string;
  /** Actions fired by a fast flick past the swipe threshold. */
  swipeUp?: string;
  swipeDown?: string;
  swipeLeft?: string;
  swipeRight?: string;
  /** Continuous drag: repeats the directional action every `stepPx` of travel. Wins over swipes on its axis, except a flick can still fire the swipe binding for a direction the drag leaves unbound. */
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

/**
 * Player-selectable skin for the whole touch layer. A style is a material +
 * geometry preset (not just colours), chosen in Settings → Controls and
 * persisted; `glass` is the translucent default, the rest are opt-in looks.
 */
export type TouchStyle = "glass" | "arcade" | "mechanical" | "minimal";

/** Every touch skin id, in menu order. */
export const TOUCH_STYLES: readonly TouchStyle[] = ["glass", "arcade", "mechanical", "minimal"];

/** Touch skins as `{ value, label }` rows for the Settings → Controls selector. */
export const TOUCH_STYLE_OPTIONS: readonly { value: TouchStyle; label: string }[] = [
  { value: "glass", label: "Glass" },
  { value: "arcade", label: "Arcade" },
  { value: "mechanical", label: "Mechanical" },
  { value: "minimal", label: "Minimal" },
];

/** Skin used when neither the game nor the player picks one. */
export const DEFAULT_TOUCH_STYLE: TouchStyle = "glass";

/** Where each touch cluster docks; unset falls back to the classic bottom layout. */
export interface TouchLayoutConfig {
  /** Virtual joystick / movement zone. Default `bottom-left`. */
  movement?: TouchAnchor;
  /** Primary action cluster. Default `bottom-right`. */
  actions?: TouchAnchor;
  /** Utility chip row. Default `bottom-center`. */
  utility?: TouchAnchor;
}

/** The dock zone each cluster resolved to, after applying game config over the bottom-layout defaults. */
export interface ResolvedTouchLayout {
  movement: TouchAnchor;
  actions: TouchAnchor;
  utility: TouchAnchor;
}

export interface TouchButtonSpec {
  action: string;
  label?: string;
  /** Glyph name from the capture layer's icon catalog (`@jgengine/react/gameIcons` `GameIconName`); unset derives one from the action name, `false` forces the text label. */
  icon?: string | false;
  /** Overrides the derived classification: `primary` renders as a large thumb button, `utility` as a small chip away from the thumb zones. */
  kind?: TouchButtonKind;
  /** Physical silhouette; unset derives one from the action name (`brake`→pedal, `handbrake`→lever, `fire`→trigger, …). */
  shape?: TouchButtonShape;
  /** Docks this button on its own instead of joining its cluster — e.g. a brake pedal pinned to the right rail. */
  anchor?: TouchAnchor;
  /** Custom art drawn as the button face instead of the built-in silhouette — any image URL or `data:image/svg+xml` URI (a slot frame, spell plate, …); the icon/label still sits on top. */
  image?: string;
}

/** Restricts the virtual joystick to one axis — a `horizontal` zone reads as a steering control, freeing throttle/brake to become pedal buttons. */
export interface TouchMovementConfig {
  axis?: "both" | "horizontal" | "vertical";
}

export interface TouchControlsConfig {
  /** `false` removes the virtual joystick even when movement actions are bound; an object restricts it to one axis. */
  movement?: false | TouchMovementConfig;
  /** Curated on-screen buttons (order preserved); omit to derive one button per remaining action. */
  buttons?: readonly (string | TouchButtonSpec)[];
  /** Play-surface gestures; actions consumed here stop appearing as derived buttons. */
  gestures?: TouchGestureBindings;
  /** Drag-to-look on the play surface; defaults to true for first-person games. */
  look?: boolean;
  /** Radians of look rotation per pixel of touch travel. Default 0.005. */
  lookSensitivity?: number;
  /** Actions to leave off the derived button cluster. */
  hidden?: readonly string[];
  /** Dock each cluster to a screen zone; omit for the classic bottom layout. */
  layout?: TouchLayoutConfig;
  /** Suggested default skin; the player's Settings choice overrides it. Default `glass`. */
  style?: TouchStyle;
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
  /** Glyph hint for the capture layer: a name to render, `false` to force text, null to derive from the action name. */
  icon: string | false | null;
  /** `primary` = frequent gameplay verb, rendered as a large thumb button; `utility` = meta action (start, restart, pause, toggles), rendered as a small chip. */
  kind: TouchButtonKind;
  /** Physical silhouette to draw. */
  shape: TouchButtonShape;
  /** Per-button dock override; null joins the cluster's anchor. */
  anchor: TouchAnchor | null;
  /** Custom face art (image/SVG URL); null draws the built-in silhouette. */
  image: string | null;
}

export interface TouchScheme {
  joystick: TouchJoystick | null;
  buttons: readonly TouchButton[];
  gestures: TouchGestureBindings | null;
  look: boolean;
  lookSensitivity: number;
  /** Resolved dock zones for the three clusters. */
  layout: ResolvedTouchLayout;
  /** Game-suggested default skin; the shell swaps in the player's choice when set. */
  style: TouchStyle;
}

const DEFAULT_LOOK_SENSITIVITY = 0.005;

const DEFAULT_TOUCH_LAYOUT: ResolvedTouchLayout = {
  movement: "bottom-left",
  actions: "bottom-right",
  utility: "bottom-center",
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
/** Slot-like verbs read as square tiles (inventory, spell/item/ability slots). */
const SQUARE_PREFIXES = ["spell", "slot", "item"] as const;

/**
 * Default silhouette for an action; `circle` when nothing more specific fits.
 *
 * @capability touch-controls default on-screen button silhouette for a touch action
 */
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

export interface DeriveTouchSchemeOptions {
  reserved: ReadonlySet<string>;
  firstPerson: boolean;
  config?: TouchControlsConfig | false;
}

/**
 * Null means "render no touch controls" — either the game opted out or there
 * is nothing to synthesize.
 */
export function deriveTouchScheme(
  input: ActionCodesMap | undefined,
  { reserved, firstPerson, config }: DeriveTouchSchemeOptions,
): TouchScheme | null {
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
    buttons = config.buttons.map((spec) =>
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
          },
    );
  } else {
    buttons = actions
      .filter((action) => !joystickMapped.has(action))
      .filter((action) => !isHotbarSlotAction(action))
      .filter((action) => !consumedByGestures.has(action))
      .filter((action) => !hidden.has(action))
      .filter((action) => !reserved.has(action) || BUTTONABLE_RESERVED.has(action))
      .map((action) => ({
        action,
        label: touchActionLabel(action),
        icon: null,
        kind: touchButtonKind(action),
        shape: touchButtonShape(action),
        anchor: null,
        image: null,
      }));
  }

  const look = config?.look ?? firstPerson;
  if (joystick === null && buttons.length === 0 && gestures === null && !look) return null;

  return {
    joystick,
    buttons,
    gestures,
    look,
    lookSensitivity: config?.lookSensitivity ?? DEFAULT_LOOK_SENSITIVITY,
    layout: {
      movement: config?.layout?.movement ?? DEFAULT_TOUCH_LAYOUT.movement,
      actions: config?.layout?.actions ?? DEFAULT_TOUCH_LAYOUT.actions,
      utility: config?.layout?.utility ?? DEFAULT_TOUCH_LAYOUT.utility,
    },
    style: config?.style ?? DEFAULT_TOUCH_STYLE,
  };
}
