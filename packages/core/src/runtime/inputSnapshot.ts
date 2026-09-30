import type { PointerAxisState } from "../input/pointerAxis";
import { type AxisBinding, type AxisRange, sampleAxisBindings } from "../input/axisInput";
import { createHapticChannels, type HapticChannels } from "../input/haptics";

/** One discrete press, identified across retransmitted live input frames. */
export interface InputPress {
  action: string;
  seq: number;
}

/** One client's serializable held state and discrete edges for a simulation tick. */
export interface InputFrame {
  held: readonly string[];
  pointer: PointerAxisState | null;
  /** Discrete presses retained through release until the host accepts them. Each identity applies once, on its recorded simulation tick. */
  presses?: readonly InputPress[];
  /** Analog per-action magnitudes (0..1) for actions driven by a continuous source (virtual joystick, gamepad stick); absent/null means every held action is fully pressed. */
  analog?: Readonly<Record<string, number>> | null;
  /** Simulation tick (`ctx.sim.tick()`) the frame was captured for; hosts and replay align inputs on it. Absent from senders that predate the fixed-step loop. */
  tick?: number;
}

export interface InputSnapshot {
  /** Trigger controller vibration for a local user's gamepad when supported. */
  rumble(userId: string, options: { strong: number; weak: number; ms: number }): Promise<boolean>;
  /**
   * Continuous rumble channels for a local user (`engine`, `road`, `impact`, …): set levels each tick
   * and the shell mixes them by priority onto that user's pad. Local only — never in a snapshot or on the wire.
   */
  haptics(userId: string): HapticChannels;
  /** Replaces held state without notifying subscribers. Supplying `edges` buffers short presses until `beginStep`; `reset` discards the current owner's pending edges. Without `edges`, legacy publication-based edge detection is preserved. */
  publish(held: readonly string[], edges?: { pressed?: readonly string[]; reset?: boolean }): void;
  /** Sample buffered input once before a simulation step. Zero-step render frames retain presses; subsequent steps retire the sampled edges. */
  beginStep(): void;
  /** Replaces the normalized pointer-position state for this frame (#293). Same no-notify contract as `publish`. */
  publishPointer(state: PointerAxisState | null): void;
  /** Replaces the analog per-action magnitudes for this frame (#1370) — the virtual joystick's continuous vector, split into 0..1 values per movement action. `null` clears back to digital-only. Same no-notify contract as `publish`. */
  publishAnalog(values: Readonly<Record<string, number>> | null): void;
  isDown(action: string): boolean;
  /** The held-action set for this frame — an owned, frozen array; the array {@link publish} was called with is never aliased or returned. */
  held(): readonly string[];
  /** True on the sampled simulation step containing a press; legacy publishers use the last two held sets. */
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
  let buffered = false;
  let stepHeld = new Set<string>();
  const pendingPressed = new Set<string>();
  let stepPressed = new Set<string>();
  let stepReleased = new Set<string>();
  const haptics = new Map<string, HapticChannels>();

  const value = (action: string): number => {
    const analog = analogValues?.[action];
    if (analog !== undefined) return analog;
    return heldSet.has(action) ? 1 : 0;
  };

  return {
    rumble: async () => false,
    haptics(userId) {
      let channels = haptics.get(userId);
      if (channels === undefined) {
        channels = createHapticChannels();
        haptics.set(userId, channels);
      }
      return channels;
    },
    publish(held, edges) {
      previousHeldSet = heldSet;
      heldList = Object.freeze([...held]);
      heldSet = new Set(held);
      if (edges !== undefined) {
        buffered = true;
        if (edges.reset) {
          pendingPressed.clear();
          stepPressed.clear();
          stepReleased.clear();
          stepHeld = new Set(held);
        } else {
          for (const action of edges.pressed ?? []) pendingPressed.add(action);
        }
      }
    },
    beginStep() {
      buffered = true;
      stepPressed = new Set(pendingPressed);
      pendingPressed.clear();
      for (const action of heldSet) if (!stepHeld.has(action)) stepPressed.add(action);
      stepReleased = new Set([...stepHeld].filter(action => !heldSet.has(action)));
      stepHeld = new Set(heldSet);
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
    justPressed: (action) => buffered ? stepPressed.has(action) : heldSet.has(action) && !previousHeldSet.has(action),
    justReleased: (action) => buffered ? stepReleased.has(action) : !heldSet.has(action) && previousHeldSet.has(action),
  };
}
