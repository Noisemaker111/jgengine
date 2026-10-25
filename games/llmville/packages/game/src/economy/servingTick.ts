import { accrueSince } from "@jgengine/core/time/accrueSince";
import type { DailyMarketModifier } from "@llmville/game/economy/dailyMarket";
import { applyReputationToDailyModifier } from "@llmville/game/economy/reputation";
import { getHostedVendorModelDefinition } from "@llmville/game/economy/marketplace";
import { computeModelServingContribution } from "@llmville/game/economy/servingEconomy";
import {
  computeAssignmentStats,
  type ComputeAssignmentMap,
  type ComputeAssignmentStats,
} from "@llmville/game/infrastructure/infrastructure";
import type { ThermalState } from "@llmville/game/infrastructure/infrastructure";
import { getHardwareDefinition } from "@llmville/game/infrastructure/catalog";
import type { ComputePrecision } from "@llmville/game/infrastructure/catalog";
import {
  computeRackHardwareStats,
  type RackHardwareStats,
} from "@llmville/game/infrastructure/infrastructure";
import {
  rackAssignmentInputs,
  rackThermalInputs,
  type RackSnapshot,
} from "@llmville/game/infrastructure/infrastructure";
import { summarizeRackSiteThermal } from "@llmville/game/infrastructure/infrastructure";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";
import {
  accrueScrapeTokens,
  DEFAULT_SCRAPE_TIER,
  SCRAPE_TICK_INTERVAL_MS,
  type ScrapeTierId,
} from "@llmville/game/models/scrapingTiers";
import { getServingModeProfile, type ServingModeId } from "@llmville/game/models/servingMode";
import { effectiveModelServingStats } from "@llmville/game/models/servingStats";
import type { FounderMultipliers } from "@llmville/game/user/founder";

export const MAX_SERVING_TICK_ELAPSED_SECONDS = 60;
const MS_PER_SECOND = 1000;
export const STABILITY_BONUS_PER_POINT = 0.002;
const MAX_STABILITY_FACTOR_BONUS = 0.2;

export interface ServingModelSnapshot {
  modelId: string;
  tokensPerSecond: number;
  moneyPerToken: number;
  tokensPerToken: number;
  paramsB?: number;
  precision?: ComputePrecision | null;
  benchmarkScore?: number | null;
  trainedAt?: number;
  baseModelId?: string;
}

export interface HostedModelSnapshot {
  vendorModelId?: string;
  revenueShareHost: number;
}

export interface ServingTickTiming {
  now: number;
  anchorTime: number;
  elapsedSeconds: number;
}

export function computeServingTickTiming(anchorTime: number, now: number): ServingTickTiming {
  const accrual = accrueSince(anchorTime, now, {
    capMs: MAX_SERVING_TICK_ELAPSED_SECONDS * MS_PER_SECOND,
  });
  const elapsedSeconds = Math.floor(accrual.elapsedSeconds);
  return { now, anchorTime, elapsedSeconds };
}

/** Consume the whole elapsed window, including time beyond the cap, retaining fractional seconds. */
export function nextServingTickAnchor(timing: ServingTickTiming): number {
  const elapsedMs = Math.max(0, timing.now - timing.anchorTime);
  return timing.anchorTime + Math.floor(elapsedMs / MS_PER_SECOND) * MS_PER_SECOND;
}

/** Exact gain for the elapsed window; currency precision is applied at the wallet write boundary. */
export function computeServingTickGain(
  servingGainPerSecond: number,
  elapsedSeconds: number,
): number {
  return servingGainPerSecond * elapsedSeconds;
}

export const computeServingStabilityFactor = (
  statBonus: number,
  servingBonus: number,
) =>
  1 +
  Math.min(
    MAX_STABILITY_FACTOR_BONUS,
    statBonus * STABILITY_BONUS_PER_POINT,
  ) +
  servingBonus;

