import { SECONDS_PER_GAME_DAY } from "./gameClock";

export interface TimeConfig {
  /** Game-seconds that elapse per real second at 1× speed. Default 1 (real time). Sims-style compression sets this high (e.g. 60 → one real second is one in-game minute). */
  scale?: number;
  /** Selectable play/fast-forward multipliers for the speed control. Default [1, 2, 3, 4]. Pause (0×) is always available and separate. */
  speeds?: readonly number[];
  /** Game-seconds in one in-world day; drives the 24-hour calendar breakdown. Default 86400 (1 game-second = 1 clock-second). */
  dayLength?: number;
  /** Game-seconds already elapsed at boot — start the world at 08:00 with `8 * 3600`. Default 0. */
  start?: number;
  /** Boot with the clock paused. Default false. */
  startPaused?: boolean;
  /** In-world days per year, driving `calendar().year`/`dayOfYear`/`yearFraction`. Default 365. */
  daysPerYear?: number;
  /** Named season segments spanning the year in equal shares; when set, `calendar().season` names the current one. */
  seasons?: readonly string[];
}

export interface CalendarTime {
  /** Total game-seconds since the world started. */
  totalSeconds: number;
  /** 0-based day index. */
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Progress through the current day, 0..1. */
  dayFraction: number;
  /** 0-based year index, using `daysPerYear` (default 365). */
  year: number;
  /** 0-based day index within the current year. */
  dayOfYear: number;
  /** Progress through the current year, 0..1. */
  yearFraction: number;
  /** Current season name, present only when `TimeConfig.seasons` is configured. */
  season?: string;
}

export interface ClockSnapshot {
  now: number;
  paused: boolean;
  /** Speed-control multiplier — 0 while paused. The full game-time rate is `speed × timescale × scale`. */
  speed: number;
  /** The non-zero multiplier `play()` resumes to. */
  playSpeed: number;
  /** Global slow-motion/fast-forward multiplier; 1 unless `setTimescale` was called. */
  timescale: number;
  scale: number;
  speeds: readonly number[];
  calendar: CalendarTime;
}

export interface SimClock {
  /** Advance the world by a real-time delta; returns the scaled game-time delta (0 while paused) and fires any due timers. The shell calls this once per frame and passes the result to `loop.onTick`. */
  advance(realDt: number): number;
  now(): number;
  snapshot(): ClockSnapshot;
  calendar(): CalendarTime;
  isPaused(): boolean;
  speed(): number;
  pause(): void;
  play(): void;
  toggle(): void;
  /** Set the play multiplier; `0` (or negative) pauses, any positive value unpauses and becomes the resume speed. */
  setSpeed(multiplier: number): void;
  /** Step to the next configured speed (wraps); always unpauses. */
  cycleSpeed(): void;
  /** Current global timescale multiplier; 1 by default. */
  timescale(): number;
  /**
   * Global slow-motion/fast-forward multiplier composed with the speed control —
   * `advance` returns `realDt × scale × speed × timescale`. `0` freezes game time
   * without flipping pause state (`0.08` = bullet time, `2` = fast-forward); negative
   * or non-finite values clamp to 0. Timescale is host-authoritative: in multiplayer
   * it belongs to the host simulation, never to an individual client.
   */
  setTimescale(multiplier: number): void;
  /** Run `callback` once, `seconds` of game-time from now. Returns a cancel handle. */
  after(seconds: number, callback: () => void): () => void;
  /** Run `callback` every `seconds` of game-time. Returns a cancel handle. */
  every(seconds: number, callback: () => void): () => void;
  /** Run `callback` when game-time reaches the absolute `time` (game-seconds). Returns a cancel handle. */
  at(time: number, callback: () => void): () => void;
}

interface Timer {
  due: number;
  interval: number | null;
  callback: () => void;
}

const MAX_TIMER_FIRES_PER_ADVANCE = 10_000;

function requireFiniteTimerValue(label: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`SimClock ${label} must be finite, got ${value}`);
  }
  return value;
}

export interface SimClockOptions {
  config?: TimeConfig;
  /** Called on control changes and once per displayed in-game minute so UI can rebind; never fires per frame. */
  onChange?: () => void;
}

