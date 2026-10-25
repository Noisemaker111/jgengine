import {
  mapPlacedBuildItems,
  type PlacedBuildItem,
} from "@llmville/game/build/build";
import { normalizeBuildInventory } from "@llmville/game/build/catalog";
import { useGameEconomyActions } from "@/economy/economy";
import { useComputeAssignmentActions } from "@/inference/computeAssignmentActions";
import { useEngineEphemeralTimers } from "@/runtime/engineEphemeralTimers";
import { useEngineWorldContext, defaultEngineWorldContext } from "@/runtime/engineWorldContext";
import { engineActions, useGameEngineState, wrapMutation } from "@/runtime/gameEngine";
import { useGameEngineSession } from "@/runtime/gameEngineSession";
import { deriveWorldSceneSummary, type PlacedRack } from "@/infrastructure/infrastructure";
import {
  worldChunkCenterOfKey,
  worldChunkKeyAt,
} from "@llmville/game/datacenter/worldChunks";
import {
  BASE_POWER_CAPACITY_KW,
  normalizeHardwareInventory,
  tutorialBenchPosition,
} from "@llmville/game/infrastructure/infrastructure";
import { normalizeRackCoolingInventory } from "@llmville/game/infrastructure/catalog";
import { useWorldModelsSlice } from "@/models/modelsSlice";
import { DEFAULT_SERVING_MODE, type ServingModeId } from "@llmville/game/models/servingMode";
import { EMPTY_COMPUTE_ASSIGNMENTS } from "@llmville/game/infrastructure/infrastructure";
import { DEFAULT_SCRAPE_TIER, type ScrapeTierId } from "@llmville/game/models/scrapingTiers";
import { useMovementSession } from "@/movement/playerStep";
import { usePresenceTransport } from "@/multiplayer/PresenceTransportProvider";

import { mapPlacedBuildItems as mapWorldPlacedBuildItems } from "@llmville/game/build/build";
import { createPlacementCellPolicy } from "@llmville/game/datacenter/claims";
import type { CellCoord } from "@llmville/game/datacenter/grid";
import { STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";
import { useWorldDataMutations, useWorldDataQueries } from "@/world/worldData";
import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { getAvatarById, normalizeAvatarId, normalizePlayerProfile } from "@/user/user";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo } from "react";

import { useGameClock } from "./clock";
import { deriveWorldBootLabel, deriveWorldBootProgress } from "./worldBootPhase";

import type { RuntimeGame, SiteHealth, WorldSpendPulse } from "./worldViewModel";

export type {
  RuntimeGame,
  SiteHealth,
  WorldActiveTraining,
  WorldSpendPulse,
  WorldViewModel,
} from "./worldViewModel";

const EMPTY_RACKS: readonly PlacedRack[] = [];

interface WorldParams {
  user: { id: string; name: string | null };
  convexUser: { displayName: string; avatarId?: string | null } | null;
  gameId: Id<"games">;
  onExitToMenu?: () => void;
  touchControlsEnabled?: boolean;
}