export interface ServingModelsSummary {
  /** Sum of per-model effective TPS (each = tokensPerSecond × per-model serving TFLOPs). */
  totalEffectiveTps: number;
  /** $/s from moneyPerToken × effective TPS (open serving path). */
  moneyPerSecond: number;
  /** Data tokens/s from tokensPerToken × effective TPS. */
  dataTokensPerSecond: number;
  /** Combined VRAM footprint of every serving model, including ones gated out by their cards' VRAM. */
  totalFootprintGb: number;
}

function modelRevenueMult(
  baseModelId: string | undefined,
  modifier: DailyMarketModifier,
  reputationAdjusted: ReturnType<typeof applyReputationToDailyModifier>,
): number {
  const baseModel = baseModelId ? getBaseModelDefinition(baseModelId) : undefined;
  if (baseModel?.isReasoning && modifier.reasoningRevenueMult > 1) {
    return modifier.reasoningRevenueMult;
  }
  return reputationAdjusted.revenueMult;
}

export function summarizeServingModels(
  servingModels: readonly ServingModelSnapshot[],
  hostedModels: readonly HostedModelSnapshot[],
  assignmentStats: ComputeAssignmentStats,
  /** founder compute buff × site energy throttle applied to each card's TFLOPs. */
  computeScale: number,
  frontierBenchmark: number,
  modifier: DailyMarketModifier,
  reputationAdjusted: ReturnType<typeof applyReputationToDailyModifier>,
): ServingModelsSummary {
  let summary: ServingModelsSummary = {
    totalEffectiveTps: 0,
    moneyPerSecond: 0,
    dataTokensPerSecond: 0,
    totalFootprintGb: 0,
  };
  let boundTflopsSum = 0;

  // Owned models each serve on the specific cards dragged onto them.
  for (const model of servingModels) {
    const footprint = effectiveModelServingStats(model, { frontierBenchmark }).footprintGb;
    summary = { ...summary, totalFootprintGb: summary.totalFootprintGb + footprint };

    const bound = assignmentStats.servingByModel.get(model.modelId);
    if (!bound || bound.tflops <= 0) continue; // no dedicated cards → earns nothing
    boundTflopsSum += bound.tflops;

    // A model can only run on cards whose combined VRAM holds it.
    if (bound.vramGb + 1e-6 < footprint) continue;

    const contribution = computeModelServingContribution(
      {
        tokensPerSecond: model.tokensPerSecond,
        moneyPerToken: model.moneyPerToken,
        tokensPerToken: model.tokensPerToken,
        paramsB: model.paramsB,
        precision: model.precision,
        benchmarkScore: model.benchmarkScore,
        trainedAt: model.trainedAt,
      },
      bound.tflops * computeScale,
      bound.bandwidthGbps,
      frontierBenchmark,
    );
    const revenueMult = modelRevenueMult(model.baseModelId, modifier, reputationAdjusted);
    summary = {
      ...summary,
      totalEffectiveTps: summary.totalEffectiveTps + contribution.effectiveTps,
      moneyPerSecond: summary.moneyPerSecond + contribution.moneyPerSecond * revenueMult,
      dataTokensPerSecond:
        summary.dataTokensPerSecond
        + contribution.dataTokensPerSecond * reputationAdjusted.dataYieldMult,
    };
  }

  // Hosted (marketplace) models split the *unbound* serving pool — serving-lane cards not tied to an owned model.
  const unboundTflops = Math.max(0, assignmentStats.serving.tflops - boundTflopsSum);
  const perHostedTflops =
    hostedModels.length > 0 ? (unboundTflops * computeScale) / hostedModels.length : 0;

  return hostedModels.reduce((acc, hosted) => {
    const vendor = hosted.vendorModelId
      ? getHostedVendorModelDefinition(hosted.vendorModelId)
      : undefined;
    if (!vendor || perHostedTflops <= 0) return acc;

    const contribution = computeModelServingContribution(
      {
        tokensPerSecond: vendor.tokensPerSecond,
        moneyPerToken: vendor.moneyPerToken,
        tokensPerToken: vendor.tokensPerToken,
        paramsB: vendor.paramsB,
        benchmarkScore: vendor.benchmarkScore,
      },
      perHostedTflops,
      assignmentStats.serving.bandwidthGbps,
      frontierBenchmark,
    );
    const revenueMult = modelRevenueMult(vendor.id, modifier, reputationAdjusted);
    const hostShare = Math.max(0, Math.min(1, hosted.revenueShareHost));
    return {
      ...acc,
      totalEffectiveTps: acc.totalEffectiveTps + contribution.effectiveTps,
      moneyPerSecond: acc.moneyPerSecond + contribution.moneyPerSecond * revenueMult * hostShare,
      dataTokensPerSecond:
        acc.dataTokensPerSecond
        + contribution.dataTokensPerSecond * reputationAdjusted.dataYieldMult * hostShare,
    };
  }, summary);
}

