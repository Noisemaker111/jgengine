import { describe, expect, test } from "bun:test";
import {
  TRAINED_MODEL_RNG_UNIT_COUNT,
  buildModelName,
  clampOvertrainBracket,
  computeModelSalePrice,
  computeTrainingDurationMs,
  MODEL_SALE_FLOOR,
  MODEL_SALE_QUALITY_FACTOR,
  computeTrainingWorkTokens,
  decideLaunchLicensedBaseServe,
  decideTrainingStart,
  estimatePostTrainingDurationSeconds,
  previewAvailableTrainingPowerFp16,
  rollTrainedModel,
  unitFromUint32,
  type TrainedModelRollInputs,
  type TrainingStartInputs,
} from "@llmville/game/models/trainingTransition";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";
import { estimateModelIncomePerSecond } from "@llmville/game/economy/servingEconomy";
import type { FounderMultipliers } from "@llmville/game/user/founder";

const NEUTRAL_FOUNDER: FounderMultipliers = {
  servingMoneyIncomeMultiplier: 1,
  servingDataTokensIncomeMultiplier: 1,
  servingThroughputMultiplier: 1,
  shopPriceMultiplier: 1,
  electricityBillMultiplier: 1,
  trainingPowerFp16Multiplier: 1,
};

describe("unitFromUint32", () => {
  test("maps 0 to 0", () => {
    expect(unitFromUint32(0)).toBe(0);
  });

  test("maps half of uint32 range to 0.5", () => {
    expect(unitFromUint32(2 ** 31)).toBe(0.5);
  });

  test("maps max uint32 to just under 1", () => {
    const result = unitFromUint32(2 ** 32 - 1);
    expect(result).toBeLessThan(1);
    expect(result).toBeCloseTo(1, 5);
  });

  test("treats negative inputs as unsigned via >>> 0", () => {
    expect(unitFromUint32(-1)).toBe(unitFromUint32(2 ** 32 - 1));
  });
});


describe("computeTrainingWorkTokens", () => {
  test("open fine-tune scales required tokens by the overtrain bracket", () => {
    const baseModel = getBaseModelDefinition("llamma_3")!;
    expect(computeTrainingWorkTokens(baseModel, 2)).toBe(Math.round(baseModel.requiredDataTokens * 2));
  });

  test("distill work uses the distill pool regardless of overtrain bracket", () => {
    const baseModel = getBaseModelDefinition("claudia_3")!;
    expect(computeTrainingWorkTokens(baseModel, 4)).toBe(baseModel.distillPoolTokens);
  });

  test("distill work defaults to 100000 when no pool is configured", () => {
    expect(
      computeTrainingWorkTokens({
        sourceType: "closed_source",
        trainingMethod: "distill",
        requiredDataTokens: 0,
        distillPoolTokens: undefined,
      }),
    ).toBe(100_000);
  });

  test("closed-source fine-tune falls back to required data tokens", () => {
    expect(
      computeTrainingWorkTokens({
        sourceType: "closed_source",
        trainingMethod: "fine_tune",
        requiredDataTokens: 500,
        distillPoolTokens: undefined,
      }),
    ).toBe(500);
  });
});

describe("computeTrainingDurationMs", () => {
  test("scales duration by work tokens over drain rate", () => {
    expect(computeTrainingDurationMs(4000, 10)).toBe(400_000);
  });

  test("clamps to the post-train minimum duration", () => {
    expect(computeTrainingDurationMs(10, 1000)).toBe(5000);
  });
});

describe("clampOvertrainBracket", () => {
  test("defaults to 1 when undefined", () => {
    expect(clampOvertrainBracket(undefined)).toBe(1);
  });

  test("clamps below the minimum", () => {
    expect(clampOvertrainBracket(0)).toBe(1);
  });

  test("clamps above the maximum", () => {
    expect(clampOvertrainBracket(10)).toBe(4);
  });

  test("rounds fractional brackets", () => {
    expect(clampOvertrainBracket(2.4)).toBe(2);
    expect(clampOvertrainBracket(4.6)).toBe(4);
  });
});

