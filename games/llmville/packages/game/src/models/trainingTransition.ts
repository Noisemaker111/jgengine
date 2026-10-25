import { computeReputationGain } from "@llmville/game/economy/reputation";
import { estimateModelIncomePerSecond } from "@llmville/game/economy/servingEconomy";
import { SECONDS_PER_HOUR } from "@llmville/game/economy/hourlyRates";
import type { ComputePrecision } from "@llmville/game/infrastructure/catalog";
import {
  computeAssignmentStats,
  type ComputeAssignmentMap,
} from "@llmville/game/infrastructure/infrastructure";
import {
  rackAssignmentInputs,
  rackThermalInputs,
  type RackSnapshot,
} from "@llmville/game/infrastructure/infrastructure";
import { computeRackHardwareStats } from "@llmville/game/infrastructure/infrastructure";
import { summarizeRackSiteThermal } from "@llmville/game/infrastructure/infrastructure";
import {
  getBaseModelDefinition,
  getResearchUnlockDataTokens,
  type BaseModelDefinition,
} from "@llmville/game/models/baseModels";
import { isBaseModelUnlockedForGame } from "@llmville/game/models/scraping";
import {
  generatePostTrainingModelStats,
  modelQualityTierFromUnit,
  rollStatMultiplierFromTierInputs,
  type ModelQualityTierId,
} from "@llmville/game/models/modelQuality";
import {
  DEFAULT_MODEL_PARAMS_B,
  computeModelVramFootprintGb,
} from "@llmville/game/models/quantization";
import { computeTrainedBenchmark } from "@llmville/game/models/servingStats";
import {
  TRAINING_JOB_MIN_DURATION_MS_POST_TRAIN,
  TRAINING_TYPE_VALUES,
} from "@llmville/game/models/trainingEconomy";
import type { FounderMultipliers } from "@llmville/game/user/founder";
import type { ModelCatalogMapRow } from "@llmville/game/schema/rowShapes";

export type TrainingType = (typeof TRAINING_TYPE_VALUES)[number];
export type TrainingProgressKind = "data_drain" | "distill_pool";

/** Wall-clock milliseconds; the work queue converts to seconds at enqueue time. */
export interface TrainingJobSpec {
  startedBy: string;
  baseModelId: string;
  trainingType: TrainingType;
  progressKind: TrainingProgressKind;
  overtrainBracket: number;
  workTokens: number;
  drainTokensPerSecond: number;
  tflopsUsed: number;
  vendorHourlyUsd: number;
  reservedDataTokens: number;
  durationMultiplier: number;
  startedAt: number;
}

const seededFloat = (seed: string, salt: string) => {
  let hash = 2166136261;
  const source = `${seed}:${salt}`;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
};

const seededPick = <T,>(seed: string, salt: string, options: readonly T[]) =>
  options[Math.min(Math.floor(seededFloat(seed, salt) * options.length), options.length - 1)] ?? options[0];

export const buildModelName = (seed: string) =>
  `${seededPick(seed, "adj", ["Cozy", "Signal", "Velvet", "Nebula", "Harmonic", "Zen"])} ${seededPick(seed, "noun", ["Sage", "Forge", "Pilot", "Atlas", "Circuit", "Lantern"])} Lab-${Math.floor(seededFloat(seed, "suffix") * 900 + 100)}`;

export interface TrainedModelRow {
  name: string;
  qualityTier: ModelQualityTierId;
  moneyPerToken: number;
  tokensPerSecond: number;
  tokensPerToken: number;
  paramsB: number;
  precision: "fp16";
  benchmarkScore: number;
  notes: string[];
  launchState: "owned";
  baseModelId: string;
  trainingDataTokens: number;
  tflopsUsed: number;
  trainingType: TrainingType;
  isRevealed: false;
  createdAt: number;
  updatedAt: number;
}

export const TRAINED_MODEL_RNG_UNIT_COUNT = 7;