export interface ServingSnapshotInputs {
  racks: readonly RackSnapshot[];
  servingModels: readonly ServingModelSnapshot[];
  hostedModels: readonly HostedModelSnapshot[];
  hasRunningTrainingJobs: boolean;
  servingMode: ServingModeId | null | undefined;
  computeAssignments: ComputeAssignmentMap | null | undefined;
  reputation: number;
  servingStabilityBonus: number;
  founderMultipliers: FounderMultipliers;
  frontierBenchmark: number;
  dailyModifier: DailyMarketModifier;
  powerCapacityKw: number;
}

export interface ServingSnapshot {
  hardwareStats: RackHardwareStats;
  assignmentStats: ComputeAssignmentStats;
  models: ServingModelsSummary;
  /** Same as total effective TPS for product/debug readouts. */
  capacityTps: number;
  effectiveTps: number;
  servingGainPerSecond: number;
  thermal: ThermalState;
  powerDrawKw: number;
  powerCapacityKw: number;
  powerThrottle: number;
}

export function computeServingSnapshot(inputs: ServingSnapshotInputs): ServingSnapshot {
  const {
    racks,
    servingModels,
    hostedModels,
    founderMultipliers,
    frontierBenchmark,
    dailyModifier,
  } = inputs;
  const reputationAdjusted = applyReputationToDailyModifier(dailyModifier, inputs.reputation);
  const rawHardware = computeRackHardwareStats(racks);
  const hardwareStats = {
    ...rawHardware,
    totalTrainingPowerFp16:
      rawHardware.totalTrainingPowerFp16
      * founderMultipliers.trainingPowerFp16Multiplier,
  };
  const assignmentStats = computeAssignmentStats(rackAssignmentInputs(racks), inputs.computeAssignments);
  const isComputeActive =
    inputs.hasRunningTrainingJobs || servingModels.length > 0 || hostedModels.length > 0;
  const rackTflops: Record<string, number> = {};
  for (const rack of racks) {
    let tflops = 0;
    for (const hardwareModelId of rack.installedHardwareModuleIds ?? []) {
      if (!hardwareModelId) continue;
      tflops += getHardwareDefinition(hardwareModelId).trainingPowerFp16;
    }
    rackTflops[rack.rackId] = tflops;
  }
  const siteThermal = summarizeRackSiteThermal(rackThermalInputs(racks), {
    isComputeActive,
    ambientCoolingMult: dailyModifier.ambientCoolingMult,
    rackTflops,
    powerCapacityKw: inputs.powerCapacityKw,
  });
  const effectiveThermalThrottle = siteThermal.effectiveThermalThrottle;
  const energyThrottle = effectiveThermalThrottle * siteThermal.powerThrottle;
  const thermal: ThermalState = {
    heatLoadKw: siteThermal.heatLoadKw,
    coolingCapacityKw: siteThermal.coolingCapacityKw,
    temperatureC: siteThermal.temperatureC,
    throttleFactor: effectiveThermalThrottle,
    utilization: siteThermal.coolingCapacityKw > 0
      ? siteThermal.heatLoadKw / siteThermal.coolingCapacityKw
      : 0,
  };
  // Each serving card contributes its own TFLOPs (scaled by founder buff × site throttle); a per-model
  // VRAM gate inside summarizeServingModels drops any model its cards can't hold.
  const servingComputeScale = founderMultipliers.trainingPowerFp16Multiplier * energyThrottle;
  const summary = summarizeServingModels(
    servingModels,
    hostedModels,
    assignmentStats,
    servingComputeScale,
    frontierBenchmark,
    dailyModifier,
    reputationAdjusted,
  );
  // Serving mode: batch packs the GPUs (more throughput) but discounts tokens; realtime is the inverse.
  const mode = getServingModeProfile(inputs.servingMode);
  const scaledMoneyPerSecond =
    summary.moneyPerSecond
    * mode.throughputMult
    * mode.revenueMult
    * founderMultipliers.servingMoneyIncomeMultiplier;
  const effectiveTps = Math.max(
    0,
    summary.totalEffectiveTps * mode.throughputMult * founderMultipliers.servingThroughputMultiplier,
  );
  const capacityTps = effectiveTps;
  const stabilityFactor = computeServingStabilityFactor(
    hardwareStats.stabilityBonus,
    inputs.servingStabilityBonus,
  );
  const servingGainPerSecond = Math.max(0, scaledMoneyPerSecond * stabilityFactor);

  return {
    hardwareStats,
    assignmentStats,
    models: summary,
    capacityTps,
    effectiveTps,
    servingGainPerSecond,
    thermal,
    powerDrawKw: siteThermal.powerDrawKw,
    powerCapacityKw: siteThermal.powerCapacityKw,
    powerThrottle: siteThermal.powerThrottle,
  };
}

