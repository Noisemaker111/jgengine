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

export interface TouchButtonSpec {
  action: string;
  label?: string;
  /** Glyph name from the capture layer's icon catalog (`@jgengine/react/gameIcons` `GameIconName`); unset derives one from the action name, `false` forces the text label. */
  icon?: string | false;
}

export interface TouchControlsConfig {
  /** `false` removes the virtual joystick even when movement actions are bound. */
  movement?: false;
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
}

export interface TouchJoystick {
  up: string | null;
  down: string | null;
  left: string | null;
  right: string | null;
}

export interface TouchButton {
  action: string;
  label: string;
  /** Glyph hint for the capture layer: a name to render, `false` to force text, null to derive from the action name. */
  icon: string | false | null;
}

export interface TouchScheme {
  joystick: TouchJoystick | null;
  buttons: readonly TouchButton[];
  gestures: TouchGestureBindings | null;
  look: boolean;
  lookSensitivity: number;
}

const DEFAULT_LOOK_SENSITIVITY = 0.005;

const JOYSTICK_AXES = {
  up: ["moveForward"],
  down: ["moveBack"],
  left: ["moveLeft", "turnLeft"],
  right: ["moveRight", "turnRight"],
} as const;

const BUTTONABLE_RESERVED: ReadonlySet<string> = new Set(["jump", "sprint", "interact", "useAbility"]);

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
    const resolveAxis = (candidates: readonly string[]): string | null => {
      const action = candidates.find((candidate) => bound.has(candidate)) ?? null;
      if (action !== null) joystickMapped.add(action);
      return action;
    };
    const axes: TouchJoystick = {
      up: resolveAxis(JOYSTICK_AXES.up),
      down: resolveAxis(JOYSTICK_AXES.down),
      left: resolveAxis(JOYSTICK_AXES.left),
      right: resolveAxis(JOYSTICK_AXES.right),
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
        ? { action: spec, label: touchActionLabel(spec), icon: null }
        : { action: spec.action, label: spec.label ?? touchActionLabel(spec.action), icon: spec.icon ?? null },
    );
  } else {
    buttons = actions
      .filter((action) => !joystickMapped.has(action))
      .filter((action) => !isHotbarSlotAction(action))
      .filter((action) => !consumedByGestures.has(action))
      .filter((action) => !hidden.has(action))
      .filter((action) => !reserved.has(action) || BUTTONABLE_RESERVED.has(action))
      .map((action) => ({ action, label: touchActionLabel(action), icon: null }));
  }

  const look = config?.look ?? firstPerson;
  if (joystick === null && buttons.length === 0 && gestures === null && !look) return null;

  return {
    joystick,
    buttons,
    gestures,
    look,
    lookSensitivity: config?.lookSensitivity ?? DEFAULT_LOOK_SENSITIVITY,
  };
}
