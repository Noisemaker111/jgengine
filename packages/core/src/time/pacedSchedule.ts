/** When a paced schedule fires. Times are seconds on the caller's clock. */
export interface PacedScheduleConfig {
  firstAt: number;
  /** Seconds between events. 0 means one event only. */
  every: number;
  /** Each gap is every ± jitter, drawn from the injected rng. Default 0. Gap never below 0. */
  jitter?: number;
  count?: number;
}

export interface PacedScheduleState {
  nextAt: number;
  fired: number;
  pausedAt: number | null;
}

export interface PacedSchedule {
  /** Indices (0-based, in order) of events due at or before `now`; advances the state. At most `maxPerTick` per call; the rest come on later calls. Returns [] while paused or done. */
  due(now: number): number[];
  pause(now: number): void;
  resume(now: number): void;
  /** Seconds from `now` to the next event, 0 if overdue, undefined when done or paused. */
  remaining(now: number): number | undefined;
  done(): boolean;
  retune(config: Partial<PacedScheduleConfig>): void;
  snapshot(): PacedScheduleState;
  restore(state: PacedScheduleState): void;
  reset(): void;
}

const DEFAULT_MAX_PER_TICK = 16;

/** @capability paced-schedule fire events at a pace from a start time with jitter, count, pause and save */
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
