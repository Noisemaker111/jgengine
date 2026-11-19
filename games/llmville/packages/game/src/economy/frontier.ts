import { foldStatContributions } from "@jgengine/core/progression/statGraph";

export const FRONTIER_BASELINE = 50;

export const FRONTIER_RISE_PER_DAY = 2;

export const FRONTIER_CATALOG_BENCHMARK_CEILING = 90;

/** Hard cap on the effective frontier so global release jumps cannot grow without bound. */
export const FRONTIER_MAX_BENCHMARK = FRONTIER_CATALOG_BENCHMARK_CEILING + 30;

export const FRONTIER_DECAY_PER_POINT = 0.04;

/** Floor on frontier decay — even stale models retain a trickle of demand. */
export const FRONTIER_DECAY_FLOOR = 0.05;

export const DEMAND_MARKET_TPS_PER_BENCHMARK = 0.05;

export const DEMAND_SATURATION_FLOOR = 0.15;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function frontierDaysElapsed(nowMs: number, gameCreatedAtMs: number): number {
  return Math.max(0, (nowMs - gameCreatedAtMs) / MS_PER_DAY);
}

export function computeFrontierBenchmark(
  nowMs: number = Date.now(),
  gameCreatedAtMs: number = nowMs,
): number {
  return FRONTIER_BASELINE + frontierDaysElapsed(nowMs, gameCreatedAtMs) * FRONTIER_RISE_PER_DAY;
}

export function clampFrontierBenchmark(benchmark: number): number {
  return foldStatContributions(benchmark, [
    { source: "frontier-baseline", op: "clampMin", value: FRONTIER_BASELINE },
    { source: "frontier-cap", op: "clampMax", value: FRONTIER_MAX_BENCHMARK },
  ]);
}

/** World-age frontier plus the clamped global release offset, or a per-world override. */
export function computeEffectiveFrontierBenchmark(params: {
  nowMs?: number | undefined;
  gameCreatedAtMs?: number | undefined;
  frontierOffset?: number | undefined;
  gameOverride?: number | undefined;
} = {}): number {
  if (params.gameOverride !== undefined) return params.gameOverride;
  const nowMs = params.nowMs ?? Date.now();
  return clampFrontierBenchmark(
    foldStatContributions(computeFrontierBenchmark(nowMs, params.gameCreatedAtMs ?? nowMs), [
      { source: "frontier-release", op: "add", value: params.frontierOffset ?? 0 },
    ]),
  );
}

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
  return foldStatContributions(1, [
    { source: "frontier-gap", op: "add", value: -(relativeGap * FRONTIER_DECAY_PER_POINT) },
    { source: "frontier-decay-floor", op: "clampMin", value: FRONTIER_DECAY_FLOOR },
  ]);
}

export function computeDemandSaturation(servingTps: number, modelBenchmark: number): number {
  const marketCapacityTps = Math.max(0.05, modelBenchmark * DEMAND_MARKET_TPS_PER_BENCHMARK);
  if (servingTps <= marketCapacityTps) return 1;
  return Math.max(DEMAND_SATURATION_FLOOR, Math.sqrt(marketCapacityTps / servingTps));
}
