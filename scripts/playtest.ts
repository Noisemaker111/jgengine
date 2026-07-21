/**
 * Bot-playtest metric logic: turn a series of progress-probe samples (read
 * from a game's `capture.probe` hook via `drive --playtest`) into a verdict on
 * whether the loop actually advances under input. Genre-agnostic — a "metric"
 * is any number the game reports (score, position, distance, phase); progress
 * is any metric moving beyond `epsilon`. A span where every metric stays flat
 * longer than the softlock threshold, while input is being driven, is a
 * softlock. Pure and WebGL-free so the ruling is unit-testable on synthetic
 * samples; the browser half lives in `scripts/drive-dev.ts`.
 */

export interface ProbeSample {
  /** Milliseconds since sampling began. */
  t: number;
  /** Flat map of the game's progress metrics at this instant. */
  metrics: Record<string, number>;
}

export interface PlaytestOptions {
  seed: number;
  /** A flat span this long (ms) under active input is a softlock. */
  softlockThresholdMs: number;
  /** A metric moving by more than this counts as progress. */
  epsilon: number;
  /**
   * rAF frames the page actually rendered under input across the sampled run.
   * When provided, a softlock verdict is only trusted if the run rendered fast
   * enough to tell "stuck" apart from "frame-starved": on a software-GL host
   * (~2fps) held-key motion barely advances per frame, so a flat window reads
   * as a softlock that is really just slow rendering (issue #1506). Below
   * {@link minEffectiveFps} such a run is reported inconclusive, not softlocked.
   * Omit to skip the frame-rate gate entirely (legacy behavior).
   */
  framesRendered?: number;
  /**
   * Effective-FPS floor below which a flat run is inconclusive rather than a
   * softlock. Defaults to {@link DEFAULT_MIN_EFFECTIVE_FPS}. Ignored when
   * {@link framesRendered} is omitted.
   */
  minEffectiveFps?: number;
}

/**
 * Below this rendered FPS a flat playtest window is treated as frame-starvation,
 * not a genuine softlock. Real hardware GL sustains 30–60fps, so a softlock
 * there still shows plenty of frames; software GL (cloud, ~1–2fps) never clears
 * this bar, so its unavoidable flatness never masquerades as a stuck loop.
 */
export const DEFAULT_MIN_EFFECTIVE_FPS = 10;

export interface PlaytestResult {
  seed: number;
  /** Number of probe samples that returned metrics (0 = game exposed no probe). */
  framesElapsed: number;
  /** Wall-clock span the samples cover, ms. */
  durationMs: number;
  /** Net change (last − first) per metric across the run. */
  progressDelta: Record<string, number>;
  /** Sum of the absolute net changes — one scalar for "did anything move". */
  totalProgress: number;
  /** Longest contiguous span (ms) where every metric held flat within epsilon. */
  softlockWindowMs: number;
  /** True when the flat span reached the threshold and the run rendered fast enough to trust it. */
  softlocked: boolean;
  /** Whether any probe sample was read at all. */
  probed: boolean;
  /** rAF frames the page rendered under input over the run; undefined when not measured. */
  framesRendered?: number;
  /** Rendered frames per second (framesRendered / durationSec); undefined when not measured or duration is 0. */
  effectiveFps?: number;
  /**
   * True when progress stayed flat long enough to look like a softlock but the
   * run rendered too few frames per second to trust the verdict — the render
   * was frame-starved (software GL), so use the deterministic stepping rung
   * instead of reading a softlock into it (issue #1506).
   */
  inconclusive: boolean;
}

function metricKeys(samples: readonly ProbeSample[]): string[] {
  const keys = new Set<string>();
  for (const sample of samples) {
    for (const key of Object.keys(sample.metrics)) keys.add(key);
  }
  return [...keys];
}

/** Net change (last − first) for every metric that appears in the samples. */
export function progressDelta(samples: readonly ProbeSample[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of metricKeys(samples)) {
    let first: number | undefined;
    let last: number | undefined;
    for (const sample of samples) {
      const value = sample.metrics[key];
      if (value === undefined) continue;
      if (first === undefined) first = value;
      last = value;
    }
    if (first !== undefined && last !== undefined) out[key] = last - first;
  }
  return out;
}

/**
 * Longest contiguous time span (ms) across which every metric's range
 * (max − min over the samples in the span) stays within `epsilon`. A bot that
 * circles back to its start still shows a wide range and reads as moving; only
 * a genuinely stuck loop stays flat. Ranges only widen as a window grows, so
 * once a window breaks flatness every superset does too — the inner loop bails.
 */
export function longestFlatWindowMs(samples: readonly ProbeSample[], epsilon: number): number {
  if (samples.length < 2) return 0;
  const keys = metricKeys(samples);
  let best = 0;
  for (let start = 0; start < samples.length; start += 1) {
    const min: Record<string, number> = {};
    const max: Record<string, number> = {};
    for (let end = start; end < samples.length; end += 1) {
      const metrics = samples[end]!.metrics;
      for (const key of keys) {
        const value = metrics[key];
        if (value === undefined) continue;
        min[key] = key in min ? Math.min(min[key]!, value) : value;
        max[key] = key in max ? Math.max(max[key]!, value) : value;
      }
      let flat = true;
      for (const key of Object.keys(max)) {
        if (max[key]! - min[key]! > epsilon) {
          flat = false;
          break;
        }
      }
      if (!flat) break;
      const span = samples[end]!.t - samples[start]!.t;
      if (span > best) best = span;
    }
  }
  return best;
}

/** Fold a run of probe samples into the playtest verdict. */
export function summarizePlaytest(samples: readonly ProbeSample[], options: PlaytestOptions): PlaytestResult {
  const probed = samples.length > 0;
  const delta = progressDelta(samples);
  const totalProgress = Object.values(delta).reduce((sum, value) => sum + Math.abs(value), 0);
  const softlockWindowMs = longestFlatWindowMs(samples, options.epsilon);
  const durationMs = probed ? samples[samples.length - 1]!.t - samples[0]!.t : 0;
  const flatEnough =
    probed && durationMs >= options.softlockThresholdMs && softlockWindowMs >= options.softlockThresholdMs;
  const durationSec = durationMs / 1000;
  const effectiveFps =
    options.framesRendered !== undefined && durationSec > 0 ? options.framesRendered / durationSec : undefined;
  const minEffectiveFps = options.minEffectiveFps ?? DEFAULT_MIN_EFFECTIVE_FPS;
  // A flat window on a frame-starved render (software GL) is indistinguishable
  // from a genuine softlock, so it is inconclusive — never a softlock verdict.
  const frameStarved = effectiveFps !== undefined && effectiveFps < minEffectiveFps;
  const softlocked = flatEnough && !frameStarved;
  const inconclusive = flatEnough && frameStarved;
  return {
    seed: options.seed,
    framesElapsed: samples.length,
    durationMs,
    progressDelta: delta,
    totalProgress,
    softlockWindowMs,
    softlocked,
    probed,
    framesRendered: options.framesRendered,
    effectiveFps,
    inconclusive,
  };
}
