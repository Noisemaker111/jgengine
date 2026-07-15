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
}

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
  /** True when the flat span reached the threshold and the run was long enough to judge it. */
  softlocked: boolean;
  /** Whether any probe sample was read at all. */
  probed: boolean;
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
  const softlocked =
    probed && durationMs >= options.softlockThresholdMs && softlockWindowMs >= options.softlockThresholdMs;
  return {
    seed: options.seed,
    framesElapsed: samples.length,
    durationMs,
    progressDelta: delta,
    totalProgress,
    softlockWindowMs,
    softlocked,
    probed,
  };
}
