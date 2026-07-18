import type { EditorPerfSample } from "../session";

/**
 * Rolling history of real {@link EditorPerfSample}s for the Profiler dock tab's frame-time graph.
 * Fed by the same 500ms host poll the toolbar pill uses; never fabricates values. Kept outside
 * React state so recording continues while the profiler tab is closed without rerendering anything.
 */
export interface PerfHistoryStore {
  push(sample: EditorPerfSample): void;
  getSamples(): readonly EditorPerfSample[];
  clear(): void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  subscribe(listener: () => void): () => void;
}

/** Samples retained (~2 minutes at the 500ms poll). */
export const PERF_HISTORY_CAPACITY = 240;

/** Creates the rolling perf-sample history store. */
export function createPerfHistoryStore(): PerfHistoryStore {
  let samples: EditorPerfSample[] = [];
  let paused = false;
  let lastSampledAt = -1;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    push(sample) {
      if (paused) return;
      // The host poll re-reads the same sample between probe windows; only record fresh ones.
      if (sample.sampledAt === lastSampledAt) return;
      lastSampledAt = sample.sampledAt;
      samples = [...samples, sample];
      if (samples.length > PERF_HISTORY_CAPACITY) samples = samples.slice(samples.length - PERF_HISTORY_CAPACITY);
      emit();
    },
    getSamples: () => samples,
    clear() {
      samples = [];
      lastSampledAt = -1;
      emit();
    },
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      emit();
    },
    isPaused: () => paused,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Mean of a numeric series, 0 for empty input. */
export function seriesAverage(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/**
 * Mean of defined values only — used for optional series (`simMs` / `outsideMs` / `memoryMb`)
 * so zeros from absent samples do not drag the average down.
 */
export function seriesAverageDefined(values: readonly (number | undefined)[]): number {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value === undefined) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/** Builds an SVG polyline `points` string for a series scaled into a width×height box. */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  maxValue: number,
): string {
  if (values.length === 0 || maxValue <= 0) return "";
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const x = values.length > 1 ? index * step : width / 2;
      const y = height - Math.min(1, value / maxValue) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Minimal frame-stats shape consumed when folding core `devtools.frame.stats()` into a sample. */
export interface FrameBudgetStatsInput {
  avgSimMs: number;
  avgOutsideMs: number;
  phases: readonly { name: string; avgMs: number }[];
}

/** Optional sim / outside / phase fields derived from real frame-tracker stats (never invented). */
export interface FrameBudgetFields {
  simMs: number;
  outsideMs: number;
  phases?: readonly { name: string; avgMs: number }[];
}

const MAX_PHASES_IN_SAMPLE = 6;

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Map core `devtools.frame.stats()` into optional editor sample fields.
 * Returns `null` when the frame tracker has no samples yet — callers must omit the series entirely.
 */
export function frameBudgetFromStats(stats: FrameBudgetStatsInput | null): FrameBudgetFields | null {
  if (stats === null) return null;
  const phases = stats.phases
    .filter((phase) => Number.isFinite(phase.avgMs) && phase.avgMs > 0 && phase.name.length > 0)
    .slice(0, MAX_PHASES_IN_SAMPLE)
    .map((phase) => ({ name: phase.name, avgMs: roundMs(phase.avgMs) }));
  return {
    simMs: roundMs(stats.avgSimMs),
    outsideMs: roundMs(stats.avgOutsideMs),
    ...(phases.length > 0 ? { phases } : {}),
  };
}

/** True when any sample carries real sim/outside budget fields from the frame tracker. */
export function samplesHaveFrameBudget(samples: readonly EditorPerfSample[]): boolean {
  return samples.some((sample) => sample.simMs !== undefined && sample.outsideMs !== undefined);
}

/**
 * Latest non-empty phase list from the history (newest sample that reported phases).
 * Empty when no named `measure()` marks have been recorded.
 */
export function latestPhases(
  samples: readonly EditorPerfSample[],
): readonly { name: string; avgMs: number }[] {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const phases = samples[index]?.phases;
    if (phases !== undefined && phases.length > 0) return phases;
  }
  return [];
}
