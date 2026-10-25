import {
  computeDemandSaturation,
  computeFrontierDecayMultiplier,
} from "@llmville/game/economy/frontier";
import type { ComputePrecision } from "@llmville/game/infrastructure/catalog";

import type { ModelQualityTierId } from "./modelQuality";

import { DEFAULT_MODEL_PARAMS_B, computeModelVramFootprintGb, getQuantizationProfile } from "./quantization";

/** Benchmark that maps to neutral demand (~the first model). Better benchmarks command more $/token. */
export const BENCHMARK_DEMAND_REFERENCE = 50;

/** Demand premium from a model's benchmark score: a stronger model gets used more and charges more. */
export function computeBenchmarkDemandMultiplier(benchmarkScore?: number | null): number {
  const score = benchmarkScore ?? BENCHMARK_DEMAND_REFERENCE;
  return Math.max(0.7, Math.min(1.6, 1 + (score - BENCHMARK_DEMAND_REFERENCE) / 100));
}

/** Quality tier nudges a trained model's benchmark above its base. */
export const MODEL_TIER_BENCHMARK_BONUS: Record<ModelQualityTierId, number> = {
  common: 0,
  uncommon: 3,
  rare: 7,
  sota: 12,
};

export function computeTrainedBenchmark(baseBenchmark: number | undefined, tier: ModelQualityTierId): number {
  return Math.max(1, Math.min(100, Math.round((baseBenchmark ?? BENCHMARK_DEMAND_REFERENCE) + MODEL_TIER_BENCHMARK_BONUS[tier])));
}

export interface EffectiveModelServingStats {
  tokensPerSecond: number;
  moneyPerToken: number;
  tokensPerToken: number;
  footprintGb: number;
  frontierDecayMultiplier: number;
  demandSaturation: number;
}

export interface EffectiveModelServingOptions {
  trainedAt?: number;
  frontierBenchmark?: number;
  frontierBenchmarkAtTrain?: number;
  /** Pre-computed TPS for demand saturation; when omitted, saturation is 1 until throughput is known. */
  servingTps?: number;
}

/** Apply quantization, benchmark demand, frontier decay, and optional demand saturation. */
export function effectiveModelServingStats(
  model: {
    tokensPerSecond: number;
    moneyPerToken: number;
    tokensPerToken: number;
    paramsB?: number;
    precision?: ComputePrecision | null;
    benchmarkScore?: number | null;
  },
  options?: EffectiveModelServingOptions,
): EffectiveModelServingStats {
  const profile = getQuantizationProfile(model.precision);
  const demand = computeBenchmarkDemandMultiplier(model.benchmarkScore);
  const benchmark = model.benchmarkScore ?? BENCHMARK_DEMAND_REFERENCE;
  const frontierDecayMultiplier =
    options?.frontierBenchmark === undefined
      ? 1
      : computeFrontierDecayMultiplier(
          benchmark,
          options.frontierBenchmark,
          options?.trainedAt,
          options?.frontierBenchmarkAtTrain,
        );
  const baseTps = model.tokensPerSecond * profile.throughputMult;
  const demandSaturation =
    options?.servingTps === undefined
      ? 1
      : computeDemandSaturation(options.servingTps, benchmark);
  return {
    tokensPerSecond: baseTps,
    moneyPerToken: model.moneyPerToken * profile.qualityMult * demand * frontierDecayMultiplier,
    tokensPerToken: model.tokensPerToken,
    footprintGb: computeModelVramFootprintGb(model.paramsB ?? DEFAULT_MODEL_PARAMS_B, model.precision),
    frontierDecayMultiplier,
    demandSaturation,
  };
}