/** Maps a uint32 (e.g. from `crypto.getRandomValues`) to a uniform draw in [0, 1). */
export function unitFromUint32(x: number): number {
  return (x >>> 0) * 2 ** -32;
}

export interface TrainedModelRollInputs {
  seed: string;
  baseModelId: string;
  trainingType: TrainingType;
  tflopsUsed: number;
  gameDataTokens: number;
  unresolvedEventCount: number;
  trainingEfficiencyBoost: number;
  unresolvedEventPenaltyReduction: number;
  overtrainBracket: number;
  founder: FounderMultipliers;
  frontierBenchmark: number;
  /** Uniform draws in [0, 1); the first {@link TRAINED_MODEL_RNG_UNIT_COUNT} are consumed. */
  rngUnits: readonly number[];
  now: number;
}

export interface TrainedModelRoll {
  model: TrainedModelRow;
  reputationGain: number;
}

export function rollTrainedModel(inputs: TrainedModelRollInputs): TrainedModelRoll {
  if (inputs.rngUnits.length < TRAINED_MODEL_RNG_UNIT_COUNT) {
    throw new Error(
      `rollTrainedModel expected ${TRAINED_MODEL_RNG_UNIT_COUNT} rng units, got ${inputs.rngUnits.length}`,
    );
  }
  const qualityTier = modelQualityTierFromUnit(inputs.rngUnits[0]!);
  const statMultipliers = {
    moneyPerToken: rollStatMultiplierFromTierInputs(qualityTier, inputs.rngUnits[1]!, inputs.rngUnits[2]!),
    tokensPerSecond: rollStatMultiplierFromTierInputs(qualityTier, inputs.rngUnits[3]!, inputs.rngUnits[4]!),
    tokensPerToken: rollStatMultiplierFromTierInputs(qualityTier, inputs.rngUnits[5]!, inputs.rngUnits[6]!),
  };

  const stats = generatePostTrainingModelStats({
    baseModelId: inputs.baseModelId,
    tflopsUsed: inputs.tflopsUsed,
    dataTokens: inputs.gameDataTokens,
    hasDevelopmentWorkstation: inputs.trainingEfficiencyBoost > 1,
    unresolvedEventCount: inputs.unresolvedEventCount,
    unresolvedEventPenaltyReduction: inputs.unresolvedEventPenaltyReduction,
    overtrainBracket: inputs.overtrainBracket,
    qualityTier,
    statMultipliers,
    founder: inputs.founder,
  });

  const baseModel = getBaseModelDefinition(inputs.baseModelId);
  const benchmarkScore = computeTrainedBenchmark(baseModel?.benchmarkScore, qualityTier);
  const reputationGain = computeReputationGain(benchmarkScore, inputs.frontierBenchmark);

  return {
    model: {
      name: buildModelName(inputs.seed),
      qualityTier,
      moneyPerToken: stats.moneyPerToken,
      tokensPerSecond: stats.tokensPerSecond,
      tokensPerToken: stats.tokensPerToken,
      paramsB: baseModel?.paramsB ?? DEFAULT_MODEL_PARAMS_B,
      precision: "fp16",
      benchmarkScore,
      notes: [...stats.notes],
      launchState: "owned",
      baseModelId: inputs.baseModelId,
      trainingDataTokens: inputs.gameDataTokens,
      tflopsUsed: stats.tflopsUsed,
      trainingType: inputs.trainingType,
      isRevealed: false,
      createdAt: inputs.now,
      updatedAt: inputs.now,
    },
    reputationGain,
  };
}

export function computeTrainingWorkTokens(
  baseModel: Pick<
    BaseModelDefinition,
    "sourceType" | "trainingMethod" | "requiredDataTokens" | "distillPoolTokens"
  >,
  overtrainBracket = 1,
): number {
  const isOpenFineTune =
    baseModel.sourceType === "open_source" && baseModel.trainingMethod === "fine_tune";
  if (isOpenFineTune) {
    return Math.round(baseModel.requiredDataTokens * clampOvertrainBracket(overtrainBracket));
  }
  if (baseModel.trainingMethod === "distill") {
    return baseModel.distillPoolTokens ?? 100_000;
  }
  return Math.max(0, baseModel.requiredDataTokens);
}