export function createSimClock(options: SimClockOptions = {}): SimClock {
  const config = options.config ?? {};
  const onChange = options.onChange ?? (() => {});
  const scale = config.scale !== undefined && config.scale > 0 ? config.scale : 1;
  const configuredSpeeds =
    config.speeds === undefined ? [1, 2, 3, 4] : config.speeds.filter((value) => value > 0);
  const speeds = configuredSpeeds.length > 0 ? configuredSpeeds : [1];
  const dayLength =
    config.dayLength !== undefined && config.dayLength > 0 ? config.dayLength : SECONDS_PER_GAME_DAY;
  const daysPerYear = config.daysPerYear !== undefined && config.daysPerYear > 0 ? config.daysPerYear : 365;
  const seasons = config.seasons;

  let now = config.start !== undefined && config.start > 0 ? config.start : 0;
  let paused = config.startPaused ?? false;
  let playSpeed = speeds[0]!;
  let timescale = 1;
  let nextTimerId = 0;
  const timers = new Map<number, Timer>();
  let displayMinute = minuteIndex(now, dayLength);

  function calendar(): CalendarTime {
    const day = Math.floor(now / dayLength);
    const dayFraction = (now - day * dayLength) / dayLength;
    const secondOfDay = dayFraction * 24 * 3600;
    const year = Math.floor(day / daysPerYear);
    const dayOfYear = day - year * daysPerYear;
    const yearFraction = (dayOfYear + dayFraction) / daysPerYear;
    const result: CalendarTime = {
      totalSeconds: now,
      day,
      hour: Math.floor(secondOfDay / 3600) % 24,
      minute: Math.floor(secondOfDay / 60) % 60,
      second: Math.floor(secondOfDay) % 60,
      dayFraction,
      year,
      dayOfYear,
      yearFraction,
    };
    if (seasons !== undefined && seasons.length > 0) {
      const segmentLength = daysPerYear / seasons.length;
      const index = Math.min(seasons.length - 1, Math.floor(dayOfYear / segmentLength));
      result.season = seasons[index];
    }
    return result;
  }

  function fireDueTimers(): void {
    let fires = 0;
    for (;;) {
      let soonest: { id: number; timer: Timer } | null = null;
      for (const [id, timer] of timers) {
        if (timer.due > now) continue;
        if (soonest === null || timer.due < soonest.timer.due) soonest = { id, timer };
      }
      if (soonest === null) return;
      const { id, timer } = soonest;
      if (timer.interval === null) {
        timers.delete(id);
      } else {
        timer.due += timer.interval;
      }
      timer.callback();
      fires += 1;
      if (fires >= MAX_TIMER_FIRES_PER_ADVANCE) return;
    }
  }

  function advance(realDt: number): number {
    if (paused || realDt <= 0 || timescale === 0) return 0;
    const gameDt = realDt * scale * playSpeed * timescale;
    now += gameDt;
    fireDueTimers();
    const minute = minuteIndex(now, dayLength);
    if (minute !== displayMinute) {
      displayMinute = minute;
      onChange();
    }
    return gameDt;
  }

  function pause(): void {
    if (paused) return;
    paused = true;
    onChange();
  }

  function play(): void {
    if (!paused) return;
    paused = false;
    onChange();
  }

  function setSpeed(multiplier: number): void {
    if (multiplier <= 0) {
      pause();
      return;
    }
    const changed = paused || multiplier !== playSpeed;
    playSpeed = multiplier;
    paused = false;
    if (changed) onChange();
  }

  function cycleSpeed(): void {
    const index = speeds.indexOf(playSpeed);
    setSpeed(speeds[(index + 1) % speeds.length]!);
  }

  function setTimescale(multiplier: number): void {
    const next = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 0;
    if (next === timescale) return;
    timescale = next;
    onChange();
  }

  function register(due: number, interval: number | null, callback: () => void): () => void {
    const id = nextTimerId;
    nextTimerId += 1;
    timers.set(id, { due, interval, callback });
    return () => {
      timers.delete(id);
    };
  }

  return {
    advance,
    now: () => now,
    calendar,
    snapshot: () => ({
      now,
      paused,
      speed: paused ? 0 : playSpeed,
      playSpeed,
      timescale,
      scale,
      speeds,
      calendar: calendar(),
    }),
    isPaused: () => paused,
    speed: () => (paused ? 0 : playSpeed),
    pause,
    play,
    toggle: () => (paused ? play() : pause()),
    setSpeed,
    cycleSpeed,
    timescale: () => timescale,
    setTimescale,
    after: (seconds, callback) =>
      register(now + Math.max(0, requireFiniteTimerValue("after(seconds)", seconds)), null, callback),
    every: (seconds, callback) => {
      const interval = Math.max(Number.EPSILON, requireFiniteTimerValue("every(seconds)", seconds));
      return register(now + interval, interval, callback);
    },
    at: (time, callback) => register(requireFiniteTimerValue("at(time)", time), null, callback),
  };
}

function minuteIndex(seconds: number, dayLength: number): number {
  return Math.floor((seconds / dayLength) * 24 * 60);
}
