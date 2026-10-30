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

/** One phase of a {@link PhaseSchedule}: a named state that ends on its own duration or when the caller advances it. */
export interface PhaseSpec<T> {
  state: T;
  /** Seconds this phase holds before it ends on its own; omit it for a phase that only `advance()` ends. */
  durationSeconds?: number;
}

/** Named states one after another, each ended by its own duration or by the caller. */
export interface PhaseScheduleConfig<T> {
  phases: readonly PhaseSpec<T>[];
  /** Wrap from the last phase back to the first (default `false`: the last phase ends the schedule). */
  loop?: boolean;
}

/** One phase change a {@link PhaseSchedule.tick} made. */
export interface PhaseStep<T> {
  from: T;
  to: T;
  /** True when the change wrapped from the last phase back to the first. */
  wrapped: boolean;
}

/** Plain JSON position in a phase schedule. */
export interface PhaseScheduleState {
  index: number;
  elapsedSeconds: number;
  /** True once the last phase of a non-looping schedule has ended. */
  ended: boolean;
}

/**
 * The stateful sibling of {@link StateSchedule}: where that one answers "which state is `t`" for any
 * absolute time, this one holds where the phases actually are. A phase with `durationSeconds` ends by
 * itself inside `tick(dt)`; a phase without one holds until the caller says `advance()`, so a match's
 * buy→live→end cycle and a ride's load→ride→unload cycle are the same list with different durations.
 * `snapshot()`/`restore()` round-trip where it stands, so a save resumes mid-phase.
 */
export interface PhaseSchedule<T> {
  readonly size: number;
  state(): T;
  index(): number;
  /** Seconds left in the current phase; `null` while it waits for `advance()`, `0` once it has ended. */
  remainingSeconds(): number | null;
  /** Elapsed fraction of a timed phase in `[0, 1]`; `0` on a phase that waits for `advance()`. */
  fraction(): number;
  /** True once the last phase of a non-looping schedule ended; `advance()` is then a no-op. */
  ended(): boolean;
  /** End the current phase now. Returns the state entered; stays put at the end of a non-looping schedule. */
  advance(): T;
  /** Jump to the phase whose state is `state`, clearing its elapsed time; false when the list has no such phase. */
  enter(state: T): boolean;
  /** Advance by `dt` through every timed phase it ends, in order. Phases without a duration never end here. */
  tick(dt: number): PhaseStep<T>[];
  /** Back to the first phase, elapsed cleared, `ended()` false. */
  reset(): void;
  snapshot(): PhaseScheduleState;
  restore(state: PhaseScheduleState): void;
}

/** A phase after validation: its state and the seconds it holds, or `null` when it waits for `advance()`. */
interface PhaseClock<T> {
  readonly state: T;
  readonly durationSeconds: number | null;
}

function phaseClock<T>(phases: readonly PhaseClock<T>[], at: number): PhaseClock<T> {
  const phase = phases[at];
  if (phase === undefined) throw new Error(`phase schedule has no phase ${at}`);
  return phase;
}

/**
 * A stateful timeline of named phases, ended by their own durations or by `advance()`.
 *
 * @capability phase-schedule advance named phases by time or by event, with snapshot/restore
 */
export function createPhaseSchedule<T>(config: PhaseScheduleConfig<T>): PhaseSchedule<T> {
  if (config.phases.length === 0) throw new Error("phase schedule needs at least one phase");
  const phases: PhaseClock<T>[] = config.phases.map((phase, index) => {
    const durationSeconds = phase.durationSeconds;
    if (durationSeconds === undefined) return { state: phase.state, durationSeconds: null };
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      throw new Error(`schedule phase ${index} needs a finite duration of at least zero, got ${durationSeconds}`);
    }
    return { state: phase.state, durationSeconds };
  });
  const loop = config.loop ?? false;
  const last = phases.length - 1;
  let index = 0;
  let elapsedSeconds = 0;
  let ended = false;
  let current = phaseClock(phases, 0);

  function enterAt(at: number, carrySeconds: number): void {
    current = phaseClock(phases, at);
    index = at;
    elapsedSeconds = carrySeconds;
    ended = false;
  }

  function nextIndex(): number {
    return index === last ? 0 : index + 1;
  }

  function advance(): T {
    if (ended) return current.state;
    if (index === last && !loop) {
      ended = true;
      return current.state;
    }
    enterAt(nextIndex(), 0);
    return current.state;
  }

  return {
    size: phases.length,
    state: () => current.state,
    index: () => index,
    remainingSeconds() {
      if (ended) return 0;
      return current.durationSeconds === null ? null : Math.max(0, current.durationSeconds - elapsedSeconds);
    },
    fraction() {
      if (ended) return 1;
      const duration = current.durationSeconds;
      if (duration === null) return 0;
      if (duration <= 0) return 1;
      return Math.max(0, Math.min(1, elapsedSeconds / duration));
    },
    ended: () => ended,
    advance,
    enter(state) {
      const found = phases.findIndex((phase) => phase.state === state);
      if (found < 0) return false;
      enterAt(found, 0);
      return true;
    },
    tick(dt) {
      const steps: PhaseStep<T>[] = [];
      if (!(dt > 0) || ended) return steps;
      elapsedSeconds += dt;
      let guard = phases.length * 2 + 2;
      while (guard > 0) {
        guard -= 1;
        const duration = current.durationSeconds;
        if (duration === null || elapsedSeconds < duration) break;
        if (index === last && !loop) {
          elapsedSeconds = duration;
          ended = true;
          break;
        }
        const from = current.state;
        const wrapped = index === last;
        const carry = elapsedSeconds - duration;
        enterAt(nextIndex(), carry);
        steps.push({ from, to: current.state, wrapped });
      }
      return steps;
    },
    reset() {
      enterAt(0, 0);
    },
    snapshot: () => ({ index, elapsedSeconds, ended }),
    restore(state) {
      const at = Number.isFinite(state.index) ? Math.max(0, Math.min(last, Math.floor(state.index))) : 0;
      enterAt(at, 0);
      const duration = current.durationSeconds;
      const elapsed = Number.isFinite(state.elapsedSeconds) ? Math.max(0, state.elapsedSeconds) : 0;
      elapsedSeconds = duration === null ? 0 : Math.min(duration, elapsed);
      ended = state.ended;
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
