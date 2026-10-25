import { effectiveModelServingStats, BENCHMARK_DEMAND_REFERENCE } from "@llmville/game/models/servingStats";
import { computeFrontierBenchmark, computeDemandSaturation } from "@llmville/game/economy/frontier";

/**
 * Sub-linear TFLOP scaling for serving throughput. Calibrated so a starter build (2× GTX 1060, one
 * serving a Llamma 3 fine-tune) clears its electricity and rent bills by ~$35/hr.
 */
export const SERVING_TFLOP_THROUGHPUT_FACTOR = 0.0125;

/** Tokens/sec cap per GB/s of installed memory bandwidth (~17 tok/s at Mac Studio 819 GB/s). */
const BANDWIDTH_TPS_FACTOR = 0.02076;

function computeBandwidthCapTps(totalMemoryBandwidthGbps: number): number {
  return totalMemoryBandwidthGbps * BANDWIDTH_TPS_FACTOR;
}

/** Raw model TPS before bandwidth cap, demand saturation, and serving-mode scaling. */
function computeRawModelServingTps(
  modelTokensPerSecond: number,
  allocatedTflops: number,
): number {
  return modelTokensPerSecond * allocatedTflops * SERVING_TFLOP_THROUGHPUT_FACTOR;
}

export interface ModelServingContributionInput {
  tokensPerSecond: number;
  moneyPerToken: number;
  tokensPerToken: number;
  paramsB?: number;
  precision?: Parameters<typeof effectiveModelServingStats>[0]["precision"];
  benchmarkScore?: number | null;
  trainedAt?: number;
  frontierBenchmarkAtTrain?: number;
}

export interface ModelServingContribution {
  effectiveTps: number;
  moneyPerSecond: number;
  dataTokensPerSecond: number;
  frontierDecayMultiplier: number;
  demandSaturation: number;
}

export function computeModelServingContribution(
  model: ModelServingContributionInput,
  allocatedTflops: number,
  totalMemoryBandwidthGbps: number,
  frontierBenchmark: number = computeFrontierBenchmark(),
): ModelServingContribution {
  const eff = effectiveModelServingStats(model, {
    frontierBenchmark,
    trainedAt: model.trainedAt,
    frontierBenchmarkAtTrain: model.frontierBenchmarkAtTrain,
  });
  const rawTps = computeRawModelServingTps(eff.tokensPerSecond, allocatedTflops);
  const bandwidthCappedTps = Math.min(rawTps, computeBandwidthCapTps(totalMemoryBandwidthGbps));
  const benchmark = model.benchmarkScore ?? BENCHMARK_DEMAND_REFERENCE;
  const demandSaturation = computeDemandSaturation(bandwidthCappedTps, benchmark);
  const effectiveTps = bandwidthCappedTps * demandSaturation;
  const moneyPerSecond = effectiveTps * eff.moneyPerToken;
  const dataTokensPerSecond = effectiveTps * eff.tokensPerToken;
  return {
    effectiveTps,
    moneyPerSecond,
    dataTokensPerSecond,
    frontierDecayMultiplier: eff.frontierDecayMultiplier,
    demandSaturation,
  };
}

/** One starter GPU (GTX 1060) — the yardstick for previewing income of a model with no cards on it. */
export const REFERENCE_SERVING_TFLOPS = 11;
export const REFERENCE_SERVING_BANDWIDTH_GBPS = 192;

/** $/s a model would earn on the cards bound to it, falling back to one starter GPU when unassigned. */
export function estimateModelIncomePerSecond(
  model: ModelServingContributionInput,
  assigned: { tflops: number; bandwidthGbps: number } | undefined,
  frontierBenchmark: number = computeFrontierBenchmark(),
): number {
  const tflops = assigned && assigned.tflops > 0 ? assigned.tflops : REFERENCE_SERVING_TFLOPS;
  const bandwidthGbps =
    assigned && assigned.tflops > 0 ? assigned.bandwidthGbps : REFERENCE_SERVING_BANDWIDTH_GBPS;
  return computeModelServingContribution(model, tflops, bandwidthGbps, frontierBenchmark).moneyPerSecond;
}