export function computeTrainingDurationMs(
  workTokens: number,
  drainTokensPerSecond: number,
  durationMultiplier = 1,
): number {
  return Math.max(
    TRAINING_JOB_MIN_DURATION_MS_POST_TRAIN,
    Math.floor((workTokens / drainTokensPerSecond) * 1000 * Math.max(0, durationMultiplier)),
  );
}

export function clampOvertrainBracket(overtrainBracket: number | undefined): number {
  return Math.max(1, Math.min(4, Math.round(overtrainBracket ?? 1)));
}

export interface TrainingStartInputs {
  baseModel: BaseModelDefinition | undefined;
  isUnlocked: boolean;
  overtrainBracket?: number;
  gameDataTokens: number;
  hasActiveTraining: boolean;
  racks: readonly RackSnapshot[];
  computeAssignments: ComputeAssignmentMap | null | undefined;
  founder: FounderMultipliers;
  trainingDurationMultiplier: number;
  powerCapacityKw: number;
  startedBy: string;
  now: number;
}

export type TrainingStartDecision =
  | { started: false; reason: string }
  | { started: true; reserveDataTokens: number; spec: TrainingJobSpec };

export function decideTrainingStart(inputs: TrainingStartInputs): TrainingStartDecision {
  const { baseModel } = inputs;
  if (!baseModel) return { started: false, reason: "Unknown base model" };

  if (!inputs.isUnlocked) {
    if (baseModel.availability === "research_locked") {
      const cost = getResearchUnlockDataTokens(baseModel);
      return {
        started: false,
        reason: `Spend ${cost.toLocaleString()} data tokens to unlock ${baseModel.name} before training`,
      };
    }
    return {
      started: false,
      reason:
        baseModel.licenseCost > 0
          ? `Pay the $${baseModel.licenseCost} license to unlock ${baseModel.name} before training`
          : `${baseModel.name} is not available yet`,
    };
  }

  const bracket = clampOvertrainBracket(inputs.overtrainBracket);
  const isDistill = baseModel.trainingMethod === "distill";
  const isOpenFineTune = baseModel.sourceType === "open_source" && baseModel.trainingMethod === "fine_tune";

  if (isOpenFineTune) {
    const committed = Math.round(baseModel.requiredDataTokens * bracket);
    if (inputs.gameDataTokens < committed) {
      return {
        started: false,
        reason: `Need ${committed} data tokens for this run (${bracket}× base), have ${inputs.gameDataTokens}`,
      };
    }
  } else if (!isDistill && baseModel.requiredDataTokens > 0 && inputs.gameDataTokens < baseModel.requiredDataTokens) {
    return { started: false, reason: `Need ${baseModel.requiredDataTokens} data tokens, have ${inputs.gameDataTokens}` };
  }

  if (inputs.hasActiveTraining) return { started: false, reason: "Already training" };

  const rackStats = computeRackHardwareStats(inputs.racks);
  if (rackStats.totalInstalledGpus < 1 || rackStats.totalTrainingPowerFp16 < 1) {
    return { started: false, reason: "Need GPUs installed in racks to train" };
  }

  // Training runs only on cards dedicated to the Training lane (drag GPUs onto the model in the Inference app).
  const assignmentStats = computeAssignmentStats(
    rackAssignmentInputs(inputs.racks),
    inputs.computeAssignments,
  );
  const trainingLaneFp16 =
    assignmentStats.training.tflops * inputs.founder.trainingPowerFp16Multiplier;
  if (trainingLaneFp16 < 1) {
    return {
      started: false,
      reason: "Assign a GPU to Training in GPU jobs first",
    };
  }
  // Under-cooled or power-starved sites train slower too — the same throttle that caps serving caps training.
  const siteThermal = summarizeRackSiteThermal(
    rackThermalInputs(inputs.racks),
    { isComputeActive: true, powerCapacityKw: inputs.powerCapacityKw },
  );
  const energyThrottle = siteThermal.effectiveThermalThrottle * siteThermal.powerThrottle;
  const availableTrainingPower = Math.max(
    1,
    Math.floor(trainingLaneFp16 * energyThrottle),
  );
  /** Effective drain rate = (TPS per 1 TFLOP) × (allocated FP16 TFLOPs). */
  const drainTokensPerSecond = baseModel.tokensPerSecond * availableTrainingPower;
  const { now } = inputs;

  if (isOpenFineTune) {
    const committed = Math.round(baseModel.requiredDataTokens * bracket);
    return {
      started: true,
      reserveDataTokens: committed,
      spec: {
        startedBy: inputs.startedBy,
        baseModelId: baseModel.id,
        trainingType: "post_train",
        progressKind: "data_drain",
        overtrainBracket: bracket,
        workTokens: committed,
        drainTokensPerSecond,
        tflopsUsed: availableTrainingPower,
        vendorHourlyUsd: 0,
        reservedDataTokens: committed,
        durationMultiplier: inputs.trainingDurationMultiplier,
        startedAt: now,
      },
    };
  }

  if (isDistill) {
    return {
      started: true,
      reserveDataTokens: 0,
      spec: {
        startedBy: inputs.startedBy,
        baseModelId: baseModel.id,
        trainingType: "post_train",
        progressKind: "distill_pool",
        overtrainBracket: 1,
        workTokens: baseModel.distillPoolTokens ?? 100_000,
        drainTokensPerSecond,
        tflopsUsed: availableTrainingPower,
        vendorHourlyUsd: baseModel.vendorHourlyUsd ?? 0,
        reservedDataTokens: 0,
        durationMultiplier: inputs.trainingDurationMultiplier,
        startedAt: now,
      },
    };
  }

  return { started: false, reason: "This base model is not configured for training yet" };
}

