import type { PointerAxisState } from "../input/pointerAxis";
import { type AxisBinding, type AxisRange, sampleAxisBindings } from "../input/axisInput";

/** One client's input for a tick — the semantic held-action set plus pointer state, the serializable, over-the-wire counterpart of {@link InputSnapshot} the host stores per connected player. */
export interface InputFrame {
  held: readonly string[];
  pointer: PointerAxisState | null;
  /** Analog per-action magnitudes (0..1) for actions driven by a continuous source (virtual joystick, gamepad stick); absent/null means every held action is fully pressed. */
  analog?: Readonly<Record<string, number>> | null;
}

export interface InputSnapshot {
  /** Replaces the held-action set for this frame, rolling the previous held set forward for edge detection (#671). Called by the shell before `onTick` each frame; does not bump `ctx.version()` or notify `ctx.subscribe` listeners — per-frame publishes would storm subscribers. */
  publish(held: readonly string[]): void;
  /** Replaces the normalized pointer-position state for this frame (#293). Same no-notify contract as `publish`. */
  publishPointer(state: PointerAxisState | null): void;
  /** Replaces the analog per-action magnitudes for this frame (#1370) — the virtual joystick's continuous vector, split into 0..1 values per movement action. `null` clears back to digital-only. Same no-notify contract as `publish`. */
  publishAnalog(values: Readonly<Record<string, number>> | null): void;
  isDown(action: string): boolean;
  /** The held-action set for this frame — an owned, frozen array; the array {@link publish} was called with is never aliased or returned. */
  held(): readonly string[];
  /** True only on the frame `action` transitions from up to down (#671) — derived from the last two published held sets, so it stays replay-safe. */
  justPressed(action: string): boolean;
  /** True only on the frame `action` transitions from down to up (#671); mirrors {@link justPressed}. */
  justReleased(action: string): boolean;
  /** This frame's magnitude for `action`: its published analog value when one exists, else 1 while held / 0 while up. What `axis()` samples per code, so an analog stick steers proportionally where a key is all-or-nothing. */
  value(action: string): number;
  /** The published analog map for this frame, `null` when input is digital-only — an owned, frozen copy. */
  analog(): Readonly<Record<string, number>> | null;
  /** Pointer position over the play surface, `[-1, 1]` per axis with `+y` down, published by the shell each frame; `null` until the first pointer move. Frozen — an owned copy of what {@link publishPointer} was called with. */
  pointer(): Readonly<PointerAxisState> | null;
  /**
   * Instantaneous analog axis sample against the held-action set and current pointer (#533.7) — bind
   * throttle/steer/handbrake (or any axes) to *action names*, not raw key codes, since the held set is
   * semantic actions. Feed the result into an `AxisChannel` for smoothing; unlisted ranges default to
   * bipolar `[-1, 1]`, so pass `{ min: 0, max: 1 }` for one-directional pedals. Actions with a published
   * analog magnitude contribute that value instead of 0/1, so a virtual joystick steers proportionally.
   */
  axis<TAxes extends string>(
    bindings: Record<TAxes, AxisBinding>,
    ranges?: Partial<Record<TAxes, AxisRange>>,
  ): Record<TAxes, number>;
}

export function createInputSnapshot(): InputSnapshot {
  let heldSet = new Set<string>();
  let previousHeldSet = new Set<string>();
  let heldList: readonly string[] = [];
  let pointerState: Readonly<PointerAxisState> | null = null;
  let analogValues: Readonly<Record<string, number>> | null = null;

  const value = (action: string): number => {
    const analog = analogValues?.[action];
    if (analog !== undefined) return analog;
    return heldSet.has(action) ? 1 : 0;
  };

  return {
    publish(held) {
      previousHeldSet = heldSet;
      heldList = Object.freeze([...held]);
      heldSet = new Set(held);
    },
    publishPointer(state) {
      pointerState = state === null ? null : Object.freeze({ ...state });
    },
    publishAnalog(values) {
      analogValues = values === null ? null : Object.freeze({ ...values });
    },
    isDown: (action) => heldSet.has(action),
    held: () => heldList,
    pointer: () => pointerState,
    value,
    analog: () => analogValues,
    axis: (bindings, ranges) => sampleAxisBindings(bindings, (action) => heldSet.has(action), pointerState, ranges, value),
    justPressed: (action) => heldSet.has(action) && !previousHeldSet.has(action),
    justReleased: (action) => !heldSet.has(action) && previousHeldSet.has(action),
  };
}
