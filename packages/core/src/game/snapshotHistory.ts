/** Bounded past/future snapshot stacks — a serializable undo/redo record for any state `T`. */
export interface HistoryStacks<T> {
  readonly past: readonly T[];
  readonly future: readonly T[];
}

export interface HistoryStep<T> {
  snapshot: T;
  /** Stacks after the step. */
  stacks: HistoryStacks<T>;
}

/** @internal */
export function emptyHistory<T>(): HistoryStacks<T> {
  return { past: [], future: [] };
}

/** @internal */
export function canUndo<T>(stacks: HistoryStacks<T>): boolean {
  return stacks.past.length > 0;
}

/** @internal */
export function canRedo<T>(stacks: HistoryStacks<T>): boolean {
  return stacks.future.length > 0;
}

/**
 * Record `present` as the newest undo step and clear the redo future (a fresh action forks history).
 * The oldest past entries beyond `limit` are dropped so the stack stays bounded for save/transport.
  * @internal
  */
export function recordSnapshot<T>(stacks: HistoryStacks<T>, present: T, limit = 100): HistoryStacks<T> {
  const past = [...stacks.past, present];
  const trimmed = limit > 0 && past.length > limit ? past.slice(past.length - limit) : past;
  return { past: trimmed, future: [] };
}

/** @internal */
export function undoSnapshot<T>(stacks: HistoryStacks<T>, present: T): HistoryStep<T> | null {
  if (stacks.past.length === 0) return null;
  const snapshot = stacks.past[stacks.past.length - 1]!;
  return {
    snapshot,
    stacks: { past: stacks.past.slice(0, -1), future: [...stacks.future, present] },
  };
}

/** @internal */
export function redoSnapshot<T>(stacks: HistoryStacks<T>, present: T): HistoryStep<T> | null {
  if (stacks.future.length === 0) return null;
  const snapshot = stacks.future[stacks.future.length - 1]!;
  return {
    snapshot,
    stacks: { past: [...stacks.past, present], future: stacks.future.slice(0, -1) },
  };
}

export interface SnapshotHistory<T> {
  record(present: T): void;
  undo(present: T): T | null;
  redo(present: T): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  /** Current immutable stacks (for serialization). */
  stacks(): HistoryStacks<T>;
}

/** @internal */
export function createSnapshotHistory<T>(limit = 100): SnapshotHistory<T> {
  let stacks: HistoryStacks<T> = emptyHistory<T>();
  return {
    record(present) {
      stacks = recordSnapshot(stacks, present, limit);
    },
    undo(present) {
      const step = undoSnapshot(stacks, present);
      if (step === null) return null;
      stacks = step.stacks;
      return step.snapshot;
    },
    redo(present) {
      const step = redoSnapshot(stacks, present);
      if (step === null) return null;
      stacks = step.stacks;
      return step.snapshot;
    },
    canUndo() {
      return canUndo(stacks);
    },
    canRedo() {
      return canRedo(stacks);
    },
    clear() {
      stacks = emptyHistory<T>();
    },
    stacks() {
      return stacks;
    },
  };
}
