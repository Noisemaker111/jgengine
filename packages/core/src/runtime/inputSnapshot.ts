export interface InputSnapshot {
  /** Replaces the held-action set for this frame. Called by the shell before `onTick` each frame; does not bump `ctx.version()` or notify `ctx.subscribe` listeners — per-frame publishes would storm subscribers. */
  publish(held: readonly string[]): void;
  isDown(action: string): boolean;
  held(): readonly string[];
}

export function createInputSnapshot(): InputSnapshot {
  let heldSet = new Set<string>();
  let heldList: readonly string[] = [];

  return {
    publish(held) {
      heldList = held;
      heldSet = new Set(held);
    },
    isDown: (action) => heldSet.has(action),
    held: () => heldList,
  };
}
