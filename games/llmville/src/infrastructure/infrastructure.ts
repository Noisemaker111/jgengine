import {
  type AssignmentRackInput,
  type ComputeAssignmentMap,
  type ComputeAssignmentStats,
} from "@llmville/game/infrastructure/infrastructure";
import { computeFrontierBenchmark } from "@llmville/game/economy/frontier";
import { getDailyModifier } from "@llmville/game/economy/dailyMarket";
import {
  computeServingSnapshot,
  type ServingModelSnapshot,
} from "@llmville/game/economy/servingTick";
import type { RackSnapshot } from "@llmville/game/infrastructure/infrastructure";
import type { ServingModeId } from "@llmville/game/models/servingMode";
import type { RackCoolingUnitId } from "@llmville/game/infrastructure/catalog";
import type { ComputePrecision } from "@llmville/game/infrastructure/catalog";
import {
  deriveTutorialWorldSignals,
  type TutorialWorldSignals,
} from "@llmville/game/tutorial/tutorialProgress";
import type { InfrastructureBuildItemId } from "@llmville/game/build/catalog";
import { getFounderMultipliers } from "@llmville/game/user/founder";
import {
  getRackInstalledHardware,
  type RackInstalledHardwareSlot,
} from "@llmville/game/infrastructure/infrastructure";

import {
  type HardwareInventory,
} from "@llmville/game/infrastructure/infrastructure";

export interface PlacedRack {
  id: string;
  rackType: InfrastructureBuildItemId;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  createdAt: number;
  installedHardwareModuleIds: readonly RackInstalledHardwareSlot[];
  installedCoolerId?: RackCoolingUnitId | null;
}

export function findPlacedRackById(
  racks: readonly PlacedRack[],
  rackId: string | null | undefined,
): PlacedRack | undefined {
  if (rackId === null || rackId === undefined) return undefined;
  return racks.find((rack) => rack.id === rackId);
}

export function placedRackAssignmentInputs(
  racks: readonly PlacedRack[],
): AssignmentRackInput[] {
  return racks.map((rack) => ({
    rackId: rack.id,
    rackType: rack.rackType,
    installedHardwareModuleIds: rack.installedHardwareModuleIds,
  }));
}

export interface HardwareStats {
  totalGpus: number;
  trainingGpus: number;
  scrapingGpus: number;
  servingGpus: number;
  totalVramGb: number;
  totalMemoryBandwidthGbps: number;
  totalTrainingPowerFp16: number;
  /** FP16 TFLOPs of GPUs dedicated to the Training lane only. */
  trainingLaneTflops: number;
}

function placedRackServingSnapshots(racks: readonly PlacedRack[]): RackSnapshot[] {
  return racks.map((rack) => ({
    rackId: rack.id,
    rackType: rack.rackType,
    installedHardwareModuleIds: rack.installedHardwareModuleIds,
    installedCoolerId: rack.installedCoolerId,
  }));
}

function sceneModelServingSnapshot(model: SceneModelLike): ServingModelSnapshot {
  return {
    modelId: model.id ?? "",
    tokensPerSecond: model.tokensPerSecond,
    moneyPerToken: model.moneyPerToken,
    tokensPerToken: model.tokensPerToken,
    paramsB: model.paramsB,
    precision: model.precision,
    benchmarkScore: model.benchmarkScore,
    baseModelId: model.baseModelId,
  };
}

export interface WorldSceneSummary {
  rackCount: number;
  totalInstalledHardwareModules: number;
  totalOwnedHardwareModules: number;
  completedTrainingRuns: number;
  launchedModelCount: number;
  draftModelCount: number;
  hasRevealedModel: boolean;
  tutorialSignals: TutorialWorldSignals;
  servingIncomeRate: number;
  servingThroughputTps: number;
  heatLoadKw: number;
  coolingCapacityKw: number;
  /** Worst per-card temperature across racks (display only; removed from HUD in Slice E). */
  temperatureC: number;
  thermalThrottle: number;
  powerDrawKw: number;
  powerCapacityKw: number;
  powerThrottle: number;
  vramUsedGb: number;
  vramCapacityGb: number;
  hardwareStats: HardwareStats;
  frontierBenchmark: number;
  modelServingAssignments: ComputeAssignmentStats["servingByModel"];
}

interface SceneModelLike {
  id?: string;
  launchState: string;
  isRevealed?: boolean;
  isLicensedBaseServe?: boolean;
  tokensPerSecond: number;
  moneyPerToken: number;
  tokensPerToken: number;
  paramsB?: number;
  precision?: ComputePrecision | null;
  benchmarkScore?: number | null;
  baseModelId?: string;
}