export function useWorldState({
  user,
  convexUser,
  gameId,
  onExitToMenu,
  touchControlsEnabled = false,
}: WorldParams) {
  const playerId = user.id;
  const avatarId = normalizeAvatarId(convexUser?.avatarId);
  const activeSlot = 0;
  const engine = useGameEngineSession({ activeSlot, gameId, playerId });
  const connectionError = useGameEngineState(engine, (current) => current.session.connection.error);
  const tutorialBenchPlaced = useGameEngineState(engine, (current) => current.gameplay.tutorial.rackPlaced);
  const tutorialStage = useGameEngineState(engine, (current) => current.gameplay.tutorialStage);
  const spendPulseEffect = useGameEngineState(engine, (current) => current.effects.spendPulse);
  const tweetNotification = useGameEngineState(engine, (current) => current.effects.tweetNotification);
  const interactionHint = useGameEngineState(engine, (current) => current.interaction.hint);
  const interactionTarget = useGameEngineState(engine, (current) => current.interaction.target);
  const interactionPrompt = useGameEngineState(engine, (current) => current.interaction.activePrompt);
  const isPointerLocked = useGameEngineState(engine, (current) => current.player.pointerLocked);
  const isPlayerPaused = useGameEngineState(engine, (current) => current.player.isPaused);
  const launchCelebrationUntil = useGameEngineState(engine, (current) => current.effects.launchCelebrationUntil);

  const {
    serveModelMutation,
    buyMutation,
    buyPersonalUpgradeMutation,
    resolveEventMutation,
    startPostTrainingMutation,
    unlockBaseModelMutation,
    launchLicensedBaseServeMutation,
    renameModelMutation,
    revealModelMutation,
    quantizeModelMutation,
    assignCardMutation,
    unassignCardMutation,
    setScrapeTierMutation,
    setServingModeMutation,
    claimCellMutation,
    unlockResearchItemMutation,
  } = useWorldDataMutations();
  const presenceTransport = usePresenceTransport();
  const viewerChunkKey = useGameEngineState(engine, (current) =>
    worldChunkKeyAt(current.player.position),
  );
  const presenceFeeds = presenceTransport.useFeeds({
    homeGameId: gameId,
    externalId: playerId,
    viewerChunkKey,
  });
  const presenceActions = presenceTransport.useActions();
  const myPresenceLocation = presenceFeeds.myPresenceLocation;
  const viewerChunkCenter = useMemo(() => worldChunkCenterOfKey(viewerChunkKey), [viewerChunkKey]);
  const {
    gameState,
    gameWorldState,
    worldScene,
    claims,
    myClaims,
    playerProfile,
    personalUpgrades,
    isWorldQueryBundleReady,
  } = useWorldDataQueries({
    gameId,
    viewerChunkCenter,
    onlinePresences: presenceFeeds.onlinePresences,
  });
  const game = gameState?.game;
  const shopItemsRaw = useQuery(
    api.store.catalog,
    gameState !== undefined && gameWorldState !== undefined && game != null
      ? { gameId: game._id }
      : "skip",
  );
  const canViewGame = gameState?.access.canView === true;
  const canEditGame = gameState?.access.canEdit === true;
  const isWorldReady =
    gameState !== undefined &&
    gameWorldState !== undefined &&
    isWorldQueryBundleReady &&
    shopItemsRaw !== undefined &&
    canViewGame &&
    game != null &&
    myPresenceLocation !== undefined;
  const worldBootInput = {
    gameStateLoaded: gameState !== undefined,
    canViewGame,
    gameFound: game != null,
    presenceLoaded: myPresenceLocation !== undefined,
    queryBundleReady: isWorldQueryBundleReady,
    shopCatalogLoaded: shopItemsRaw !== undefined,
  };
  const worldBootLabel = deriveWorldBootLabel(worldBootInput);
  const worldBootProgress = deriveWorldBootProgress(worldBootInput);
  const sceneModels = gameWorldState?.models;
  const gameMoney = game?.money ?? 0;
  const gameDataTokens = game?.dataTokens ?? 0;

  const racks: readonly PlacedRack[] = gameWorldState?.racks ?? EMPTY_RACKS;
  const placedBuildItems: readonly PlacedBuildItem[] = useMemo(
    () => mapPlacedBuildItems(gameWorldState?.placedBuildItems),
    [gameWorldState?.placedBuildItems],
  );
  const worldRacks: readonly PlacedRack[] = worldScene?.racks ?? EMPTY_RACKS;
  const worldPlacedBuildItems: readonly PlacedBuildItem[] = useMemo(
    () => mapWorldPlacedBuildItems(worldScene?.placedBuildItems),
    [worldScene?.placedBuildItems],
  );
  const placementCellPolicy = useMemo(
    () => createPlacementCellPolicy(claims ?? [], game?._id ?? ""),
    [claims, game],
  );
  const onClaimCell = useCallback(
    async (cell: CellCoord): Promise<{ claimed: boolean; reason?: string }> => {
      if (game == null) return { claimed: false, reason: "No world" };
      const result = await wrapMutation(
        "claimCell",
        claimCellMutation({ gameId: game._id, cx: cell.cx, cz: cell.cz, externalId: playerId }),
      );
      if (result === undefined) return { claimed: false, reason: "Claim failed" };
      return { claimed: result.claimed, reason: "reason" in result ? result.reason : undefined };
    },
    [claimCellMutation, game, playerId],
  );
  const activeTraining = gameWorldState?.activeTrainingSessions[0];
  const isTraining = activeTraining !== undefined;

  useEffect(() => {
    engine.dispatch(engineActions.bootstrapStart());
  }, [engine]);

  useEffect(() => {
    if (gameState === undefined) return;
    if (!canViewGame) {
      engine.dispatch(engineActions.bootstrapFailure("You are not allowed to access this game."));
      return;
    }
    if (game == null) {
      engine.dispatch(engineActions.bootstrapFailure("Game not found."));
      return;
    }
    engine.dispatch(engineActions.bootstrapSuccess(game._id));
  }, [canViewGame, engine, game, gameState]);

  const buildInventory = useMemo(() => normalizeBuildInventory(game?.buildInventory), [game?.buildInventory]);
  const hardwareInventory = useMemo(() => normalizeHardwareInventory(game?.hardwareInventory), [game?.hardwareInventory]);
  const coolingInventory = useMemo(() => normalizeRackCoolingInventory(game?.coolingInventory), [game?.coolingInventory]);
  const powerCapacityKw = playerProfile?.powerCapacityKw ?? BASE_POWER_CAPACITY_KW;
  const worldSummary = useMemo(
    () => {
      if (sceneModels === undefined) return undefined;
      return deriveWorldSceneSummary({
        racks,
        models: sceneModels,
        isTraining,
        hardwareInventory,
        computeAssignments: game?.computeAssignments,
        servingMode: game?.servingMode,
        ownerAvatarId: game?.ownerAvatarId,
        dataTokens: gameDataTokens,
        modelCatalog: game?.modelCatalog,
        gameCreatedAt: game?.createdAt,
        powerCapacityKw,
      });
    },
    [
      racks,
      sceneModels,
      isTraining,
      hardwareInventory,
      game?.computeAssignments,
      game?.servingMode,
      game?.ownerAvatarId,
      gameDataTokens,
      game?.modelCatalog,
      game?.createdAt,
      powerCapacityKw,
    ],
  );
  const incomeEstimate = useMemo(
    () =>
      worldSummary === undefined
        ? undefined
        : {
          servingAssignments: worldSummary.modelServingAssignments,
          frontierBenchmark: worldSummary.frontierBenchmark,
        },
    [worldSummary],
  );
  const hardwareStats = worldSummary?.hardwareStats;
  const normalizedPlayerProfile = useMemo(
    () => (playerProfile != null ? normalizePlayerProfile(playerProfile) : undefined),
    [playerProfile],
  );
  const siteHealth: SiteHealth = useMemo(() => ({
    temperatureC: worldSummary?.temperatureC ?? 0,
    heatLoadKw: worldSummary?.heatLoadKw ?? 0,
    coolingCapacityKw: worldSummary?.coolingCapacityKw ?? 0,
    thermalThrottle: worldSummary?.thermalThrottle ?? 0,
    powerDrawKw: worldSummary?.powerDrawKw ?? 0,
    powerCapacityKw: worldSummary?.powerCapacityKw ?? powerCapacityKw,
    powerThrottle: worldSummary?.powerThrottle ?? 0,
    vramUsedGb: worldSummary?.vramUsedGb ?? 0,
    vramCapacityGb: worldSummary?.vramCapacityGb ?? 0,
  }), [powerCapacityKw, worldSummary]);
  const {
    onStepPlayer,
    otherWorldPresences,
    hasBeenDisplaced,
  } = useMovementSession({
    engine,
    playerId,
    canViewGame,
    game,
    presenceFeeds,
    presenceActions,
  });

  const benchPosition = useMemo(() => tutorialBenchPosition(racks), [racks]);
  useEffect(() => {
    if (tutorialBenchPlaced || benchPosition === null) return;
    engine.dispatch(engineActions.placeTutorialBench());
  }, [benchPosition, engine, tutorialBenchPlaced]);
  const onPlaceTutorialBench = useCallback(() => {
    if (game == null) return;
    if (benchPosition !== null) {
      engine.dispatch(engineActions.placeTutorialBench());
      return;
    }
    if ((buildInventory[STARTER_RACK_CATALOG_ID] ?? 0) > 0) {
      engine.dispatch(engineActions.startPlacementDraft(STARTER_RACK_CATALOG_ID));
    }
  }, [benchPosition, buildInventory, engine, game]);

  const hasEngineWorldGame = game != null;
  useEngineWorldContext({
    engine,
    enabled: hasEngineWorldGame,
    context: {
      benchPosition,
      racks,
      placedBuildItems,
      isTraining,
      hasLab: hasEngineWorldGame,
      tutorialSignals: worldSummary?.tutorialSignals ?? defaultEngineWorldContext.tutorialSignals,
      touchControlsEnabled,
    },
  });
  useEngineEphemeralTimers(engine);

  const economyActions = useGameEconomyActions({
    canEditGame,
    gameId: game?._id ?? null,
    playerId,
    tutorialStage,
    buyMutation,
    buyPersonalUpgradeMutation,
    unlockResearchItemMutation,
    onHardwarePurchased: (count) => engine.dispatch(engineActions.modelHardwarePurchased(count)),
  });
  const modelsSlice = useWorldModelsSlice({
    engine,
    canEditGame,
    game,
    gameId,
    playerId,
    money: gameMoney,
    dataTokens: gameDataTokens,
    sceneModels,
    activeTraining,
    incomeEstimate,
    mutations: {
      serveModelMutation,
      startPostTrainingMutation,
      unlockBaseModelMutation,
      launchLicensedBaseServeMutation,
      renameModelMutation,
      revealModelMutation,
      quantizeModelMutation,
    },
  });
  const computeActions = useComputeAssignmentActions({
    canEditGame,
    gameId: game?._id ?? null,
    playerId,
    mutations: {
      assignCardMutation,
      unassignCardMutation,
      setScrapeTierMutation,
      setServingModeMutation,
    },
  });

  const gameTime = useGameClock(game?.createdAt, game?.serverNow, game?.gameTimeScale);
  const spendPulse: WorldSpendPulse | null = useMemo(
    () => spendPulseEffect != null && spendPulseEffect.until > Date.now()
      ? { amount: spendPulseEffect.amount, token: spendPulseEffect.until }
      : null,
    [spendPulseEffect],
  );

  const onSaveProgress = useCallback(() => {
    if (onExitToMenu) {
      onExitToMenu();
      return;
    }
    window.location.assign("/");
  }, [onExitToMenu]);

  const onDismissTweet = useCallback(() => {
    if (tweetNotification === null) return;
    void wrapMutation(
      "resolveEvent",
      resolveEventMutation({ eventId: tweetNotification.eventId as Id<"events">, externalId: playerId }),
    ).finally(() => engine.dispatch(engineActions.clearTweet()));
  }, [engine, playerId, resolveEventMutation, tweetNotification]);

  return useMemo(() => ({
    engine,
    activeSlot,
    connectionError,
    game: game as RuntimeGame | null | undefined,
    routeGameId: gameId,
    playerId,
    canViewGame,
    canEditGame,
    isWorldReady,
    worldBootLabel,
    worldBootProgress,
    money: gameMoney,
    dataTokens: gameDataTokens,
    servingIncomeRate: worldSummary?.servingIncomeRate ?? 0,
    servingThroughputTps: worldSummary?.servingThroughputTps ?? 0,
    siteHealth,
    shopItems: shopItemsRaw,
    personalUpgrades,
    hardwareInventory,
    coolingInventory,
    onBuyItem: economyActions.onBuyItem,
    onUnlockResearch: economyActions.onUnlockResearch,
    onPlaceOrder: economyActions.onPlaceOrder,
    onBuyPersonalUpgrade: economyActions.onBuyPersonalUpgrade,
    racks,
    totalGpus: hardwareStats?.totalGpus ?? 0,
    trainingGpus: hardwareStats?.trainingGpus ?? 0,
    scrapingGpus: hardwareStats?.scrapingGpus ?? 0,
    servingGpus: hardwareStats?.servingGpus ?? 0,
    totalVramGb: hardwareStats?.totalVramGb ?? 0,
    totalTrainingPowerFp16: hardwareStats?.totalTrainingPowerFp16 ?? 0,
    trainingLaneTflops: hardwareStats?.trainingLaneTflops ?? 0,
    computeAssignments: game?.computeAssignments ?? EMPTY_COMPUTE_ASSIGNMENTS,
    activeScrapeTier: (game?.activeScrapeTier ?? DEFAULT_SCRAPE_TIER) as ScrapeTierId,
    servingMode: (game?.servingMode ?? DEFAULT_SERVING_MODE) as ServingModeId,
    onSetServingMode: computeActions.onSetServingMode,
    onAssignCard: computeActions.onAssignCard,
    onUnassignCard: computeActions.onUnassignCard,
    onSetScrapeTier: computeActions.onSetScrapeTier,
    ...modelsSlice,
    buildInventory,
    placedBuildItems,
    onPlaceTutorialBench,
    rackCount: racks.length,
    onSaveProgress,
    onDismissTweet,
    onStepPlayer,
    playerProfile: normalizedPlayerProfile,
    selectedAvatarName: getAvatarById(avatarId).name,
    gameTime,
    interactionHint,
    interactionTarget,
    interactionPrompt,
    isPointerLocked,
    hasSessionConflict: hasBeenDisplaced,
    canMove: !isPlayerPaused,
    launchCelebrationActive: launchCelebrationUntil !== null && launchCelebrationUntil > Date.now(),
    tweetNotification,
    spendPulse,
    worldPresences: otherWorldPresences,
    claims,
    myClaims,
    placementCellPolicy,
    onClaimCell,
    worldRacks,
    worldPlacedBuildItems,
    presenceActions,
  }), [
    avatarId,
    buildInventory,
    canEditGame,
    canViewGame,
    computeActions,
    coolingInventory,
    gameDataTokens,
    economyActions.onBuyItem,
    economyActions.onBuyPersonalUpgrade,
    economyActions.onPlaceOrder,
    economyActions.onUnlockResearch,
    engine,
    game,
    gameId,
    gameTime,
    hardwareInventory,
    hardwareStats?.totalGpus,
    hardwareStats?.totalTrainingPowerFp16,
    hardwareStats?.totalVramGb,
    hardwareStats?.trainingGpus,
    hardwareStats?.trainingLaneTflops,
    hardwareStats?.scrapingGpus,
    hardwareStats?.servingGpus,
    isWorldReady,
    worldBootLabel,
    worldBootProgress,
    modelsSlice,
    gameMoney,
    onDismissTweet,
    onPlaceTutorialBench,
    onSaveProgress,
    onStepPlayer,
    normalizedPlayerProfile,
    placedBuildItems,
    playerId,
    racks,
    worldSummary?.servingIncomeRate,
    worldSummary?.servingThroughputTps,
    siteHealth,
    shopItemsRaw,
    activeSlot,
    connectionError,
    interactionHint,
    interactionTarget,
    interactionPrompt,
    isPlayerPaused,
    isPointerLocked,
    launchCelebrationUntil,
    spendPulse,
    tweetNotification,
    personalUpgrades,
    otherWorldPresences,
    hasBeenDisplaced,
    claims,
    myClaims,
    placementCellPolicy,
    onClaimCell,
    worldRacks,
    worldPlacedBuildItems,
    presenceActions,
  ]);
}
