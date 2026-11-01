import { percentile } from "../devtools/frame";

/** Frame-time percentiles over the window, in milliseconds. */
export interface FrameTimePercentiles {
  frames: number;
  p50: number;
  p95: number;
  p99: number;
  maxMs: number;
}

/** A fixed-size ring of recent frame times. */
export interface FrameTimeWindow {
  /** Record one frame; non-finite and non-positive values are ignored. */
  push(frameMs: number): void;
  count(): number;
  full(): boolean;
  percentiles(): FrameTimePercentiles;
  reset(): void;
}

/** Keep the last `size` frame times and read percentiles over them; the ring never grows. */
export function createFrameTimeWindow(size: number): FrameTimeWindow {
  const capacity = Math.max(1, Math.floor(size));
  const ring = new Float64Array(capacity);
  let filled = 0;
  let next = 0;
  return {
    push(frameMs) {
      if (!Number.isFinite(frameMs) || frameMs <= 0) return;
      ring[next] = frameMs;
      next = (next + 1) % capacity;
      if (filled < capacity) filled += 1;
    },
    count: () => filled,
    full: () => filled === capacity,
    percentiles() {
      const sorted = Array.from(ring.subarray(0, filled)).sort((a, b) => a - b);
      return {
        frames: filled,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        maxMs: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
      };
    },
    reset() {
      filled = 0;
      next = 0;
    },
  };
}
