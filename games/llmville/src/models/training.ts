import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import {
  BASE_MODELS,
  getBaseModelDefinition,
  getResearchUnlockDataTokens,
  type BaseModelDefinition,
  type BaseModelSourceType,
} from "@llmville/game/models/baseModels";
import { isBaseModelUnlockedForGame, isScrapeFocusedBaseModel } from "@llmville/game/models/scraping";
import { useCallback } from "react";

export const MODEL_ACTION_KIND = {
  train: "train",
  unlock: "unlock",
  locked: "locked",
  serve_base: "serve_base",
  scrape: "scrape",
} as const;

export interface BaseModelCatalogState {
  isUnlocked?: boolean;
  distillProgressTflops?: number;
}

export interface BaseModelLibraryEntry extends BaseModelDefinition {
  isUnlocked: boolean;
  isResearchLocked: boolean;
  distillProgressTflops: number;

  distillPercent: number;
  canUnlock: boolean;
  canTrain: boolean;
  canServeBase?: boolean;
  actionKind: (typeof MODEL_ACTION_KIND)[keyof typeof MODEL_ACTION_KIND];
  actionLabel: string;
  requirementText: string;
}

export interface BaseModelBaselineStats {
  pricePerMillion: number;
  tokensPerSecond: number;
}

const BASE_MODEL_BASELINES: Record<BaseModelSourceType, BaseModelBaselineStats> = {
  open_source: {
    pricePerMillion: 550,
    tokensPerSecond: 6,
  },
  closed_source: {
    pricePerMillion: 980,
    tokensPerSecond: 11,
  },
};

export function getBaseModelBaselineStats(model: Pick<BaseModelDefinition, "sourceType">): BaseModelBaselineStats {
  return BASE_MODEL_BASELINES[model.sourceType];
}

export function getBaseModelBaselineStatsById(baseModelId: string | undefined): BaseModelBaselineStats | undefined {
  if (baseModelId === undefined) return undefined;
  const baseModel = getBaseModelDefinition(baseModelId);
  if (baseModel === undefined) return undefined;
  return getBaseModelBaselineStats(baseModel);
}

export function getBaseModelCatalogEntry(
  modelCatalog: Record<string, BaseModelCatalogState> | null | undefined,
  baseModelId: string,
): BaseModelCatalogState | undefined {
  return modelCatalog?.[baseModelId];
}

function isBaseModelUnlocked(
  model: BaseModelDefinition,
  modelCatalog: Record<string, BaseModelCatalogState> | null | undefined,
): boolean {
  return isBaseModelUnlockedForGame(modelCatalog, model);
}

export function buildBaseModelLibrary({
  money,
  dataTokens,
  isTraining,
  modelCatalog,
}: {
  money: number;
  dataTokens: number;
  isTraining: boolean;
  modelCatalog: Record<string, BaseModelCatalogState> | null | undefined;
}): readonly BaseModelLibraryEntry[] {
  return BASE_MODELS.map((model) => {
    const modelState = getBaseModelCatalogEntry(modelCatalog, model.id);
    const isResearchLocked = model.availability === "research_locked";
    const isUnlocked = isBaseModelUnlocked(model, modelCatalog);
    const distillProgressTflops = Math.max(0, Math.floor(modelState?.distillProgressTflops ?? 0));
    const distillPool = model.distillPoolTokens ?? 0;
    const distillPercent =
      model.trainingMethod !== "distill" || distillPool <= 0
        ? 100
        : Math.min(100, Math.round((distillProgressTflops / distillPool) * 100));
    const hasEnoughData =
      model.requiredDataTokens <= 0 ? true : dataTokens >= model.requiredDataTokens;
    const researchUnlockCost = isResearchLocked ? getResearchUnlockDataTokens(model) : 0;
    const canUnlockResearch =
      !isTraining &&
      isResearchLocked &&
      !isUnlocked &&
      dataTokens >= researchUnlockCost;
    const canUnlock =
      !isTraining &&
      !isResearchLocked &&
      model.licenseCost > 0 &&
      !isUnlocked &&
      money >= model.licenseCost;
    const canTrain =
      !isTraining &&
      isUnlocked &&
      (model.trainingMethod === "distill" ? true : hasEnoughData);

    const canServeBase =
      !isTraining &&
      isUnlocked &&
      model.sourceType === "open_source";

    let actionKind: BaseModelLibraryEntry["actionKind"] = MODEL_ACTION_KIND.locked;
    let actionLabel = "Locked";
    let requirementText: string;

    if (isResearchLocked && !isUnlocked) {
      actionKind = MODEL_ACTION_KIND.unlock;
      actionLabel = `Unlock ${researchUnlockCost.toLocaleString()} data`;
      requirementText = canUnlockResearch
        ? "Spend data tokens to unlock research"
        : `Need ${researchUnlockCost.toLocaleString()} data tokens`;
    } else if (model.licenseCost > 0 && !isUnlocked) {
      actionKind = MODEL_ACTION_KIND.unlock;
      actionLabel = `Unlock $${model.licenseCost.toLocaleString()}`;
      requirementText = canUnlock ? "License (one-time)" : `Need $${model.licenseCost.toLocaleString()} to unlock`;
    } else if (
      isUnlocked
      && (isScrapeFocusedBaseModel(model) || (!canTrain && model.tokensPerToken > 0))
    ) {
      actionKind = MODEL_ACTION_KIND.scrape;
      actionLabel = "Runs on GPUs — scrape";
      requirementText = "Dashboard > allocate TFLOPS to Scraping. Uses GPU power to farm data tokens (not serving).";
    } else if (canServeBase && (model.requiredDataTokens <= 0 || !hasEnoughData)) {
      actionKind = MODEL_ACTION_KIND.serve_base;
      actionLabel = "Serve (low $)";
      requirementText = "Low-yield licensed serve for money";
    } else if (canTrain) {
      actionKind = MODEL_ACTION_KIND.train;
      actionLabel = model.trainingMethod === "distill" ? "Start distilling" : "Start fine-tune";
      requirementText =
        model.trainingMethod === "distill"
          ? "Vendor hourly + distill pool"
          : `Needs ${model.requiredDataTokens.toLocaleString()}+ data tokens (1×–4×)`;
    } else {
      actionKind = MODEL_ACTION_KIND.locked;
      actionLabel = isTraining ? "Training..." : "Need Data";
      requirementText = isTraining ? "Another job is already running" : `Need ${model.requiredDataTokens.toLocaleString()} data tokens`;
    }

    return {
      ...model,
      isUnlocked,
      isResearchLocked,
      distillProgressTflops,
      distillPercent,
      canUnlock: canUnlock || canUnlockResearch,
      canTrain,
      canServeBase,
      actionKind,
      actionLabel,
      requirementText,
    };
  });
}

