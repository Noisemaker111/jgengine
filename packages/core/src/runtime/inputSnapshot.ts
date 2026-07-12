import type { PointerAxisState } from "../input/pointerAxis";
import { type AxisBinding, type AxisRange, sampleAxisBindings } from "../input/axisInput";

/** One client's input for a tick — the semantic held-action set plus pointer state, the serializable, over-the-wire counterpart of {@link InputSnapshot} the host stores per connected player. */
export interface InputFrame {
  held: readonly string[];
  pointer: PointerAxisState | null;
}

export interface InputSnapshot {
  /** Replaces the held-action set for this frame. Called by the shell before `onTick` each frame; does not bump `ctx.version()` or notify `ctx.subscribe` listeners — per-frame publishes would storm subscribers. */
  publish(held: readonly string[]): void;
  /** Replaces the normalized pointer-position state for this frame (#293). Same no-notify contract as `publish`. */
  publishPointer(state: PointerAxisState | null): void;
  isDown(action: string): boolean;
  held(): readonly string[];
  /** Pointer position over the play surface, `[-1, 1]` per axis with `+y` down, published by the shell each frame; `null` until the first pointer move. */
  pointer(): PointerAxisState | null;
  /**
   * Instantaneous analog axis sample against the held-action set and current pointer (#533.7) — bind
   * throttle/steer/handbrake (or any axes) to *action names*, not raw key codes, since the held set is
   * semantic actions. Feed the result into an `AxisChannel` for smoothing; unlisted ranges default to
   * bipolar `[-1, 1]`, so pass `{ min: 0, max: 1 }` for one-directional pedals.
   */
  axis<TAxes extends string>(
    bindings: Record<TAxes, AxisBinding>,
    ranges?: Partial<Record<TAxes, AxisRange>>,
  ): Record<TAxes, number>;
}

export function createInputSnapshot(): InputSnapshot {
  let heldSet = new Set<string>();
  let heldList: readonly string[] = [];
  let pointerState: PointerAxisState | null = null;

  return {
    publish(held) {
      heldList = held;
      heldSet = new Set(held);
    },
    publishPointer(state) {
      pointerState = state;
    },
    isDown: (action) => heldSet.has(action),
    held: () => heldList,
    pointer: () => pointerState,
    axis: (bindings, ranges) => sampleAxisBindings(bindings, (action) => heldSet.has(action), pointerState, ranges),
  };
}
