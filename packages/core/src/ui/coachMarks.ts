/** Where a coach-mark callout sits relative to its anchor (or `"center"` for an unanchored callout). */
export type CoachMarkPlacement = "top" | "bottom" | "left" | "right" | "center";

/** One onboarding hint: an ordered, optionally-anchored, optionally-gated callout. */
export interface CoachMarkStep {
  /** Stable id — also the key tracked in the persisted "seen" set. */
  id: string;
  title: string;
  body?: string;
  /**
   * CSS selector (or a logical key the presenter resolves) for the element the
   * callout points at. Omitted → the step renders as a centered callout.
   */
  anchor?: string;
  /** Preferred side of the anchor. Default `"bottom"` when anchored, `"center"` otherwise. */
  placement?: CoachMarkPlacement;
  /**
   * Serializable trigger id. While set, the step stays hidden until that id is
   * in the sequence's satisfied set (see {@link CoachMarkSequence.satisfy}).
   * Kept data-first — a string, not a function — so a whole sequence serializes.
   */
  condition?: string;
}

/** The active step plus its position, returned by {@link CoachMarkSequence.current}. */
export interface CoachMarkView {
  /** The step to render. */
  step: CoachMarkStep;
  /** 0-based position of this step within the full ordered list. */
  index: number;
  /** Total number of steps in the sequence. */
  total: number;
  /** Un-seen steps left, including this one (for an "N of M" style counter). */
  remaining: number;
}

/** Serializable persisted state — the seen set (with timestamps) and satisfied triggers. */
export interface CoachMarkSnapshot {
  /** Ids of steps that have been advanced past, dismissed, or skipped. */
  seen: readonly string[];
  /** When each seen id was first marked, from the injected clock. */
  seenAt: Readonly<Record<string, number>>;
  /** Currently-satisfied trigger ids (gate state). */
  satisfied: readonly string[];
}

/** Options for {@link createCoachMarkSequence}. */
export interface CoachMarkSequenceOptions {
  /** Ordered hint steps. */
  steps: readonly CoachMarkStep[];
  /** Injected clock (ms) used to timestamp when a step is marked seen. Default `Date.now`. */
  now?: () => number;
  /** Ids of steps already seen (e.g. restored from a save) so they never re-show. */
  seen?: Iterable<string>;
  /** Trigger ids already satisfied when the sequence starts. */
  satisfied?: Iterable<string>;
}

/** An ordered, observable, serializable onboarding coach-mark run. */
export interface CoachMarkSequence {
  /** The configured steps, in order. */
  readonly steps: readonly CoachMarkStep[];
  /** First un-seen step whose condition (if any) is satisfied, or `null` when none is eligible. */
  current(): CoachMarkView | null;
  /** Mark the current step seen and return the next eligible step (or `null`). */
  advance(): CoachMarkView | null;
  /** Alias of {@link CoachMarkSequence.advance}. */
  next(): CoachMarkView | null;
  /** Mark a specific step seen so it never re-shows. */
  dismiss(id: string): void;
  /** Mark every step seen — "skip tour". */
  skipAll(): void;
  /** Add trigger ids to the satisfied set, un-gating any steps waiting on them. */
  satisfy(...triggerIds: string[]): void;
  /** Replace the satisfied trigger set wholesale (e.g. re-derived from game state). */
  setSatisfied(triggerIds: Iterable<string>): void;
  /** Whether the given trigger id is currently satisfied. */
  isTriggerSatisfied(triggerId: string): boolean;
  /** Whether a step id has been seen. */
  isSeen(id: string): boolean;
  /** Clock time a step was first seen, or `undefined` if not yet seen. */
  seenAt(id: string): number | undefined;
  /** True once every step has been seen. */
  isComplete(): boolean;
  /** How many steps remain un-seen (whether or not currently gated). */
  remaining(): number;
  /** Observe changes (advance, dismiss, satisfy, restore). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): CoachMarkSnapshot;
  /** Restore from a {@link CoachMarkSnapshot}. */
  restore(snapshot: CoachMarkSnapshot): void;
}

/**
 * An onboarding coach-mark run: an ordered sequence of hint steps, each shown as
 * a centered callout or anchored to a UI element, with a persisted "seen" set so
 * completed onboarding stays done across sessions, and data-first condition
 * gating so a step waits until its trigger id is satisfied. Advance/skip/dismiss
 * drive it; `snapshot`/`restore` round-trip the seen set through a save. Purely a
 * model — a React host renders `current()`.
 *
 * @capability coach-marks ordered, gated, persist-once onboarding coach-marks/tutorial callouts — anchored or centered steps with a seen set and Next/Skip
 */
export function createCoachMarkSequence(options: CoachMarkSequenceOptions): CoachMarkSequence {
  const steps = [...options.steps];
  const now = options.now ?? Date.now;
  const seenAtMap = new Map<string, number>();
  let satisfied = new Set<string>(options.satisfied ?? []);
  const listeners = new Set<() => void>();

  for (const id of options.seen ?? []) {
    if (!seenAtMap.has(id)) seenAtMap.set(id, now());
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function markSeen(id: string): boolean {
    if (seenAtMap.has(id)) return false;
    seenAtMap.set(id, now());
    return true;
  }

  function eligible(step: CoachMarkStep): boolean {
    if (seenAtMap.has(step.id)) return false;
    return step.condition === undefined || satisfied.has(step.condition);
  }

  function remaining(): number {
    let count = 0;
    for (const step of steps) if (!seenAtMap.has(step.id)) count += 1;
    return count;
  }

  function current(): CoachMarkView | null {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]!;
      if (eligible(step)) {
        return { step, index, total: steps.length, remaining: remaining() };
      }
    }
    return null;
  }

  return {
    steps,
    current,
    advance() {
      const active = current();
      if (active !== null && markSeen(active.step.id)) notify();
      return current();
    },
    next() {
      return this.advance();
    },
    dismiss(id) {
      if (markSeen(id)) notify();
    },
    skipAll() {
      let changed = false;
      for (const step of steps) if (markSeen(step.id)) changed = true;
      if (changed) notify();
    },
    satisfy(...triggerIds) {
      let changed = false;
      for (const id of triggerIds) {
        if (!satisfied.has(id)) {
          satisfied.add(id);
          changed = true;
        }
      }
      if (changed) notify();
    },
    setSatisfied(triggerIds) {
      satisfied = new Set(triggerIds);
      notify();
    },
    isTriggerSatisfied(triggerId) {
      return satisfied.has(triggerId);
    },
    isSeen(id) {
      return seenAtMap.has(id);
    },
    seenAt(id) {
      return seenAtMap.get(id);
    },
    isComplete() {
      return steps.every((step) => seenAtMap.has(step.id));
    },
    remaining,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      const seen: string[] = [];
      const seenAt: Record<string, number> = {};
      for (const [id, at] of seenAtMap) {
        seen.push(id);
        seenAt[id] = at;
      }
      return { seen, seenAt, satisfied: [...satisfied] };
    },
    restore(snapshot) {
      seenAtMap.clear();
      for (const id of snapshot.seen) {
        seenAtMap.set(id, snapshot.seenAt[id] ?? now());
      }
      satisfied = new Set(snapshot.satisfied);
      notify();
    },
  };
}
