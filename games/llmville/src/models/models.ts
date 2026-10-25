import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { formatBaseModelTrainingVolumeLabel, getBaseModelDefinition } from "@llmville/game/models/baseModels";
import { DEFAULT_MODEL_PARAMS_B, computeModelVramFootprintGb, getQuantizationProfile } from "@llmville/game/models/quantization";
import { BENCHMARK_DEMAND_REFERENCE } from "@llmville/game/models/servingStats";
import type { ComputePrecision } from "@llmville/game/infrastructure/catalog";
import type { ModelLaunchState } from "@llmville/game/models/servingMode";
import type { ModelQualityTierId } from "@llmville/game/models/modelQuality";
import { useCallback } from "react";

import { withEditAccess, wrapMutation } from "@/runtime/gameEngine";
import { estimateModelIncomePerSecond } from "@llmville/game/economy/servingEconomy";
import { formatMoney } from "@/economy/economy";

export interface GameUserModel {
  id: Id<"models">;
  name: string;
  qualityTier: ModelQualityTierId;
  isRevealed: boolean;
  launchState: ModelLaunchState;
  moneyPerToken: number;
  tokensPerSecond: number;
  tokensPerToken: number;
  /** $/s this model would earn on the cards bound to it (or one starter GPU when unassigned). */
  estimatedIncomePerSecond: number;
  baseModelId?: string;
  trainingDataTokens?: number;
  tflopsUsed?: number;
  paramsB: number;
  precision: ComputePrecision;
  precisionLabel: string;
  footprintGb: number;
  benchmarkScore: number;
}

/** Subtitle copy from the base catalog’s training-volume rule (data tokens / distill pool). */
export function userModelTrainingVolumeLabel(model: Pick<GameUserModel, "baseModelId">): string {
  if (model.baseModelId) {
    const b = getBaseModelDefinition(model.baseModelId);
    if (b) return formatBaseModelTrainingVolumeLabel(b);
  }
  return "Custom";
}

export type ModelArchetype = "chat" | "code" | "vision" | "agentic";

export interface GeneratedModelSpec {
  name: string;
  archetype: ModelArchetype;
  /** Human-readable training volume (data tokens / pool); not a duplicate “params” integer. */
  trainingVolumeLabel: string;
  maxTokensPerSecond: number;
  moneyPerToken: number;
  expectedIncomePerSecond: number;
  notes: readonly string[];
}

export interface GameModelState {
  _id: Id<"models">;
  name: string;
  qualityTier: ModelQualityTierId;
  isRevealed?: boolean;
  isLicensedBaseServe?: boolean;
  launchState: ModelLaunchState;
  moneyPerToken: number;
  tokensPerSecond: number;
  tokensPerToken: number;
  baseModelId?: string;
  trainingDataTokens?: number;
  tflopsUsed?: number;
  paramsB?: number;
  precision?: ComputePrecision;
  benchmarkScore?: number;
  notes?: readonly string[];
}

export interface ModelIncomeEstimateContext {
  servingAssignments: ReadonlyMap<string, { tflops: number; bandwidthGbps: number }>;
  frontierBenchmark: number;
}

function estimatedIncomePerSecondFor(
  model: GameModelState,
  context: ModelIncomeEstimateContext | undefined,
): number {
  return estimateModelIncomePerSecond(
    {
      tokensPerSecond: model.tokensPerSecond,
      moneyPerToken: model.moneyPerToken,
      tokensPerToken: model.tokensPerToken,
      paramsB: model.paramsB,
      precision: model.precision,
      benchmarkScore: model.benchmarkScore,
    },
    context?.servingAssignments.get(model._id as string),
    context?.frontierBenchmark,
  );
}

export function mapUserModels(
  models: readonly GameModelState[] | undefined,
  context?: ModelIncomeEstimateContext,
): readonly GameUserModel[] {
  return (models ?? []).map((model) => ({
    id: model._id,
    name: model.name,
    qualityTier: model.qualityTier,
    isRevealed: model.isRevealed ?? true,
    launchState: model.launchState,
    moneyPerToken: model.moneyPerToken,
    tokensPerSecond: model.tokensPerSecond,
    tokensPerToken: model.tokensPerToken,
    estimatedIncomePerSecond: estimatedIncomePerSecondFor(model, context),
    baseModelId: model.baseModelId,
    trainingDataTokens: model.trainingDataTokens,
    tflopsUsed: model.tflopsUsed,
    paramsB: model.paramsB ?? DEFAULT_MODEL_PARAMS_B,
    precision: model.precision ?? "fp16",
    precisionLabel: getQuantizationProfile(model.precision).label,
    footprintGb: computeModelVramFootprintGb(model.paramsB ?? DEFAULT_MODEL_PARAMS_B, model.precision),
    benchmarkScore: model.benchmarkScore ?? BENCHMARK_DEMAND_REFERENCE,
  }));
}

export function findOwnedModel(models: readonly GameModelState[] | undefined): GameModelState | undefined {
  return models?.find((model) => model.launchState === "owned");
}

function mapModel(model: GameModelState, context: ModelIncomeEstimateContext | undefined): GeneratedModelSpec {
  return {
    name: model.name,
    archetype: "chat",
    trainingVolumeLabel: userModelTrainingVolumeLabel(model),
    maxTokensPerSecond: model.tokensPerSecond,
    moneyPerToken: model.moneyPerToken,
    expectedIncomePerSecond: estimatedIncomePerSecondFor(model, context),
    notes: model.notes ?? [],
  };
}

