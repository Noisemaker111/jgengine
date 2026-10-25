/**
 * Models/training slice of the WorldViewModel — derived model lists, the
 * training library, and every model/training action, composed into the
 * world state as one memoized object.
 */
import { useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";

import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import {
  buildDraftModelPreview,
  buildLaunchedModels,
  findOwnedModel,
  mapUserModels,
  useGameModelActions,
  type ModelIncomeEstimateContext,
} from "@/models/models";
import { buildBaseModelLibrary, useGameTrainingActions } from "@/models/training";
import { bestScrapingTokensPerToken } from "@llmville/game/models/scraping";
import { engineActions, useGameEngineState, type GameEngine } from "@/runtime/gameEngine";
import type { RuntimeGame, WorldActiveTraining } from "@/runtime/worldViewModel";
import type { WorldDataMutations } from "@/world/worldData";

type SceneModels = NonNullable<FunctionReturnType<typeof api.world.scene>>["models"];

interface UseWorldModelsSliceParams {
  engine: GameEngine;
  canEditGame: boolean;
  game: Pick<RuntimeGame, "_id" | "modelCatalog"> | null | undefined;
  /** Route game id — fallback target for unlocks before the game row loads. */
  gameId: Id<"games">;
  playerId: string;
  money: number;
  dataTokens: number;
  sceneModels: SceneModels | undefined;
  activeTraining: WorldActiveTraining | undefined;
  incomeEstimate: ModelIncomeEstimateContext | undefined;
  mutations: Pick<
    WorldDataMutations,
    | "serveModelMutation"
    | "startPostTrainingMutation"
    | "unlockBaseModelMutation"
    | "launchLicensedBaseServeMutation"
    | "renameModelMutation"
    | "revealModelMutation"
    | "quantizeModelMutation"
  >;
}

export function useWorldModelsSlice({
  engine,
  canEditGame,
  game,
  gameId,
  playerId,
  money,
  dataTokens,
  sceneModels,
  activeTraining,
  incomeEstimate,
  mutations,
}: UseWorldModelsSliceParams) {
  const [postTrainError, setPostTrainError] = useState<string | null>(null);
  const unlockSuccessEffect = useGameEngineState(engine, (current) => current.effects.unlockSuccess);
  const isTraining = activeTraining !== undefined;

  const ownedModel = sceneModels != null ? findOwnedModel(sceneModels) : undefined;
  const launchedModels = useMemo(
    () => (sceneModels !== undefined ? buildLaunchedModels(sceneModels, incomeEstimate) : undefined),
    [incomeEstimate, sceneModels],
  );
  const modelPreview = useMemo(
    () => buildDraftModelPreview(ownedModel, incomeEstimate),
    [incomeEstimate, ownedModel],
  );
  const userModels = useMemo(
    () => (sceneModels !== undefined ? mapUserModels(sceneModels, incomeEstimate) : undefined),
    [incomeEstimate, sceneModels],
  );
  const baseModelLibrary = useMemo(
    () => buildBaseModelLibrary({
      money,
      dataTokens,
      isTraining,
      modelCatalog: game?.modelCatalog,
    }),
    [game?.modelCatalog, dataTokens, money, isTraining],
  );
  const unrevealedModelId = userModels?.find((model) => !model.isRevealed)?.id ?? null;
  const scrapeSourceTokensPerToken = useMemo(
    () => bestScrapingTokensPerToken(game?.modelCatalog, userModels ?? []),
    [game?.modelCatalog, userModels],
  );

  const trainingActions = useGameTrainingActions({
    canEditGame,
    gameId: game?._id ?? null,
    fallbackGameId: gameId,
    playerId,
    isTraining,
    startPostTrainingMutation: mutations.startPostTrainingMutation,
    unlockBaseModelMutation: mutations.unlockBaseModelMutation,
    launchLicensedBaseServeMutation: mutations.launchLicensedBaseServeMutation,
    setPostTrainError,
    onUnlockSuccess: (baseModelId) => engine.dispatch(engineActions.triggerUnlockSuccess(baseModelId, 1_500)),
    onSpendPulse: (amount) => engine.dispatch(engineActions.triggerSpendPulse(amount)),
  });
  const modelActions = useGameModelActions({
    canEditGame,
    gameId: game?._id ?? null,
    fallbackGameId: gameId,
    playerId,
    ownedModelId: ownedModel?._id,
    serveModelMutation: mutations.serveModelMutation,
    renameModelMutation: mutations.renameModelMutation,
    revealModelMutation: mutations.revealModelMutation,
    quantizeModelMutation: mutations.quantizeModelMutation,
    onLaunchCelebration: () => engine.dispatch(engineActions.triggerLaunchCelebration(Date.now(), 5_000)),
  });

  return useMemo(() => ({
    isTraining,
    activeTraining,
    modelPreview,
    launchedModels,
    userModels,
    baseModelLibrary,
    scrapeSourceTokensPerToken,
    unrevealedModelId,
    lastUnlockedBaseModelId:
      unlockSuccessEffect != null && unlockSuccessEffect.until > Date.now()
        ? unlockSuccessEffect.baseModelId
        : null,
    postTrainError,
    onServeModel: modelActions.onServeModel,
    onQuantizeModel: modelActions.onQuantizeModel,
    onStartPostTraining: trainingActions.onStartPostTraining,
    onUnlockBaseModel: trainingActions.onUnlockBaseModel,
    onLaunchLicensedBaseServe: trainingActions.onLaunchLicensedBaseServe,
    onRenameModel: modelActions.onRenameModel,
    onRevealModel: modelActions.onRevealModel,
    onDismissPostTrainError: trainingActions.onDismissPostTrainError,
    onLaunchDraftModel: modelActions.onLaunchDraftModel,
  }), [
    activeTraining,
    baseModelLibrary,
    isTraining,
    launchedModels,
    modelActions.onLaunchDraftModel,
    modelActions.onQuantizeModel,
    modelActions.onRenameModel,
    modelActions.onRevealModel,
    modelActions.onServeModel,
    modelPreview,
    postTrainError,
    scrapeSourceTokensPerToken,
    trainingActions.onDismissPostTrainError,
    trainingActions.onLaunchLicensedBaseServe,
    trainingActions.onStartPostTraining,
    trainingActions.onUnlockBaseModel,
    unlockSuccessEffect,
    unrevealedModelId,
    userModels,
  ]);
}
