import type { ActionCodesMap } from "./actionBindings";

/** A serializable gamepad state sampled from the platform input API. */
export interface GamepadSnapshot {
  id: string;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
  connected: boolean;
}

/** Names of the built-in controller glyph sets. */
export type GamepadGlyphName = "xbox" | "playstation" | "nintendo" | "generic";

/** Button labels used by one controller family. */
export interface GamepadGlyphSet {
  buttons: readonly string[];
}

/** Built-in short labels for the common controller families. */
export const GAMEPAD_GLYPH_SETS: Record<GamepadGlyphName, GamepadGlyphSet> = {
  xbox: { buttons: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "L3", "R3", "↑", "↓", "←", "→"] },
  playstation: { buttons: ["Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Share", "Options", "L3", "R3", "↑", "↓", "←", "→"] },
  nintendo: { buttons: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "L3", "R3", "↑", "↓", "←", "→"] },
  generic: { buttons: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "↑", "↓", "←", "→"] },
};

/** Lowercase alias for consumers that prefer data-oriented naming. */
export const gamepadGlyphSets = GAMEPAD_GLYPH_SETS;

/** Action bindings whose codes identify gamepad buttons or axes. */
export type GamepadBindings<TAction extends string = string> = ActionCodesMap<TAction, GamepadCode>;

/** A gamepad button or signed axis binding code. */
export type GamepadCode = `pad:${number}` | `padaxis:${number}${"+" | "-"}`;

/** Deadzone policy applied to gamepad axes. */
export interface GamepadDeadzone {
  kind: "radial" | "axial";
  inner: number;
  outer: number;
}

/** Options for resolving one gamepad snapshot into action state. */
export interface ResolveGamepadFrameOptions {
  deadzone: GamepadDeadzone;
  curve?: number;
}

/** The digital and analog action state produced by a gamepad frame. */
export interface GamepadFrame {
  held: string[];
  analog: Record<string, number>;
}

function bindingCodes(codes: GamepadBindings[string]): readonly GamepadCode[] {
  if (Array.isArray(codes)) return codes;
  const modes = codes as { hold?: readonly GamepadCode[]; toggle?: readonly GamepadCode[] };
  return [...(modes.hold ?? []), ...(modes.toggle ?? [])];
}

function shape(value: number, deadzone: GamepadDeadzone, curve: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone.inner) return 0;
  const normalized = magnitude >= deadzone.outer ? 1 : (magnitude - deadzone.inner) / (deadzone.outer - deadzone.inner);
  return Math.sign(value) * Math.pow(normalized, curve);
}

function readAxis(code: GamepadCode): { index: number; sign: number } | null {
  const match = /^padaxis:(\d+)([+-])$/.exec(code);
  return match === null ? null : { index: Number(match[1]), sign: match[2] === "+" ? 1 : -1 };
}

/** Resolve one sampled gamepad into held actions and shaped analog action values.
 * @capability gamepad-input Resolve sampled gamepad input into actions with deadzones and response curves.
 */
export function resolveGamepadFrame(
  snapshot: GamepadSnapshot,
  bindings: GamepadBindings,
  options: ResolveGamepadFrameOptions,
): GamepadFrame {
  if (!snapshot.connected) return { held: [], analog: {} };
  const inner = Math.max(0, options.deadzone.inner);
  const outer = Math.max(inner + Number.EPSILON, options.deadzone.outer);
  const curve = options.curve === undefined ? 1 : Math.max(Number.EPSILON, options.curve);
  const rawAxes = snapshot.axes.map((value) => (Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0));
  const axes = rawAxes.map((value) => shape(value, { ...options.deadzone, inner, outer }, curve));
  if (options.deadzone.kind === "radial") {
    const magnitude = Math.hypot(...rawAxes);
    const radial = magnitude <= inner ? 0 : Math.min(1, (magnitude - inner) / (outer - inner));
    const factor = magnitude === 0 ? 0 : (radial * Math.pow(radial, curve - 1)) / magnitude;
    for (let index = 0; index < axes.length; index += 1) axes[index] = rawAxes[index] * factor;
  }

  const held: string[] = [];
  const analog: Record<string, number> = {};
  for (const action of Object.keys(bindings)) {
    let actionAnalog = 0;
    let isHeld = false;
    for (const code of bindingCodes(bindings[action])) {
      if (code.startsWith("pad:")) {
        const index = Number(code.slice(4));
        const button = snapshot.buttons[index];
        if (button?.pressed === true) isHeld = true;
        actionAnalog = Math.max(actionAnalog, button?.value ?? 0);
        continue;
      }
      const axis = readAxis(code);
      if (axis !== null) actionAnalog = Math.max(actionAnalog, Math.max(0, axes[axis.index] * axis.sign));
    }
    if (isHeld || actionAnalog > 0) held.push(action);
    if (actionAnalog !== 0) analog[action] = actionAnalog;
  }
  return { held, analog };
}