interface DeriveWorldSceneSummaryOptions {
  racks: readonly PlacedRack[];
  models: readonly SceneModelLike[];
  isTraining: boolean;
  hardwareInventory: HardwareInventory;
  computeAssignments?: ComputeAssignmentMap | null;
  servingMode?: ServingModeId | null;
  ownerAvatarId?: string | null;
  dataTokens?: number;
  modelCatalog?: Record<string, { isUnlocked?: boolean }> | null;
  gameCreatedAt?: number;
  powerCapacityKw: number;
}

export function deriveWorldSceneSummary({
  racks,
  models,
  isTraining,
  hardwareInventory,
  computeAssignments,
  servingMode,
  ownerAvatarId,
  dataTokens = 0,
  modelCatalog,
  gameCreatedAt,
  powerCapacityKw,
}: DeriveWorldSceneSummaryOptions): WorldSceneSummary {
  const totalInstalledHardwareModules = racks.reduce(
    (sum, rack) => sum + getRackInstalledHardware(rack).length,
    0,
  );
  const totalOwnedHardwareModules =
    totalInstalledHardwareModules
    + Object.values(hardwareInventory).reduce((sum, count) => sum + Math.max(0, Math.floor(count)), 0);
  const servingModels = models.filter((model) => model.launchState === "serving");
  const draftModelCount = models.filter((model) => model.launchState === "owned").length;

  const frontierBenchmark = computeFrontierBenchmark(Date.now(), gameCreatedAt);
  const servingSnapshot = computeServingSnapshot({
    racks: placedRackServingSnapshots(racks),
    servingModels: servingModels.map(sceneModelServingSnapshot),
    hostedModels: [],
    hasRunningTrainingJobs: isTraining,
    servingMode,
    computeAssignments,
    reputation: 0,
    servingStabilityBonus: 0,
    founderMultipliers: getFounderMultipliers(ownerAvatarId),
    frontierBenchmark,
    dailyModifier: getDailyModifier(),
    powerCapacityKw,
  });
  const assignmentStats = servingSnapshot.assignmentStats;
  const hardwareStats: HardwareStats = {
    totalGpus: assignmentStats.total.gpuCount,
    trainingGpus: assignmentStats.training.gpuCount,
    scrapingGpus: assignmentStats.scraping.gpuCount,
    servingGpus: assignmentStats.serving.gpuCount,
    totalVramGb: assignmentStats.total.vramGb,
    totalMemoryBandwidthGbps: assignmentStats.total.bandwidthGbps,
    totalTrainingPowerFp16: assignmentStats.total.tflops,
    trainingLaneTflops: assignmentStats.training.tflops,
  };

  const tutorialSignals = deriveTutorialWorldSignals({
    rackPlaced: racks.length > 0,
    ownedGpuCount: totalOwnedHardwareModules,
    installedGpuCount: totalInstalledHardwareModules,
    modelCatalog,
    dataTokens,
    scrapingGpuCount: assignmentStats.scraping.gpuCount,
    servingIncomeRate: servingSnapshot.servingGainPerSecond,
    models,
  });

  return {
    rackCount: racks.length,
    totalInstalledHardwareModules,
    totalOwnedHardwareModules,
    completedTrainingRuns: models.filter((model) => model.isLicensedBaseServe !== true).length,
    launchedModelCount: servingModels.length,
    draftModelCount,
    hasRevealedModel: models.some((model) => model.isRevealed === true),
    tutorialSignals,
    servingIncomeRate: servingSnapshot.servingGainPerSecond,
    servingThroughputTps: servingSnapshot.effectiveTps,
    heatLoadKw: servingSnapshot.thermal.heatLoadKw,
    coolingCapacityKw: servingSnapshot.thermal.coolingCapacityKw,
    temperatureC: servingSnapshot.thermal.temperatureC,
    thermalThrottle: servingSnapshot.thermal.throttleFactor,
    powerDrawKw: servingSnapshot.powerDrawKw,
    powerCapacityKw: servingSnapshot.powerCapacityKw,
    powerThrottle: servingSnapshot.powerThrottle,
    vramUsedGb: servingSnapshot.models.totalFootprintGb,
    vramCapacityGb: hardwareStats.totalVramGb,
    hardwareStats,
    frontierBenchmark,
    modelServingAssignments: assignmentStats.servingByModel,
  };
}
