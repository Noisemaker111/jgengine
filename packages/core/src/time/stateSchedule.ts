export interface SchedulePhase<T> {
  state: T;
  durationSeconds: number;
}

export interface StateScheduleConfig<T> {
  phases: readonly SchedulePhase<T>[];
  /** Repeat the phase list forever (default); `false` clamps to the last phase after one pass. */
  loop?: boolean;
  /** Shifts the whole timeline so `t = 0` lands `offsetSeconds` into the cycle — staggers identical schedules. */
  offsetSeconds?: number;
}

export interface ScheduleSample<T> {
  state: T;
  /** Index into `phases`. */
  index: number;
  elapsedSeconds: number;
  /** Seconds until this phase ends; `Infinity` on the clamped final phase of a non-looping schedule. */
  remainingSeconds: number;
  /** Elapsed fraction of the phase in `[0, 1]`; `1` on the clamped final phase. */
  fraction: number;
}

export interface ScheduleWindow {
  start: number;
  end: number;
}

/**
 * A deterministic timeline of states — position-in-schedule is a pure function of absolute time,
 * so a forecast preview and the live state can never disagree. One primitive behind zoned weather
 * shifts, hazard cycles, and timetabled machinery: `stateAt`/`sampleAt` for the live state,
 * `nextTransitionAt` for countdowns, `windowsOf`/`nextWindow` for "when is it safe" forecasts.
 */
export interface StateSchedule<T> {
  /** Sum of all phase durations — one full cycle. */
  readonly cycleSeconds: number;
  stateAt(t: number): T;
  sampleAt(t: number): ScheduleSample<T>;
  /** Absolute time of the next phase boundary after `t`; `Infinity` once a non-looping schedule ends. */
  nextTransitionAt(t: number): number;
  /** All windows within `[fromT, fromT + horizonSeconds]` where the state matches. */
  windowsOf(match: (state: T) => boolean, fromT: number, horizonSeconds: number): ScheduleWindow[];
  /** The first matching window at or after `fromT` (looking ahead `horizonSeconds`, default one full cycle). */
  nextWindow(match: (state: T) => boolean, fromT: number, horizonSeconds?: number): ScheduleWindow | null;
}

export function createStateSchedule<T>(config: StateScheduleConfig<T>): StateSchedule<T> {
  if (config.phases.length === 0) throw new Error("state schedule needs at least one phase");
  const phases = config.phases.map((phase) => {
    if (!(phase.durationSeconds > 0)) {
      throw new Error(`schedule phase duration must be positive, got ${phase.durationSeconds}`);
    }
    return phase;
  });
  const loop = config.loop ?? true;
  const offset = config.offsetSeconds ?? 0;
  const starts: number[] = [];
  let cycleSeconds = 0;
  for (const phase of phases) {
    starts.push(cycleSeconds);
    cycleSeconds += phase.durationSeconds;
  }

  function localTime(t: number): number {
    const shifted = t + offset;
    if (loop) return ((shifted % cycleSeconds) + cycleSeconds) % cycleSeconds;
    return Math.max(0, shifted);
  }

  function sampleAt(t: number): ScheduleSample<T> {
    const local = localTime(t);
    if (!loop && local >= cycleSeconds) {
      const index = phases.length - 1;
      const phase = phases[index]!;
      return {
        state: phase.state,
        index,
        elapsedSeconds: local - starts[index]!,
        remainingSeconds: Number.POSITIVE_INFINITY,
        fraction: 1,
      };
    }
    let index = phases.length - 1;
    for (let i = 0; i < phases.length; i += 1) {
      if (local < starts[i]! + phases[i]!.durationSeconds) {
        index = i;
        break;
      }
    }
    const phase = phases[index]!;
    const elapsed = local - starts[index]!;
    return {
      state: phase.state,
      index,
      elapsedSeconds: elapsed,
      remainingSeconds: phase.durationSeconds - elapsed,
      fraction: Math.max(0, Math.min(1, elapsed / phase.durationSeconds)),
    };
  }

  function nextTransitionAt(t: number): number {
    const sample = sampleAt(t);
    if (!Number.isFinite(sample.remainingSeconds)) return Number.POSITIVE_INFINITY;
    return t + sample.remainingSeconds;
  }

  function windowsOf(match: (state: T) => boolean, fromT: number, horizonSeconds: number): ScheduleWindow[] {
    const windows: ScheduleWindow[] = [];
    const end = fromT + horizonSeconds;
    let cursor = fromT;
    let open: number | null = null;
    let guard = phases.length * (Math.ceil(horizonSeconds / cycleSeconds) + 2) + 2;
    while (cursor < end && guard > 0) {
      guard -= 1;
      const sample = sampleAt(cursor);
      const matches = match(sample.state);
      if (matches && open === null) open = cursor;
      const boundary = Number.isFinite(sample.remainingSeconds) ? cursor + sample.remainingSeconds : end;
      const stop = Math.min(boundary, end);
      if (!matches && open !== null) {
        windows.push({ start: open, end: cursor });
        open = null;
      }
      cursor = stop;
      if (!Number.isFinite(sample.remainingSeconds)) break;
    }
    if (open !== null) windows.push({ start: open, end: Math.min(cursor, end) });
    return windows;
  }

  return {
    cycleSeconds,
    stateAt: (t) => sampleAt(t).state,
    sampleAt,
    nextTransitionAt,
    windowsOf,
    nextWindow(match, fromT, horizonSeconds = cycleSeconds) {
      const windows = windowsOf(match, fromT, horizonSeconds);
      return windows.length > 0 ? windows[0]! : null;
    },
  };
}

export interface ClearWindowScan {
  fromSeconds: number;
  horizonSeconds: number;
  /** Sampling resolution; smaller catches shorter gaps. */
  stepSeconds: number;
  /** Reject windows shorter than this; default `0`. */
  minDurationSeconds?: number;
}

/**
 * Forward-scan any predicate-of-time — a timetable mover's "is the crossing clear at `t`" — for the
 * next open window. Sampling-based: pick `stepSeconds` at or below half the shortest gap that matters.
 */
export function nextClearWindow(isClear: (t: number) => boolean, scan: ClearWindowScan): ScheduleWindow | null {
  const minDuration = scan.minDurationSeconds ?? 0;
  const end = scan.fromSeconds + scan.horizonSeconds;
  let open: number | null = null;
  for (let t = scan.fromSeconds; t <= end; t += scan.stepSeconds) {
    if (isClear(t)) {
      if (open === null) open = t;
      continue;
    }
    if (open !== null) {
      if (t - open >= minDuration) return { start: open, end: t };
      open = null;
    }
  }
  if (open !== null && end - open >= minDuration) return { start: open, end };
  return null;
}