export interface PostTrainingDurationEstimateInput {
  baseModel: Pick<
    BaseModelDefinition,
    "tokensPerSecond" | "trainingMethod" | "sourceType" | "requiredDataTokens" | "distillPoolTokens"
  >;
  /** Allocated FP16 TFLOPs for the training cohort (after founder, ratio, and site throttle). */
  availableTrainingPowerFp16: number;
  /** Open fine-tune: 1×–4× committed tokens (default 1 for base-model card). */
  overtrainBracket?: number;
  durationMultiplier?: number;
}

export function estimatePostTrainingDurationSeconds(input: PostTrainingDurationEstimateInput): number {
  const { baseModel, availableTrainingPowerFp16, overtrainBracket = 1, durationMultiplier = 1 } = input;

  const availableTrainingPower = availableTrainingPowerFp16 > 0 ? Math.max(1, Math.floor(availableTrainingPowerFp16)) : 0;
  const drainTokensPerSecond = baseModel.tokensPerSecond * availableTrainingPower;
  const workTokens = computeTrainingWorkTokens(baseModel, overtrainBracket);

  if (drainTokensPerSecond <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(
    1,
    Math.ceil(computeTrainingDurationMs(workTokens, drainTokensPerSecond, durationMultiplier) / 1000),
  );
}

/** Client preview: same allocation shape as {@link decideTrainingStart} (training-lane cards only). */
export function previewAvailableTrainingPowerFp16(options: {
  /** FP16 TFLOPs of GPUs dedicated to the Training lane (before founder buff). */
  trainingLaneTflops: number;
  founderTrainingPowerFp16Multiplier: number;
  thermalThrottle: number;
  powerThrottle: number;
}): number {
  const energyThrottle = options.thermalThrottle * options.powerThrottle;
  const scaledFp16 = options.trainingLaneTflops * options.founderTrainingPowerFp16Multiplier;
  return scaledFp16 < 1 ? 0 : Math.max(1, Math.floor(scaledFp16 * energyThrottle));
}

export const MODEL_SALE_QUALITY_FACTOR: Record<ModelQualityTierId, number> = {
  common: 1,
  uncommon: 1.35,
  rare: 2,
  sota: 3,
};

export const MODEL_SALE_FLOOR = 500;

const HOURS_PER_SALE_VALUATION = 24;

/** A model is worth about a day of the income it realizes on a reference card, scaled by its tier. */
export function computeModelSalePrice(model: {
  moneyPerToken: number;
  tokensPerSecond: number;
  tokensPerToken?: number;
  paramsB?: number;
  precision?: ComputePrecision | null;
  benchmarkScore?: number | null;
  qualityTier: ModelQualityTierId;
}): number {
  const incomePerHour = estimateModelIncomePerSecond(
    {
      tokensPerSecond: model.tokensPerSecond,
      moneyPerToken: model.moneyPerToken,
      tokensPerToken: model.tokensPerToken ?? 0,
      paramsB: model.paramsB,
      precision: model.precision,
      benchmarkScore: model.benchmarkScore,
    },
    undefined,
  ) * SECONDS_PER_HOUR;
  return Math.max(
    MODEL_SALE_FLOOR,
    Math.round(incomePerHour * HOURS_PER_SALE_VALUATION * MODEL_SALE_QUALITY_FACTOR[model.qualityTier]),
  );
}

export interface LicensedBaseServeModelRow {
  name: string;
  qualityTier: "common";
  moneyPerToken: number;
  tokensPerSecond: number;
  tokensPerToken: number;
  paramsB?: number;
  precision: "fp16";
  benchmarkScore?: number;
  launchState: "serving";
  baseModelId: string;
  isLicensedBaseServe: true;
  isRevealed: true;
  tflopsUsed: 0;
  createdAt: number;
  updatedAt: number;
}

/** Direct serve of a licensed open base: low money (leak/royalty); data tokens come from scraping instead. */
export function buildLicensedBaseServeModel(
  base: BaseModelDefinition,
  now: number,
): LicensedBaseServeModelRow {
  const leakMoneyPerToken = Math.max(0.0001, Math.round((base.moneyPerToken * 0.08) * 10000) / 10000);
  return {
    name: `${base.name} (licensed)`,
    qualityTier: "common",
    moneyPerToken: leakMoneyPerToken,
    tokensPerSecond: base.tokensPerSecond,
    tokensPerToken: base.tokensPerToken,
    paramsB: base.paramsB,
    precision: "fp16",
    benchmarkScore: base.benchmarkScore,
    launchState: "serving",
    baseModelId: base.id,
    isLicensedBaseServe: true,
    isRevealed: true,
    tflopsUsed: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface LaunchLicensedBaseServeInputs {
  baseModelId: string;
  modelCatalog: ModelCatalogMapRow | null | undefined;
  totalVramGb: number;
  now: number;
}

export type LaunchLicensedBaseServeDecision =
  | { launched: false; reason: string }
  | { launched: true; model: LicensedBaseServeModelRow };

export function decideLaunchLicensedBaseServe(
  inputs: LaunchLicensedBaseServeInputs,
): LaunchLicensedBaseServeDecision {
  const base = getBaseModelDefinition(inputs.baseModelId);
  if (!base) return { launched: false, reason: "Unknown base model" };
  if (base.sourceType !== "open_source") {
    return { launched: false, reason: "Only open licensed bases supported for direct serve" };
  }
  if (!isBaseModelUnlockedForGame(inputs.modelCatalog, base)) {
    return { launched: false, reason: "License this base model first" };
  }

  const footprintGb = computeModelVramFootprintGb(base.paramsB ?? DEFAULT_MODEL_PARAMS_B, "fp16");
  if (footprintGb > inputs.totalVramGb) {
    return {
      launched: false,
      reason: `Needs ${footprintGb.toFixed(0)} GB VRAM, only ${inputs.totalVramGb.toFixed(0)} GB installed`,
    };
  }

  return { launched: true, model: buildLicensedBaseServeModel(base, inputs.now) };
}