export type ScrapingTickDecision =
  | { kind: "reset_anchor" }
  | { kind: "skip" }
  | { kind: "accrue"; tokens: number; nextAnchorAt: number };

/**
 * Cheap pre-filter for the scraping cron: with the anchor already set and less than one tier interval
 * elapsed, no accrual is reachable this tick, so the caller can skip the claim + chunk reads entirely.
 * A pending anchor reset is only deferred to the first tick that clears the interval, never lost.
 */
export function scrapingTickCanBeSkipped(args: {
  lastScrapingTickAt: number | undefined;
  now: number;
}): boolean {
  if (args.lastScrapingTickAt === undefined) return false;
  return Math.max(0, args.now - args.lastScrapingTickAt) < SCRAPE_TICK_INTERVAL_MS;
}

export function scrapeLaneTflops(args: {
  racks: readonly RackSnapshot[];
  computeAssignments: ComputeAssignmentMap | null | undefined;
  trainingPowerFp16Multiplier: number;
}): number {
  const assignmentStats = computeAssignmentStats(rackAssignmentInputs(args.racks), args.computeAssignments);
  return assignmentStats.scraping.tflops * args.trainingPowerFp16Multiplier;
}

export function decideScrapingTick(args: {
  racks: readonly RackSnapshot[];
  computeAssignments: ComputeAssignmentMap | null | undefined;
  activeScrapeTier: ScrapeTierId | undefined;
  sourceTokensPerToken: number;
  lastScrapingTickAt: number | undefined;
  trainingPowerFp16Multiplier: number;
  now: number;
}): ScrapingTickDecision {
  const scrapeTflops = scrapeLaneTflops(args);

  if (scrapeTflops <= 0 || args.lastScrapingTickAt === undefined) {
    return { kind: "reset_anchor" };
  }

  const tier = args.activeScrapeTier ?? DEFAULT_SCRAPE_TIER;
  const accrual = accrueScrapeTokens(
    tier,
    scrapeTflops,
    args.sourceTokensPerToken,
    Math.max(0, args.now - args.lastScrapingTickAt),
  );
  if (accrual.procs <= 0) {
    return { kind: "skip" };
  }

  return {
    kind: "accrue",
    tokens: accrual.tokens,
    nextAnchorAt: args.lastScrapingTickAt + accrual.consumedMs,
  };
}