interface UseGameTrainingActionsParams {
  canEditGame: boolean;
  gameId: Id<"games"> | null;
  fallbackGameId: Id<"games">;
  playerId: string;
  isTraining: boolean;
  startPostTrainingMutation: (args: {
    gameId: Id<"games">;
    baseModelId: string;
    overtrainBracket?: number;
  }) => Promise<{ started: boolean; reason?: string }>;
  unlockBaseModelMutation: (args: { gameId: Id<"games">; externalId?: string; itemId: string }) => Promise<{
    unlocked: boolean;
    reason?: string;
    alreadyUnlocked?: boolean;
    itemId?: string;
  }>;
  launchLicensedBaseServeMutation: (args: { gameId: Id<"games">; baseModelId: string; externalId: string }) => Promise<{ launched: boolean; reason?: string; modelId?: Id<"models">; alreadyServing?: boolean }>;
  setPostTrainError: (error: string | null) => void;
  onUnlockSuccess?: (baseModelId: string) => void;
  onSpendPulse?: (amount: number) => void;
}

export function useGameTrainingActions({
  canEditGame,
  gameId,
  fallbackGameId,
  playerId,
  isTraining,
  startPostTrainingMutation,
  unlockBaseModelMutation,
  launchLicensedBaseServeMutation,
  setPostTrainError,
  onUnlockSuccess,
  onSpendPulse,
}: UseGameTrainingActionsParams) {

  const onStartPostTraining = useCallback((baseModelId: string, options?: { overtrainBracket?: number }) => {
    setPostTrainError(null);
    const effectiveGameId = gameId ?? fallbackGameId;
    if (!canEditGame || effectiveGameId == null || isTraining) {
      if (!canEditGame) setPostTrainError("You don't have edit access to this game");
      else if (effectiveGameId == null) setPostTrainError("Game not ready - try again in a moment");
      return;
    }

    startPostTrainingMutation({
      gameId: effectiveGameId,
      baseModelId,
      ...(options?.overtrainBracket != null ? { overtrainBracket: options.overtrainBracket } : {}),
    })
      .then((result) => {
        if (!result.started) {
          setPostTrainError(result.reason ?? "Could not start training");
        }
      })
      .catch((error) => {
        console.error("startPostTraining failed:", error);
        setPostTrainError(error?.message ?? "Failed to start training - check connection");
      });
  }, [canEditGame, fallbackGameId, gameId, isTraining, setPostTrainError, startPostTrainingMutation]);

  const onUnlockBaseModel = useCallback((baseModelId: string, amount?: number) => {
    setPostTrainError(null);
    const effectiveGameId = gameId ?? fallbackGameId;
    if (!canEditGame || effectiveGameId == null) {
      setPostTrainError(!canEditGame ? "You don't have edit access to this game" : "Game not ready - try again in a moment");
      return;
    }

    unlockBaseModelMutation({ gameId: effectiveGameId, externalId: playerId, itemId: baseModelId })
      .then((result) => {
        if (result.unlocked) {
          onUnlockSuccess?.(baseModelId);
          if (amount != null) onSpendPulse?.(amount);
        } else {
          setPostTrainError(result.reason ?? "Could not unlock model");
        }
      })
      .catch((error) => {
        console.error("unlockBaseModel failed:", error);
        setPostTrainError(error?.message ?? "Failed to unlock model - check connection");
      });
  }, [canEditGame, fallbackGameId, gameId, onSpendPulse, onUnlockSuccess, playerId, setPostTrainError, unlockBaseModelMutation]);

  const onLaunchLicensedBaseServe = useCallback((baseModelId: string) => {
    setPostTrainError(null);
    const effectiveGameId = gameId ?? fallbackGameId;
    if (!canEditGame || effectiveGameId == null) {
      setPostTrainError(!canEditGame ? "You don't have edit access to this game" : "Game not ready - try again in a moment");
      return;
    }
    launchLicensedBaseServeMutation({ gameId: effectiveGameId, baseModelId, externalId: playerId })
      .then((result) => {
        if (!result.launched && !result.alreadyServing) {
          setPostTrainError(result.reason ?? "Could not launch base serve");
        }
      })
      .catch((error) => {
        console.error("launchLicensedBaseServe failed:", error);
        setPostTrainError(error?.message ?? "Failed to launch licensed base serve");
      });
  }, [canEditGame, fallbackGameId, gameId, launchLicensedBaseServeMutation, playerId, setPostTrainError]);

  const onDismissPostTrainError = useCallback(() => setPostTrainError(null), [setPostTrainError]);

  return {
    onStartPostTraining,
    onUnlockBaseModel,
    onLaunchLicensedBaseServe,
    onDismissPostTrainError,
  };
}
