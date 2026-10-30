/** When a paced schedule fires. Times are seconds on the caller's clock. */
export interface PacedScheduleConfig {
  /** Time of the first event. */
  firstAt: number;
  /** Seconds between events. 0 means one event only. */
  every: number;
  /** Each gap is every ± jitter, drawn from the injected rng. Default 0. Gap never below 0. */
  jitter?: number;
  /** Total events. Omitted means forever. */
  count?: number;
}

/** Plain JSON state of a paced schedule. */
export interface PacedScheduleState {
  /** Caller-clock time of the next event. */
  nextAt: number;
  /** Events already returned by `due`. */
  fired: number;
  /** Time `pause` was called, or `null` while running. */
  pausedAt: number | null;
}

/** A pace from a start time: ask what is due, pause, resume, retune the pace, or save its state. */
export interface PacedSchedule {
  /** Indices (0-based, in order) of events due at or before `now`; advances the state. At most `maxPerTick` per call; the rest come on later calls. Returns [] while paused or done. */
  due(now: number): number[];
  pause(now: number): void;
  /** Shifts the next event later by the time spent paused. */
  resume(now: number): void;
  /** Seconds from `now` to the next event, 0 if overdue, undefined when done or paused. */
  remaining(now: number): number | undefined;
  done(): boolean;
  /** Change the pace while running; the already-planned next event keeps its time. */
  retune(config: Partial<PacedScheduleConfig>): void;
  snapshot(): PacedScheduleState;
  restore(state: PacedScheduleState): void;
  /** Back to the start: next event at firstAt, nothing fired, not paused. */
  reset(): void;
}

const DEFAULT_MAX_PER_TICK = 16;

/**
 * A pace from a start time: every `due(now)` call returns the events that have come due,
 * drawing each jittered gap from the injected rng. No timers; the caller passes `now`.
 *
 * @capability paced-schedule fire events at a pace from a start time with jitter, count, pause and save
 */
export function createPacedSchedule(
  config: PacedScheduleConfig,
  rng: () => number,
  options?: { maxPerTick?: number },
): PacedSchedule {
  const maxPerTick = Math.max(1, Math.floor(options?.maxPerTick ?? DEFAULT_MAX_PER_TICK));
  let firstAt = config.firstAt;
  let every = Math.max(0, config.every);
  let jitter = Math.max(0, config.jitter ?? 0);
  let count = config.count;

  let nextAt = firstAt;
  let fired = 0;
  let pausedAt: number | null = null;

  function total(): number {
    if (every <= 0) return 1;
    return count ?? Number.POSITIVE_INFINITY;
  }

  function isDone(): boolean {
    return fired >= total();
  }

  function drawGap(): number {
    if (jitter <= 0) return every;
    return Math.max(0, every + (rng() * 2 - 1) * jitter);
  }

  return {
    due(now) {
      const indices: number[] = [];
      if (pausedAt !== null) return indices;
      while (indices.length < maxPerTick && !isDone() && nextAt <= now) {
        indices.push(fired);
        fired += 1;
        nextAt += drawGap();
      }
      return indices;
    },
    pause(now) {
      if (pausedAt === null && !isDone()) pausedAt = now;
    },
    resume(now) {
      if (pausedAt === null) return;
      nextAt += Math.max(0, now - pausedAt);
      pausedAt = null;
    },
    remaining(now) {
      if (isDone() || pausedAt !== null) return undefined;
      return Math.max(0, nextAt - now);
    },
    done: isDone,
    retune(patch) {
      if (patch.firstAt !== undefined) firstAt = patch.firstAt;
      if (patch.every !== undefined) every = Math.max(0, patch.every);
      if (patch.jitter !== undefined) jitter = Math.max(0, patch.jitter);
      if (patch.count !== undefined) count = patch.count;
    },
    snapshot() {
      return { nextAt, fired, pausedAt };
    },
    restore(state) {
      nextAt = state.nextAt;
      fired = state.fired;
      pausedAt = state.pausedAt;
    },
    reset() {
      nextAt = firstAt;
      fired = 0;
      pausedAt = null;
    },
  };
}
