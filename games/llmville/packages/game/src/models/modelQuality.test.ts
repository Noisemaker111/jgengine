import { describe, expect, test } from "bun:test";
import {
  generatePostTrainingModelStats,
  modelQualityTierFromUnit,
  overtrainStatMultiplier,
  rollStatMultiplierFromTierInputs,
} from "@llmville/game/models/modelQuality";
import type { FounderMultipliers } from "@llmville/game/user/founder";

const NEUTRAL_FOUNDER: FounderMultipliers = {
  servingMoneyIncomeMultiplier: 1,
  servingDataTokensIncomeMultiplier: 1,
  servingThroughputMultiplier: 1,
  shopPriceMultiplier: 1,
  electricityBillMultiplier: 1,
  trainingPowerFp16Multiplier: 1,
};

describe("modelQualityTierFromUnit", () => {
  test("maps the low end of each weighted band", () => {
    expect(modelQualityTierFromUnit(0)).toBe("common");
    expect(modelQualityTierFromUnit(0.7)).toBe("uncommon");
    expect(modelQualityTierFromUnit(0.9)).toBe("rare");
    expect(modelQualityTierFromUnit(0.975)).toBe("sota");
  });

  test("maps the high end of each weighted band", () => {
    expect(modelQualityTierFromUnit(0.6999)).toBe("common");
    expect(modelQualityTierFromUnit(0.8999)).toBe("uncommon");
    expect(modelQualityTierFromUnit(0.9749)).toBe("rare");
    expect(modelQualityTierFromUnit(0.9999)).toBe("sota");
  });

  test("rejects draws outside [0, 1)", () => {
    expect(() => modelQualityTierFromUnit(-0.1)).toThrow();
    expect(() => modelQualityTierFromUnit(1)).toThrow();
  });
});

describe("rollStatMultiplierFromTierInputs", () => {
  test("rolls a positive deviation below the bias threshold", () => {
    expect(rollStatMultiplierFromTierInputs("common", 0, 0.5)).toBeCloseTo(1.025, 6);
  });

  test("rolls a negative deviation at and above the bias threshold", () => {
    expect(rollStatMultiplierFromTierInputs("sota", 0.75, 0.5)).toBeCloseTo(0.85, 6);
    expect(rollStatMultiplierFromTierInputs("sota", 0.9, 0.5)).toBeCloseTo(0.85, 6);
  });

  test("scales the jitter cap by tier", () => {
    expect(rollStatMultiplierFromTierInputs("common", 0, 1 - Number.EPSILON)).toBeCloseTo(1.05, 2);
    expect(rollStatMultiplierFromTierInputs("uncommon", 0, 1 - Number.EPSILON)).toBeCloseTo(1.1, 2);
    expect(rollStatMultiplierFromTierInputs("rare", 0, 1 - Number.EPSILON)).toBeCloseTo(1.2, 2);
    expect(rollStatMultiplierFromTierInputs("sota", 0, 1 - Number.EPSILON)).toBeCloseTo(1.3, 2);
  });

  test("rejects draws outside [0, 1)", () => {
    expect(() => rollStatMultiplierFromTierInputs("common", -0.1, 0.5)).toThrow();
    expect(() => rollStatMultiplierFromTierInputs("common", 1, 0.5)).toThrow();
    expect(() => rollStatMultiplierFromTierInputs("common", 0.5, -0.1)).toThrow();
    expect(() => rollStatMultiplierFromTierInputs("common", 0.5, 1)).toThrow();
  });
});

describe("overtrainStatMultiplier", () => {
  test("is neutral at bracket 1", () => {
    expect(overtrainStatMultiplier(1)).toBe(1);
  });

  test("reaches +20% at bracket 4", () => {
    expect(overtrainStatMultiplier(4)).toBeCloseTo(1.2, 6);
  });

  test("interpolates linearly between brackets", () => {
    expect(overtrainStatMultiplier(2)).toBeCloseTo(1 + (1 / 3) * 0.2, 6);
  });

  test("clamps below 1 and above 4", () => {
    expect(overtrainStatMultiplier(0)).toBe(1);
    expect(overtrainStatMultiplier(10)).toBeCloseTo(1.2, 6);
  });
});

describe("generatePostTrainingModelStats", () => {
  test("applies base stats unchanged at neutral inputs", () => {
    const stats = generatePostTrainingModelStats({
      baseModelId: "llamma_3",
      tflopsUsed: 10,
      dataTokens: 1000,
      hasDevelopmentWorkstation: false,
      unresolvedEventCount: 0,
      unresolvedEventPenaltyReduction: 0,
      overtrainBracket: 1,
      qualityTier: "common",
      statMultipliers: { moneyPerToken: 1, tokensPerSecond: 1, tokensPerToken: 1 },
      founder: NEUTRAL_FOUNDER,
    });
    expect(stats.moneyPerToken).toBeCloseTo(0.06, 6);
    expect(stats.tokensPerSecond).toBeCloseTo(6, 6);
    expect(stats.tokensPerToken).toBeCloseTo(0.012, 6);
    expect(stats.tflopsUsed).toBe(10);
    expect(stats.notes).toEqual(["Post-training complete. Ready to serve."]);
  });

  test("combines overtrain, penalty, dev boost, founder, and jitter multipliers", () => {
    const stats = generatePostTrainingModelStats({
      baseModelId: "llamma_3",
      tflopsUsed: 10,
      dataTokens: 1000,
      hasDevelopmentWorkstation: true,
      unresolvedEventCount: 2,
      unresolvedEventPenaltyReduction: 0.5,
      overtrainBracket: 4,
      qualityTier: "common",
      statMultipliers: { moneyPerToken: 1.1, tokensPerSecond: 0.9, tokensPerToken: 1.2 },
      founder: {
        ...NEUTRAL_FOUNDER,
        servingMoneyIncomeMultiplier: 1.05,
        servingDataTokensIncomeMultiplier: 1.1,
        servingThroughputMultiplier: 1.2,
      },
    });
    expect(stats.moneyPerToken).toBeCloseTo(0.08316, 6);
    expect(stats.tokensPerSecond).toBeCloseTo(7.75656, 5);
    expect(stats.tokensPerToken).toBeCloseTo(0.019008, 6);
    expect(stats.notes).toEqual(["Lab events may have affected throughput. Resolve for better performance."]);
  });

  test("flags a closed-source distillation completion note", () => {
    const stats = generatePostTrainingModelStats({
      baseModelId: "claudia_3",
      tflopsUsed: 10,
      dataTokens: 0,
      hasDevelopmentWorkstation: false,
      unresolvedEventCount: 0,
      unresolvedEventPenaltyReduction: 0,
      overtrainBracket: 1,
      qualityTier: "common",
      statMultipliers: { moneyPerToken: 1, tokensPerSecond: 1, tokensPerToken: 1 },
      founder: NEUTRAL_FOUNDER,
    });
    expect(stats.notes).toEqual(["Distillation complete. Ready to serve."]);
  });

  test("floors the unresolved-event penalty at 0.7", () => {
    const stats = generatePostTrainingModelStats({
      baseModelId: "llamma_3",
      tflopsUsed: 10,
      dataTokens: 0,
      hasDevelopmentWorkstation: false,
      unresolvedEventCount: 100,
      unresolvedEventPenaltyReduction: 0,
      overtrainBracket: 1,
      qualityTier: "common",
      statMultipliers: { moneyPerToken: 1, tokensPerSecond: 1, tokensPerToken: 1 },
      founder: NEUTRAL_FOUNDER,
    });
    expect(stats.tokensPerSecond).toBeCloseTo(6 * 0.7, 6);
  });
});
