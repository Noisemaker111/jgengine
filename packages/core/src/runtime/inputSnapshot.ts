import type { PointerAxisState } from "../input/pointerAxis";

export interface InputSnapshot {
  /** Replaces the held-action set for this frame. Called by the shell before `onTick` each frame; does not bump `ctx.version()` or notify `ctx.subscribe` listeners — per-frame publishes would storm subscribers. */
  publish(held: readonly string[]): void;
  /** Replaces the normalized pointer-position state for this frame (#293). Same no-notify contract as `publish`. */
  publishPointer(state: PointerAxisState | null): void;
  isDown(action: string): boolean;
  held(): readonly string[];
  /** Pointer position over the play surface, `[-1, 1]` per axis with `+y` down, published by the shell each frame; `null` until the first pointer move. */
  pointer(): PointerAxisState | null;
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
  };
}
