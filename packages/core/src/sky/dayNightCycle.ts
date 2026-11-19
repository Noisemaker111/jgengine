/**
 * Turnkey day-night cycle: one serializable brain that advances a normalized day
 * fraction on an injected clock and blends per-keyframe phase labels and tint/light
 * colors. A game wires this one model and drives an existing sky/daylight seam from
 * `sample()` instead of hand-rolling a clock plus a color lerp.
 *
 * The model is genre-agnostic: `phase` labels and colors are free-form values the
 * game styles. The model never branches on what a phase string "means" — it only
 * interpolates between the keyframes you give it.
 */

import { lerp } from "../anim/easing";
import { mixHex } from "../render/color";
import { clamp01 } from "../math/scalar";

/** One day-night keyframe: at a normalized day position, the phase label and target colors the game styles. */
export interface DayNightKeyframe {
  /** Normalized day position in [0,1) where this keyframe sits; the cycle wraps past 1 back to 0. */
  at: number;
  /** Free-form phase label (e.g. `"dawn"`, `"day"`, `"dusk"`, `"night"`, or anything). The model never interprets it. */
  phase: string;
  color: string;
  lightColor?: string;
  /** Optional light level in [0,1] a presenter maps to intensity. Falls back to `1` when sampled. */
  intensity?: number;
}

export interface DayNightSample {
  /** Current normalized day fraction in [0,1). */
  dayFraction: number;
  phase: string;
  color: string;
  lightColor: string;
  /** Blended light level in [0,1]. */
  intensity: number;
}

export interface DayNightSnapshot {
  /** Accumulated game-time in ms since the cycle's zero, before wrapping into a day. */
  elapsedMs: number;
  paused: boolean;
  speed: number;
}

export interface DayNightCycleOptions {
  keyframes: readonly DayNightKeyframe[];
  /** Real milliseconds for one full day at speed 1. Default `120000` (two minutes). */
  dayLengthMs?: number;
  /** Normalized day fraction to start at, in [0,1). Default `0`. */
  start?: number;
  speed?: number;
  startPaused?: boolean;
  /** Injected clock in ms so advancement stays deterministic under test. Default `Date.now`. */
  now?: () => number;
}

export interface DayNightCycle {
  readonly keyframes: readonly DayNightKeyframe[];
  /** Real milliseconds for one full day at speed 1. */
  readonly dayLengthMs: number;
  /** Current normalized day fraction in [0,1), advanced from the injected clock. */
  dayFraction(): number;
  phase(): string;
  sample(): DayNightSample;
  sampleAt(fraction: number): DayNightSample;
  /**
   * Calendar adapter (`{ dayFraction }`) so the cycle drops straight into any
   * `{ calendar(): { dayFraction: number } }` sky/daylight seam that already
   * consumes a day fraction — no glue in the game.
   */
  calendar(): { dayFraction: number };
  /** Jump the clock to a normalized day fraction (wrapped into [0,1)). */
  setDayFraction(fraction: number): void;
  isPaused(): boolean;
  pause(): void;
  play(): void;
  toggle(): void;
  speed(): number;
  setSpeed(multiplier: number): void;
  subscribe(listener: () => void): () => void;
  snapshot(): DayNightSnapshot;
  restore(snapshot: DayNightSnapshot): void;
}

function wrap01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 1) + 1) % 1;
}

/** Sanitize a positive finite number, falling back to `fallback`. */
function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

interface NormalizedKeyframe {
  at: number;
  phase: string;
  color: string;
  lightColor: string;
  intensity: number;
}

/** Sort keyframes by wrapped `at` and fill in color/intensity fallbacks; never mutates the input. */
function normalizeKeyframes(keyframes: readonly DayNightKeyframe[]): NormalizedKeyframe[] {
  if (keyframes.length === 0) {
    throw new Error("createDayNightCycle requires at least one keyframe");
  }
  return keyframes
    .map((keyframe) => ({
      at: wrap01(keyframe.at),
      phase: keyframe.phase,
      color: keyframe.color,
      lightColor: keyframe.lightColor ?? keyframe.color,
      intensity: keyframe.intensity ?? 1,
    }))
    .sort((a, b) => a.at - b.at);
}

