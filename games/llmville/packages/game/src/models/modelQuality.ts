import type { FounderMultipliers } from "@llmville/game/user/founder";

import { getBaseModelDefinition } from "./baseModels";

export const MODEL_QUALITY_TIER_VALUES = ["common", "uncommon", "rare", "sota"] as const;

export type ModelQualityTierId = (typeof MODEL_QUALITY_TIER_VALUES)[number];

/**
 * Gacha weights for trained model rarity (must sum to 1).
 * Post-training rolls tier first; that tier sets the max stat jitter band (see {@link MODEL_QUALITY_TIER_MAX_JITTER_PERCENT}).
 */
const MODEL_QUALITY_TIER_GACHA_WEIGHTS = [
  ["common", 0.7],
  ["uncommon", 0.2],
  ["rare", 0.075],
  ["sota", 0.025],
] as const satisfies ReadonlyArray<readonly [ModelQualityTierId, number]>;

/** Max deviation (percent of baseline) for each economy stat roll at that tier; sign/magnitude use {@link rollStatMultiplierFromTierInputs}. */
const MODEL_QUALITY_TIER_MAX_JITTER_PERCENT: Readonly<Record<ModelQualityTierId, number>> = {
  common: 5,
  uncommon: 10,
  rare: 20,
  sota: 30,
};

/** Share of rolls that move each stat in the “better than baseline” direction (vs worse). */
const TIER_STAT_JITTER_POSITIVE_BIAS = 0.75;

/**
 * One economy-stat multiplier from deterministic uniforms: `uSign` picks biased direction, `uMag` picks magnitude within the tier cap.
 * Requires two independent draws per stat at completion time (plus one uniform for tier → {@link modelQualityTierFromUnit}).
 */
export function rollStatMultiplierFromTierInputs(tier: ModelQualityTierId, uSign: number, uMag: number): number {
  if (!Number.isFinite(uSign) || uSign < 0 || uSign >= 1) {
    throw new Error(`rollStatMultiplierFromTierInputs expected uSign in [0, 1), got ${uSign}`);
  }
  if (!Number.isFinite(uMag) || uMag < 0 || uMag >= 1) {
    throw new Error(`rollStatMultiplierFromTierInputs expected uMag in [0, 1), got ${uMag}`);
  }
  const maxPercent = MODEL_QUALITY_TIER_MAX_JITTER_PERCENT[tier];
  const isPositive = uSign < TIER_STAT_JITTER_POSITIVE_BIAS;
  const sign = isPositive ? 1 : -1;
  const deviationPercent = uMag * maxPercent;
  return 1 + (sign * deviationPercent) / 100;
}

/** Linear +20% to rolled base stats when committing 4× the minimum data (1× → 1.0, 4× → 1.2). */
export function overtrainStatMultiplier(overtrainBracket: number): number {
  const b = Math.max(1, Math.min(4, Math.round(overtrainBracket)));
  return 1 + ((b - 1) / 3) * 0.2;
}

export interface PostTrainingStatMultipliers {
  moneyPerToken: number;
  tokensPerSecond: number;
  tokensPerToken: number;
}

/** Server-only completion path: founder perks apply to baselines before tier jitter; `qualityTier` must match the tier used to roll `statMultipliers`. */
export function generatePostTrainingModelStats(params: {
  baseModelId: string;
  tflopsUsed: number;
  dataTokens: number;
  hasDevelopmentWorkstation: boolean;
  unresolvedEventCount: number;
  unresolvedEventPenaltyReduction: number;
  overtrainBracket: number;
  qualityTier: ModelQualityTierId;
  statMultipliers: PostTrainingStatMultipliers;
  founder: FounderMultipliers;
}) {
  const baseModel = getBaseModelDefinition(params.baseModelId);
  const ot = overtrainStatMultiplier(params.overtrainBracket);
  const baseMpt = (baseModel?.moneyPerToken ?? 0.0005) * ot;
  const baseTps = (baseModel?.tokensPerSecond ?? 5) * ot;
  const baseTpt = (baseModel?.tokensPerToken ?? 0) * ot;
  const penaltyFactor = Math.max(0.7, 1 - params.unresolvedEventCount * 0.05 * (1 - params.unresolvedEventPenaltyReduction));
  const devBoost = params.hasDevelopmentWorkstation ? 1.05 : 1;
  const moneyPerToken = Math.max(
    1e-12,
    baseMpt * params.founder.servingMoneyIncomeMultiplier * params.statMultipliers.moneyPerToken,
  );
  const tokensPerSecond = Math.max(
    0.01,
    baseTps
      * penaltyFactor
      * devBoost
      * params.founder.servingThroughputMultiplier
      * params.statMultipliers.tokensPerSecond,
  );
  const tokensPerToken = Math.max(
    0,
    baseTpt * params.founder.servingDataTokensIncomeMultiplier * params.statMultipliers.tokensPerToken,
  );

  return {
    moneyPerToken,
    tokensPerSecond,
    tokensPerToken,
    tflopsUsed: params.tflopsUsed,
    notes: params.unresolvedEventCount > 0
      ? ["Lab events may have affected throughput. Resolve for better performance."]
      : [baseModel?.sourceType === "closed_source" ? "Distillation complete. Ready to serve." : "Post-training complete. Ready to serve."],
  };
}

/** Map a uniform draw u ∈ [0, 1) to a tier using {@link MODEL_QUALITY_TIER_GACHA_WEIGHTS}. */
export function modelQualityTierFromUnit(u: number): ModelQualityTierId {
  if (!Number.isFinite(u) || u < 0 || u >= 1) {
    throw new Error(`modelQualityTierFromUnit expected u in [0, 1), got ${u}`);
  }
  let cumulative = 0;
  for (const [tier, weight] of MODEL_QUALITY_TIER_GACHA_WEIGHTS) {
    cumulative += weight;
    if (u < cumulative) return tier;
  }
  return "sota";
}