describe("computeModelSalePrice", () => {
  const llamma = { moneyPerToken: 0.06, tokensPerSecond: 6, benchmarkScore: 62 } as const;

  test("prices a model at roughly a day of the income it realizes", () => {
    const price = computeModelSalePrice({ ...llamma, qualityTier: "common" });
    const dailyIncome = estimateModelIncomePerSecond({ ...llamma, tokensPerToken: 0 }, undefined) * 3600 * 24;
    expect(price).toBe(Math.round(dailyIncome));
  });

  test("scales with the quality tier", () => {
    const common = computeModelSalePrice({ ...llamma, qualityTier: "common" });
    expect(computeModelSalePrice({ ...llamma, qualityTier: "uncommon" })).toBe(Math.round(common * MODEL_SALE_QUALITY_FACTOR.uncommon));
    expect(computeModelSalePrice({ ...llamma, qualityTier: "rare" })).toBe(Math.round(common * MODEL_SALE_QUALITY_FACTOR.rare));
    expect(computeModelSalePrice({ ...llamma, qualityTier: "sota" })).toBe(Math.round(common * MODEL_SALE_QUALITY_FACTOR.sota));
  });

  test("floors a worthless model at the salvage price", () => {
    expect(computeModelSalePrice({ moneyPerToken: 0, tokensPerSecond: 0, qualityTier: "common" })).toBe(MODEL_SALE_FLOOR);
  });
});

describe("rollTrainedModel", () => {
  const baseInputs: TrainedModelRollInputs = {
    seed: "seed-1",
    baseModelId: "llamma_3",
    trainingType: "post_train",
    tflopsUsed: 10,
    gameDataTokens: 2000,
    unresolvedEventCount: 0,
    trainingEfficiencyBoost: 1,
    unresolvedEventPenaltyReduction: 0,
    overtrainBracket: 1,
    founder: NEUTRAL_FOUNDER,
    frontierBenchmark: 62,
    rngUnits: [0, 0, 0, 0, 0, 0, 0],
    now: 1_700_000_000_000,
  };

  test("throws if fewer rng units are supplied than required", () => {
    expect(() => rollTrainedModel({ ...baseInputs, rngUnits: [0, 0, 0] })).toThrow(
      `rollTrainedModel expected ${TRAINED_MODEL_RNG_UNIT_COUNT} rng units, got 3`,
    );
  });

  test("rolls a deterministic common-tier model from all-zero rng draws", () => {
    const roll = rollTrainedModel(baseInputs);
    expect(roll.model.qualityTier).toBe("common");
    expect(roll.model.moneyPerToken).toBeCloseTo(0.06, 6);
    expect(roll.model.tokensPerSecond).toBeCloseTo(6, 6);
    expect(roll.model.tokensPerToken).toBeCloseTo(0.012, 6);
    expect(roll.model.paramsB).toBe(2);
    expect(roll.model.precision).toBe("fp16");
    expect(roll.model.launchState).toBe("owned");
    expect(roll.model.isRevealed).toBe(false);
    expect(roll.model.baseModelId).toBe("llamma_3");
    expect(roll.model.createdAt).toBe(baseInputs.now);
    expect(roll.model.updatedAt).toBe(baseInputs.now);
    expect(roll.model.name).toMatch(/^\w+ \w+ Lab-\d{3}$/);
  });

  test("rolls a higher tier and jitters stats downward past the positive-bias threshold", () => {
    const roll = rollTrainedModel({
      ...baseInputs,
      rngUnits: [0.99, 0.9, 0.5, 0.9, 0.5, 0.9, 0.5],
    });
    expect(roll.model.qualityTier).toBe("sota");
    expect(roll.model.moneyPerToken).toBeLessThan(0.06);
    expect(roll.model.tokensPerSecond).toBeLessThan(6);
    expect(roll.model.tokensPerToken).toBeLessThan(0.012);
  });

  test("computes reputation gain from the trained benchmark vs the frontier", () => {
    const belowFrontier = rollTrainedModel({ ...baseInputs, frontierBenchmark: 200 });
    const aboveFrontier = rollTrainedModel({ ...baseInputs, frontierBenchmark: 1 });
    expect(aboveFrontier.reputationGain).toBeGreaterThan(belowFrontier.reputationGain);
  });
});

describe("buildModelName", () => {
  test("produces a deterministic, formatted name for a given seed", () => {
    const name = buildModelName("stable-seed");
    expect(name).toBe(buildModelName("stable-seed"));
    expect(name).toMatch(/^\w+ \w+ Lab-\d{3}$/);
  });

  test("changes when the seed changes", () => {
    expect(buildModelName("seed-a")).not.toBe(buildModelName("seed-b"));
  });
});

