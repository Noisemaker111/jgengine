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

/**
 * Read-only view of one sampled gamepad. The browser `Gamepad` satisfies it structurally, so a poll
 * loop can resolve `navigator.getGamepads()` entries without copying them.
 */
export interface GamepadSample {
  readonly axes: ArrayLike<number>;
  readonly buttons: ArrayLike<{ readonly pressed: boolean; readonly value: number }>;
  readonly connected: boolean;
}

/** Options for resolving one gamepad snapshot into action state. */
export interface ResolveGamepadFrameOptions {
  deadzone: GamepadDeadzone;
  /** Response exponent for sticks and analog buttons: `1` linear, `>1` finer near rest (default `1`). */
  curve?: number;
  /** Inner deadzone `0..1` for analog button values (triggers); below it the button reads 0 and is not held (default `0`). */
  triggerDeadzone?: number;
}

/**
 * Game-level pad feel read by the shell's gamepad poll. A number `deadzone` is the axial inner
 * deadzone with a `0.95` outer edge.
 */
export interface GamepadFeelConfig {
  /** Stick deadzone (default axial `0.12` inner, `0.95` outer). */
  deadzone?: number | GamepadDeadzone;
  /** Response exponent shared by sticks and triggers (default `1`). */
  curve?: number;
  /** Trigger inner deadzone `0..1` (default `0`). */
  triggerDeadzone?: number;
}

/** Shell default stick deadzone. */
export const DEFAULT_GAMEPAD_DEADZONE: GamepadDeadzone = { kind: "axial", inner: 0.12, outer: 0.95 };

/** Resolve a {@link GamepadFeelConfig} into the options {@link resolveGamepadFrame} takes. */
export function gamepadFeelOptions(config: GamepadFeelConfig | undefined): ResolveGamepadFrameOptions {
  const deadzone = config?.deadzone;
  return {
    deadzone:
      deadzone === undefined
        ? DEFAULT_GAMEPAD_DEADZONE
        : typeof deadzone === "number"
          ? { kind: "axial", inner: deadzone, outer: DEFAULT_GAMEPAD_DEADZONE.outer }
          : deadzone,
    curve: config?.curve ?? 1,
    triggerDeadzone: config?.triggerDeadzone ?? 0,
  };
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

function clampUnit(value: number): number {
  return Number.isFinite(value) ? (value < -1 ? -1 : value > 1 ? 1 : value) : 0;
}

function rescale(magnitude: number, inner: number, outer: number, curve: number): number {
  if (magnitude <= inner) return 0;
  const normalized = magnitude >= outer ? 1 : (magnitude - inner) / (outer - inner);
  return curve === 1 ? normalized : Math.pow(normalized, curve);
}

const axisCodes = new Map<string, { index: number; sign: number } | null>();

function readAxis(code: GamepadCode): { index: number; sign: number } | null {
  let parsed = axisCodes.get(code);
  if (parsed === undefined) {
    const match = /^padaxis:(\d+)([+-])$/.exec(code);
    parsed = match === null ? null : { index: Number(match[1]), sign: match[2] === "+" ? 1 : -1 };
    axisCodes.set(code, parsed);
  }
  return parsed;
}

/**
 * Resolve one sampled gamepad into held actions and shaped analog action values. Sticks go through
 * the deadzone and curve; analog buttons (triggers) through `triggerDeadzone` and the same curve.
 * Pass `out` to reuse a frame across polls; it is cleared and returned.
 * @capability gamepad-input Resolve sampled gamepad input into actions with deadzones and response curves.
 */
export function resolveGamepadFrame(
  snapshot: GamepadSample,
  bindings: GamepadBindings,
  options: ResolveGamepadFrameOptions,
  out: GamepadFrame = { held: [], analog: {} },
): GamepadFrame {
  out.held.length = 0;
  for (const key in out.analog) delete out.analog[key];
  if (!snapshot.connected) return out;
  const inner = Math.max(0, options.deadzone.inner);
  const outer = Math.max(inner + Number.EPSILON, options.deadzone.outer);
  const curve = options.curve === undefined ? 1 : Math.max(Number.EPSILON, options.curve);
  const triggerInner = Math.min(0.99, Math.max(0, options.triggerDeadzone ?? 0));
  const radial = options.deadzone.kind === "radial";
  let radialFactor = 0;
  if (radial) {
    let sumSquares = 0;
    for (let index = 0; index < snapshot.axes.length; index += 1) {
      const value = clampUnit(snapshot.axes[index]);
      sumSquares += value * value;
    }
    const magnitude = Math.sqrt(sumSquares);
    radialFactor = magnitude === 0 ? 0 : rescale(Math.min(1, magnitude), inner, outer, curve) / magnitude;
  }

  for (const action in bindings) {
    let actionAnalog = 0;
    let isHeld = false;
    for (const code of bindingCodes(bindings[action])) {
      if (code.startsWith("pad:")) {
        const button = snapshot.buttons[Number(code.slice(4))];
        if (button === undefined) continue;
        const raw = Number.isFinite(button.value) ? Math.max(0, Math.min(1, button.value)) : 0;
        const value = rescale(raw, triggerInner, 1, curve);
        if (button.pressed && (value > 0 || raw === 0)) isHeld = true;
        if (value > actionAnalog) actionAnalog = value;
        continue;
      }
      const axis = readAxis(code);
      if (axis === null) continue;
      const raw = clampUnit(snapshot.axes[axis.index] ?? 0);
      const shaped = radial ? raw * radialFactor : Math.sign(raw) * rescale(Math.abs(raw), inner, outer, curve);
      const value = shaped * axis.sign;
      if (value > actionAnalog) actionAnalog = value;
    }
    if (isHeld || actionAnalog > 0) out.held.push(action);
    if (actionAnalog !== 0) out.analog[action] = actionAnalog;
  }
  return out;
}