export function buildLaunchedModels(
  models: readonly GameModelState[],
  context?: ModelIncomeEstimateContext,
): GeneratedModelSpec[] {
  return models
    .filter((model) => model.launchState === "serving")
    .map((model) => mapModel(model, context));
}

export function buildDraftModelPreview(
  draftModel: GameModelState | undefined,
  context?: ModelIncomeEstimateContext,
): GeneratedModelSpec | null {
  if (draftModel === undefined) {
    return null;
  }
  return mapModel(draftModel, context);
}

export function formatModelQualityTierLabel(qualityTier: ModelQualityTierId): string {
  if (qualityTier === "sota") return "SOTA";
  if (qualityTier === "uncommon") return "Uncommon";
  if (qualityTier === "rare") return "Rare";
  return "Common";
}

export function moneyPerTokenToPmt(moneyPerToken: number): number {
  return Math.round((moneyPerToken ?? 0) * 1_000_000);
}

export function benchmarkToBarValue(benchmarkScore: number): number {
  const maxBenchmark = 100;
  return Math.min(100, Math.round(((benchmarkScore ?? 50) / maxBenchmark) * 100));
}

export function priceToBarValue(pricePerMillion: number): number {
  const maxPmt = 1000;
  return Math.min(100, Math.round(((pricePerMillion ?? 200) / maxPmt) * 100));
}

export function tpsToBarValue(tps: number): number {
  const maxTps = 20;
  return Math.min(100, Math.round(((tps ?? 1) / maxTps) * 100));
}

/** Bar fill for data-token accrual rate (tokens per inference token), typical range 0–0.05. */
export function dataTokenRateToBarValue(rate: number): number {
  const maxRate = 0.05;
  return Math.min(100, Math.round(((rate ?? 0) / maxRate) * 100));
}

export function formatHourlyIncome(incomePerSecond: number): string {
  const hourly = incomePerSecond * 3600;
  if (hourly >= 1_000_000) return `$${(hourly / 1_000_000).toFixed(1)}M est./hr`;
  if (hourly >= 1000) return `$${(hourly / 1000).toFixed(0)}k est./hr`;
  return `$${formatMoney(hourly)} est./hr`;
}

interface UseGameModelActionsParams {
  canEditGame: boolean;
  gameId: Id<"games"> | null;
  fallbackGameId: Id<"games">;
  playerId: string;
  ownedModelId: Id<"models"> | undefined;
  serveModelMutation: (args: { modelId: Id<"models">; externalId?: string }) => Promise<{ served: boolean }>;
  renameModelMutation: (args: { modelId: Id<"models">; newName: string; externalId?: string }) => Promise<unknown>;
  revealModelMutation: (args: { modelId: Id<"models">; externalId?: string }) => Promise<unknown>;
  quantizeModelMutation: (args: { modelId: Id<"models">; precision: ComputePrecision; externalId?: string }) => Promise<{ quantized: boolean; reason?: string }>;
  onLaunchCelebration: () => void;
}

export function useGameModelActions({
  canEditGame,
  gameId,
  fallbackGameId,
  playerId,
  ownedModelId,
  serveModelMutation,
  renameModelMutation,
  revealModelMutation,
  quantizeModelMutation,
  onLaunchCelebration,
}: UseGameModelActionsParams) {
  const onServeModel = useCallback(
    (modelId: Id<"models">) => {
      if (!canEditGame) return undefined;
      return wrapMutation(
        "serveModel",
        serveModelMutation({ modelId, externalId: playerId }).then((result) => {
          if (result.served) {
            onLaunchCelebration();
          }
          return result;
        }),
      );
    },
    [canEditGame, onLaunchCelebration, playerId, serveModelMutation],
  );

  const onLaunchDraftModel = useCallback(() => {
    if (!canEditGame || ownedModelId === undefined) return undefined;
    return onServeModel(ownedModelId);
  }, [canEditGame, ownedModelId, onServeModel]);

  const onRenameModel = useCallback((modelId: Id<"models">, newName: string) => {
    const editableGameId = gameId ?? fallbackGameId;
    return withEditAccess(
      { canEditGame, gameId: editableGameId, onMissingGameId: () => undefined },
      () => wrapMutation("renameModel", renameModelMutation({ modelId, newName, externalId: playerId })),
    );
  }, [canEditGame, fallbackGameId, gameId, playerId, renameModelMutation]);

  const onRevealModel = useCallback((modelId: Id<"models">) => {
    const editableGameId = gameId ?? fallbackGameId;
    return withEditAccess(
      { canEditGame, gameId: editableGameId, onMissingGameId: () => undefined },
      () => wrapMutation("revealModel", revealModelMutation({ modelId, externalId: playerId })),
    );
  }, [canEditGame, fallbackGameId, gameId, playerId, revealModelMutation]);

  const onQuantizeModel = useCallback((modelId: Id<"models">, precision: ComputePrecision) => {
    const editableGameId = gameId ?? fallbackGameId;
    return withEditAccess(
      { canEditGame, gameId: editableGameId, onMissingGameId: () => undefined },
      () => wrapMutation("quantizeModel", quantizeModelMutation({ modelId, precision, externalId: playerId })),
    );
  }, [canEditGame, fallbackGameId, gameId, playerId, quantizeModelMutation]);

  return {
    onLaunchDraftModel,
    onServeModel,
    onRenameModel,
    onRevealModel,
    onQuantizeModel,
  };
}
