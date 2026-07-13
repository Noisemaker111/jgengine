/** Bounded past/future snapshot stacks — a serializable undo/redo record for any state `T`. */
export interface HistoryStacks<T> {
  /** Prior states, oldest first; the last entry is the step an undo restores. */
  readonly past: readonly T[];
  /** Undone states awaiting redo, oldest first; the last entry is the step a redo restores. */
  readonly future: readonly T[];
}

/** The snapshot an undo/redo restores plus the advanced stacks. */
export interface HistoryStep<T> {
  /** State to apply as the new present. */
  snapshot: T;
  /** Stacks after the step. */
  stacks: HistoryStacks<T>;
}

/** Empty history stacks for state `T`. */
export function emptyHistory<T>(): HistoryStacks<T> {
  return { past: [], future: [] };
}

/** True when there is a prior state to undo to. */
export function canUndo<T>(stacks: HistoryStacks<T>): boolean {
  return stacks.past.length > 0;
}

/** True when there is an undone state to redo. */
export function canRedo<T>(stacks: HistoryStacks<T>): boolean {
  return stacks.future.length > 0;
}

/**
 * Record `present` as the newest undo step and clear the redo future (a fresh action forks history).
 * The oldest past entries beyond `limit` are dropped so the stack stays bounded for save/transport.
 */
export function recordSnapshot<T>(stacks: HistoryStacks<T>, present: T, limit = 100): HistoryStacks<T> {
  const past = [...stacks.past, present];
  const trimmed = limit > 0 && past.length > limit ? past.slice(past.length - limit) : past;
  return { past: trimmed, future: [] };
}

/**
 * Step back: pop the newest past snapshot to apply as the new present, and push the given `present`
 * onto the future for a later redo. Returns `null` when there is nothing to undo.
 */
export function undoSnapshot<T>(stacks: HistoryStacks<T>, present: T): HistoryStep<T> | null {
  if (stacks.past.length === 0) return null;
  const snapshot = stacks.past[stacks.past.length - 1]!;
  return {
    snapshot,
    stacks: { past: stacks.past.slice(0, -1), future: [...stacks.future, present] },
  };
}

/**
 * Step forward: pop the newest future snapshot to apply as the new present, and push the given
 * `present` back onto the past. Returns `null` when there is nothing to redo.
 */
export function redoSnapshot<T>(stacks: HistoryStacks<T>, present: T): HistoryStep<T> | null {
  if (stacks.future.length === 0) return null;
  const snapshot = stacks.future[stacks.future.length - 1]!;
  return {
    snapshot,
    stacks: { past: [...stacks.past, present], future: stacks.future.slice(0, -1) },
  };
}

/** Stateful undo/redo handle over {@link HistoryStacks}, holding the stacks in a closure. */
export interface SnapshotHistory<T> {
  /** Record `present` as a new undo step and clear the redo future. */
  record(present: T): void;
  /** Undo, returning the restored snapshot or `null` if there is nothing to undo. */
  undo(present: T): T | null;
  /** Redo, returning the restored snapshot or `null` if there is nothing to redo. */
  redo(present: T): T | null;
  /** True when an undo is available. */
  canUndo(): boolean;
  /** True when a redo is available. */
  canRedo(): boolean;
  /** Drop all history. */
  clear(): void;
  /** Current immutable stacks (for serialization). */
  stacks(): HistoryStacks<T>;
}

/**
 * Stateful undo/redo handle wrapping the pure snapshot functions. Call `record(state)` before each
 * mutation; `undo`/`redo` return the state to apply. `limit` bounds the past stack.
 */
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