describe("decideLaunchLicensedBaseServe", () => {
  test("rejects an unknown base model", () => {
    expect(decideLaunchLicensedBaseServe({ baseModelId: "nope", modelCatalog: null, totalVramGb: 1000, now: 0 })).toEqual({
      launched: false,
      reason: "Unknown base model",
    });
  });

  test("rejects closed-source bases", () => {
    expect(decideLaunchLicensedBaseServe({ baseModelId: "claudia_3", modelCatalog: null, totalVramGb: 1000, now: 0 })).toEqual({
      launched: false,
      reason: "Only open licensed bases supported for direct serve",
    });
  });

  test("requires the base model to be licensed first", () => {
    expect(decideLaunchLicensedBaseServe({ baseModelId: "qwither_2", modelCatalog: null, totalVramGb: 1000, now: 0 })).toEqual({
      launched: false,
      reason: "License this base model first",
    });
  });

  test("rejects when installed VRAM is too small", () => {
    const decision = decideLaunchLicensedBaseServe({ baseModelId: "llamma_3", modelCatalog: null, totalVramGb: 4, now: 0 });
    expect(decision).toEqual({ launched: false, reason: "Needs 5 GB VRAM, only 4 GB installed" });
  });

  test("launches a licensed direct-serve model with the leak royalty formula", () => {
    const now = 12345;
    const decision = decideLaunchLicensedBaseServe({ baseModelId: "llamma_3", modelCatalog: null, totalVramGb: 50, now });
    expect(decision.launched).toBe(true);
    if (!decision.launched) return;
    expect(decision.model).toEqual({
      name: "Llamma 3 Mini (licensed)",
      qualityTier: "common",
      moneyPerToken: 0.0048,
      tokensPerSecond: 6,
      tokensPerToken: 0.012,
      paramsB: 2,
      precision: "fp16",
      benchmarkScore: 62,
      launchState: "serving",
      baseModelId: "llamma_3",
      isLicensedBaseServe: true,
      isRevealed: true,
      tflopsUsed: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
});

describe("previewAvailableTrainingPowerFp16", () => {
  test("applies lane throughput and throttles", () => {
    const power = previewAvailableTrainingPowerFp16({
      trainingLaneTflops: 100,
      thermalThrottle: 0.5,
      powerThrottle: 0.8,
      founderTrainingPowerFp16Multiplier: 1.25,
    });
    expect(power).toBeCloseTo(100 * 0.5 * 0.8 * 1.25, 5);
  });

  test("reports zero power when no GPUs are assigned", () => {
    const power = previewAvailableTrainingPowerFp16({
      trainingLaneTflops: 0,
      thermalThrottle: 1,
      powerThrottle: 1,
      founderTrainingPowerFp16Multiplier: 1,
    });
    expect(power).toBe(0);
  });
});

describe("computeTrainingDurationMs", () => {
  test("upgrade duration multiplier shortens the run", () => {
    expect(computeTrainingDurationMs(1_000_000, 100, 0.85)).toBe(
      Math.floor(computeTrainingDurationMs(1_000_000, 100) * 0.85),
    );
  });
});

describe("estimatePostTrainingDurationSeconds", () => {
  test("returns positive seconds for a base model", () => {
    const baseModel = getBaseModelDefinition("llamma_3");
    expect(baseModel).not.toBeNull();
    const seconds = estimatePostTrainingDurationSeconds({
      baseModel: baseModel!,
      availableTrainingPowerFp16: 50,
      overtrainBracket: 1,
    });
    expect(seconds).toBeGreaterThan(0);
  });

  test("scales with the overtrain bracket for open fine-tunes", () => {
    const baseModel = getBaseModelDefinition("llamma_3")!;
    const oneX = estimatePostTrainingDurationSeconds({ baseModel, availableTrainingPowerFp16: 50, overtrainBracket: 1 });
    const fourX = estimatePostTrainingDurationSeconds({ baseModel, availableTrainingPowerFp16: 50, overtrainBracket: 4 });
    expect(fourX).toBeGreaterThan(oneX);
  });
});

describe("decideTrainingStart", () => {
  const baseInputs: TrainingStartInputs = {
    baseModel: getBaseModelDefinition("llamma_3"),
    isUnlocked: true,
    overtrainBracket: 1,
    gameDataTokens: 2000,
    hasActiveTraining: false,
    racks: [],
    computeAssignments: undefined,
    tier: "garage",
    founder: NEUTRAL_FOUNDER,
    trainingDurationMultiplier: 1,
    powerCapacityKw: 600,
    startedBy: "player-1",
    now: 1_700_000_000_000,
  };

  test("rejects an unknown base model", () => {
    expect(decideTrainingStart({ ...baseInputs, baseModel: undefined })).toEqual({
      started: false,
      reason: "Unknown base model",
    });
  });

  test("directs research-locked models to the unlock path", () => {
    const decision = decideTrainingStart({ ...baseInputs, baseModel: getBaseModelDefinition("alpaca_2"), isUnlocked: false });
    expect(decision).toEqual({
      started: false,
      reason: "Spend 5,000 data tokens to unlock Alpaca 2 before training",
    });
  });

  test("directs licensed models to the license path", () => {
    const decision = decideTrainingStart({ ...baseInputs, baseModel: getBaseModelDefinition("qwither_2"), isUnlocked: false });
    expect(decision).toEqual({
      started: false,
      reason: "Pay the $2000 license to unlock Qwither 2 32B before training",
    });
  });

  test("requires enough committed data tokens for an open fine-tune", () => {
    const decision = decideTrainingStart({ ...baseInputs, gameDataTokens: 100 });
    expect(decision).toEqual({
      started: false,
      reason: "Need 500 data tokens for this run (1× base), have 100",
    });
  });

  test("scales the committed token requirement by the overtrain bracket", () => {
    const decision = decideTrainingStart({ ...baseInputs, gameDataTokens: 500, overtrainBracket: 2 });
    expect(decision).toEqual({
      started: false,
      reason: "Need 1000 data tokens for this run (2× base), have 500",
    });
  });

  test("rejects a second concurrent training run", () => {
    const decision = decideTrainingStart({ ...baseInputs, hasActiveTraining: true });
    expect(decision).toEqual({ started: false, reason: "Already training" });
  });

  test("requires installed GPUs", () => {
    const decision = decideTrainingStart({ ...baseInputs, racks: [] });
    expect(decision).toEqual({ started: false, reason: "Need GPUs installed in racks to train" });
  });

  test("requires cards dedicated to the training lane", () => {
    const decision = decideTrainingStart({
      ...baseInputs,
      racks: [{ rackId: "rack-1", rackType: "starter_rack", installedHardwareModuleIds: ["gpu_16", null] }],
      computeAssignments: {},
    });
    expect(decision).toEqual({ started: false, reason: "Assign a GPU to Training in GPU jobs first" });
  });

  test("starts an open fine-tune once a card is dedicated to training", () => {
    const decision = decideTrainingStart({
      ...baseInputs,
      racks: [{ rackId: "rack-1", rackType: "starter_rack", installedHardwareModuleIds: ["gpu_16", null] }],
      computeAssignments: { "rack-1:0": { lane: "training" } },
    });
    expect(decision.started).toBe(true);
    if (!decision.started) return;
    expect(decision.reserveDataTokens).toBe(500);
    expect(decision.spec.progressKind).toBe("data_drain");
    expect(decision.spec.workTokens).toBe(500);
    expect(decision.spec.reservedDataTokens).toBe(500);
    expect(decision.spec.overtrainBracket).toBe(1);
    expect(decision.spec.baseModelId).toBe("llamma_3");
    expect(decision.spec.startedBy).toBe("player-1");
    expect(decision.spec.tflopsUsed).toBeGreaterThanOrEqual(1);
    expect(decision.spec.drainTokensPerSecond).toBeGreaterThan(0);
    expect(decision.spec.vendorHourlyUsd).toBe(0);
  });

  test("starts a distill job against the distill pool", () => {
    const decision = decideTrainingStart({
      ...baseInputs,
      baseModel: getBaseModelDefinition("claudia_3"),
      racks: [{ rackId: "rack-1", rackType: "starter_rack", installedHardwareModuleIds: ["gpu_16", null] }],
      computeAssignments: { "rack-1:0": { lane: "training" } },
    });
    expect(decision.started).toBe(true);
    if (!decision.started) return;
    expect(decision.reserveDataTokens).toBe(0);
    expect(decision.spec.progressKind).toBe("distill_pool");
    expect(decision.spec.workTokens).toBe(150_000);
    expect(decision.spec.reservedDataTokens).toBe(0);
    expect(decision.spec.overtrainBracket).toBe(1);
  });
});
