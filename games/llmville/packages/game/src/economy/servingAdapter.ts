import { getDailyModifier } from "@llmville/game/economy/dailyMarket";
import {
  computeServingSnapshot,
  computeServingTickGain,
  computeServingTickTiming,
  nextServingTickAnchor,
  type HostedModelSnapshot,
  type ServingModelSnapshot,
  type ServingSnapshot,
  type ServingTickTiming,
} from "@llmville/game/economy/servingTick";
import { computeRackHardwareStats } from "@llmville/game/infrastructure/infrastructure";
import type { RackSnapshot } from "@llmville/game/infrastructure/infrastructure";
import { getFounderMultipliers } from "@llmville/game/user/founder";
import type { ComputeAssignmentMap } from "@llmville/game/infrastructure/infrastructure";
import type { ComputePrecision } from "@llmville/game/infrastructure/catalog";
import type { ServingModeId } from "@llmville/game/models/servingMode";
import {
  DEFAULT_MODEL_PARAMS_B,
  computeModelVramFootprintGb,
} from "@llmville/game/models/quantization";

export interface ServingGameRow {
  servingMode?: ServingModeId;
  reputation?: number;
  lastServingTickAt?: number;
  lastIncomeTickAt: number;
  createdBy?: string | null;
}

export function servingTickTimingFromGame(game: Pick<ServingGameRow, "lastServingTickAt" | "lastIncomeTickAt">, now: number): ServingTickTiming {
  return computeServingTickTiming(game.lastServingTickAt ?? game.lastIncomeTickAt, now);
}

export function buildServingSnapshotFromRows(input: {
  game: ServingGameRow;
  racks: readonly RackSnapshot[];
  computeAssignments: ComputeAssignmentMap;
  servingModels: readonly ServingModelSnapshot[];
  hostedModels: readonly HostedModelSnapshot[];
  hasRunningTrainingJobs: boolean;
  servingStabilityBonus: number;
  ownerAvatarId: string | null | undefined;
  frontierBenchmark: number;
  powerCapacityKw: number;
}): ServingSnapshot {
  return computeServingSnapshot({
    racks: input.racks,
    servingModels: input.servingModels,
    hostedModels: input.hostedModels,
    hasRunningTrainingJobs: input.hasRunningTrainingJobs,
    servingMode: input.game.servingMode,
    computeAssignments: input.computeAssignments,
    reputation: input.game.reputation ?? 0,
    servingStabilityBonus: input.servingStabilityBonus,
    founderMultipliers: getFounderMultipliers(input.ownerAvatarId),
    frontierBenchmark: input.frontierBenchmark,
    dailyModifier: getDailyModifier(),
    powerCapacityKw: input.powerCapacityKw,
  });
}

export function decideServingIncomeTick(input: {
  timing: ServingTickTiming;
  servingSnapshot: ServingSnapshot;
}) {
  const gain = computeServingTickGain(input.servingSnapshot.servingGainPerSecond, input.timing.elapsedSeconds);
  if (gain <= 0) {
    // Keep the anchor when nothing was paid so sub-cent income accrues across ticks instead of rounding to zero forever.
    return {
      applied: true as const,
      gain: 0,
      servingGainPerSecond: 0,
      lastServingTickAt: input.timing.anchorTime,
    };
  }
  return {
    applied: true as const,
    gain,
    servingGainPerSecond: input.servingSnapshot.servingGainPerSecond,
    effectiveTps: Math.round(input.servingSnapshot.effectiveTps),
    capacityTps: input.servingSnapshot.capacityTps,
    lastServingTickAt: nextServingTickAnchor(input.timing),
  };
}

export function hasServingActivity(
  servingModelCount: number,
  hostedModelCount: number,
  totalInstalledGpus: number,
): boolean {
  return (servingModelCount > 0 || hostedModelCount > 0) && totalInstalledGpus >= 1;
}

export function installedGpuCount(racks: readonly RackSnapshot[]): number {
  return computeRackHardwareStats(racks as RackSnapshot[]).totalInstalledGpus;
}

export interface ServingStatsView {
  capacityTps: number;
  actualServedTps: number;
  servingGainPerSecond: number;
  trainingGpus: number;
  scrapingGpus: number;
  servingGpus: number;
  totalGpus: number;
  totalVramGb: number;
  totalTrainingPowerFp16: number;
  heatLoadKw: number;
  coolingCapacityKw: number;
  temperatureC: number;
  thermalThrottle: number;
  powerDrawKw: number;
  powerCapacityKw: number;
  powerThrottle: number;
}

export function shapeServingStats(snapshot: ServingSnapshot): ServingStatsView {
  const { assignmentStats, hardwareStats, thermal } = snapshot;
  return {
    capacityTps: snapshot.capacityTps,
    actualServedTps: snapshot.effectiveTps,
    servingGainPerSecond: snapshot.servingGainPerSecond,
    trainingGpus: assignmentStats.training.gpuCount,
    scrapingGpus: assignmentStats.scraping.gpuCount,
    servingGpus: assignmentStats.serving.gpuCount,
    totalGpus: hardwareStats.totalInstalledGpus,
    totalVramGb: hardwareStats.totalVramGb,
    totalTrainingPowerFp16: hardwareStats.totalTrainingPowerFp16,
    heatLoadKw: thermal.heatLoadKw,
    coolingCapacityKw: thermal.coolingCapacityKw,
    temperatureC: thermal.temperatureC,
    thermalThrottle: thermal.throttleFactor,
    powerDrawKw: snapshot.powerDrawKw,
    powerCapacityKw: snapshot.powerCapacityKw,
    powerThrottle: snapshot.powerThrottle,
  };
}

export type ServeModelDecision =
  | { served: true }
  | { served: false; reason: string };

export function decideServeModel(input: {
  paramsB: number | undefined;
  precision: ComputePrecision | null | undefined;
  totalVramGb: number;
}): ServeModelDecision {
  const footprintGb = computeModelVramFootprintGb(
    input.paramsB ?? DEFAULT_MODEL_PARAMS_B,
    input.precision,
  );
  if (footprintGb > input.totalVramGb) {
    return {
      served: false,
      reason: `Needs ${footprintGb.toFixed(0)} GB VRAM, only ${input.totalVramGb.toFixed(0)} GB installed — add GPUs or quantize.`,
    };
  }
  return { served: true };
}