/** Blend the normalized keyframe ring at a wrapped day fraction. */
function sampleKeyframes(sorted: readonly NormalizedKeyframe[], fraction: number): DayNightSample {
  const dayFraction = wrap01(fraction);
  if (sorted.length === 1) {
    const only = sorted[0]!;
    return { dayFraction, phase: only.phase, color: only.color, lightColor: only.lightColor, intensity: only.intensity };
  }
  // Find the last keyframe at or before the fraction; the following one (wrapping past
  // 1.0 back to the first) is the segment we interpolate across.
  let fromIndex = sorted.length - 1;
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index]!.at <= dayFraction) fromIndex = index;
    else break;
  }
  const from = sorted[fromIndex]!;
  const to = sorted[(fromIndex + 1) % sorted.length]!;
  const span = (to.at - from.at + 1) % 1;
  const localRaw = (dayFraction - from.at + 1) % 1;
  const localT = span <= 0 ? 0 : clamp01(localRaw / span);
  return {
    dayFraction,
    phase: from.phase,
    color: mixHex(from.color, to.color, localT),
    lightColor: mixHex(from.lightColor, to.lightColor, localT),
    intensity: lerp(from.intensity, to.intensity, localT),
  };
}

/**
 * Creates a turnkey day-night cycle: a serializable model that advances a normalized
 * day fraction on an injected clock and blends per-keyframe phase labels and tint/light
 * colors. Wire this one model, then drive an existing sky/daylight seam from `sample()`
 * (or drop it straight into a `{ calendar(): { dayFraction } }` seam via `calendar()`)
 * to get a moving day-night cycle with color grading — no hand-rolled clock or lerp.
 * `phase` labels and colors are free-form; the model never interprets their meaning.
 *
 * @capability day-night-cycle one wired model gives a moving day-night cycle — running clock plus keyframed phase labels and tint/light colors a game drives an existing sky/daylight seam from
 */
export function createDayNightCycle(options: DayNightCycleOptions): DayNightCycle {
  const sorted = normalizeKeyframes(options.keyframes);
  const keyframes: readonly DayNightKeyframe[] = sorted.map((keyframe) => ({ ...keyframe }));
  const dayLengthMs = positiveOr(options.dayLengthMs, 120_000);
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();

  let elapsedMs = wrap01(options.start ?? 0) * dayLengthMs;
  let paused = options.startPaused ?? false;
  let speed = positiveOr(options.speed, 1);
  let anchor = now();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function sync(): void {
    const t = now();
    if (!paused) elapsedMs += Math.max(0, t - anchor) * speed;
    anchor = t;
  }

  function dayFraction(): number {
    sync();
    return wrap01(elapsedMs / dayLengthMs);
  }

  return {
    keyframes,
    dayLengthMs,
    dayFraction,
    phase() {
      return sampleKeyframes(sorted, dayFraction()).phase;
    },
    sample() {
      return sampleKeyframes(sorted, dayFraction());
    },
    sampleAt(fraction) {
      return sampleKeyframes(sorted, fraction);
    },
    calendar() {
      return { dayFraction: dayFraction() };
    },
    setDayFraction(fraction) {
      sync();
      elapsedMs = wrap01(fraction) * dayLengthMs;
      notify();
    },
    isPaused() {
      return paused;
    },
    pause() {
      if (paused) return;
      sync();
      paused = true;
      notify();
    },
    play() {
      if (!paused) return;
      sync();
      paused = false;
      notify();
    },
    toggle() {
      if (paused) this.play();
      else this.pause();
    },
    speed() {
      return speed;
    },
    setSpeed(multiplier) {
      sync();
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        if (!paused) {
          paused = true;
          notify();
        }
        return;
      }
      const changed = paused || multiplier !== speed;
      speed = multiplier;
      paused = false;
      if (changed) notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot() {
      sync();
      return { elapsedMs, paused, speed };
    },
    restore(snapshot) {
      elapsedMs = Number.isFinite(snapshot.elapsedMs) ? snapshot.elapsedMs : 0;
      paused = snapshot.paused;
      speed = positiveOr(snapshot.speed, 1);
      anchor = now();
      notify();
    },
  };
}
