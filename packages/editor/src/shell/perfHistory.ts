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
