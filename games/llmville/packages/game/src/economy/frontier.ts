/** Benchmark the frontier sits at on a world's first day; the starter fine-tune is calibrated here. */
export const FRONTIER_BASELINE = 50;

/** How many benchmark points the frontier climbs per real-world day of a world's life. */
export const FRONTIER_RISE_PER_DAY = 2;

/** Highest benchmark any catalog model can reach; the effective frontier is capped just above it. */
export const FRONTIER_CATALOG_BENCHMARK_CEILING = 90;

/** Hard cap on the effective frontier so global release jumps cannot grow without bound. */
export const FRONTIER_MAX_BENCHMARK = FRONTIER_CATALOG_BENCHMARK_CEILING + 30;

/** Income multiplier lost per benchmark point the frontier leads a model. */
export const FRONTIER_DECAY_PER_POINT = 0.04;

/** Floor on frontier decay — even stale models retain a trickle of demand. */
export const FRONTIER_DECAY_FLOOR = 0.05;

/** TPS the market absorbs per benchmark point before stacking compute saturates demand. */
export const DEMAND_MARKET_TPS_PER_BENCHMARK = 0.05;

/** Floor on demand saturation when over-supplying a model. */
export const DEMAND_SATURATION_FLOOR = 0.15;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function frontierDaysElapsed(nowMs: number, gameCreatedAtMs: number): number {
  return Math.max(0, (nowMs - gameCreatedAtMs) / MS_PER_DAY);
}

/** The SOTA benchmark a world faces: baseline at creation, rising with the world's age. */
export function computeFrontierBenchmark(
  nowMs: number = Date.now(),
  gameCreatedAtMs: number = nowMs,
): number {
  return FRONTIER_BASELINE + frontierDaysElapsed(nowMs, gameCreatedAtMs) * FRONTIER_RISE_PER_DAY;
}

export function clampFrontierBenchmark(benchmark: number): number {
  return Math.min(FRONTIER_MAX_BENCHMARK, Math.max(FRONTIER_BASELINE, benchmark));
}

/** World-age frontier plus the clamped global release offset, or a per-world override. */
export function computeEffectiveFrontierBenchmark(params: {
  nowMs?: number;
  gameCreatedAtMs?: number;
  frontierOffset?: number;
  gameOverride?: number;
} = {}): number {
  if (params.gameOverride !== undefined) return params.gameOverride;
  const nowMs = params.nowMs ?? Date.now();
  return clampFrontierBenchmark(
    computeFrontierBenchmark(nowMs, params.gameCreatedAtMs ?? nowMs) + (params.frontierOffset ?? 0),
  );
}

/**
 * Models decay as the frontier climbs past their benchmark. A model trained at world start holds full
 * income for days and drifts toward the floor over roughly two real weeks.
 */
export function computeFrontierDecayMultiplier(
  modelBenchmark: number,
  frontierBenchmark: number,
  trainedAt?: number,
  frontierBenchmarkAtTrain?: number,
): number {
  void trainedAt;
  const anchor = frontierBenchmarkAtTrain ?? modelBenchmark;
  const relativeGap = frontierBenchmark - Math.max(modelBenchmark, anchor);
  if (relativeGap <= 0) return 1;
  return Math.max(FRONTIER_DECAY_FLOOR, 1 - relativeGap * FRONTIER_DECAY_PER_POINT);
}

/** Diminishing returns when stacking more compute on a single model than the market wants. */
export function computeDemandSaturation(servingTps: number, modelBenchmark: number): number {
  const marketCapacityTps = Math.max(0.05, modelBenchmark * DEMAND_MARKET_TPS_PER_BENCHMARK);
  if (servingTps <= marketCapacityTps) return 1;
  return Math.max(DEMAND_SATURATION_FLOOR, Math.sqrt(marketCapacityTps / servingTps));
}
