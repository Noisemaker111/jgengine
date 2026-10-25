import { useCallback, useMemo, useRef, useState } from "react";

import { BUILD_MENU_TAB_SEQUENCE } from "@llmville/game/build/build";
import { normalizeBuildInventory } from "@llmville/game/build/catalog";
import { STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";
import { normalizeHardwareInventory } from "@llmville/game/infrastructure/infrastructure";
import { normalizeRackCoolingInventory } from "@llmville/game/infrastructure/catalog";
import { createPlacementCellPolicy, type DatacenterClaim } from "@llmville/game/datacenter/claims";
import { cellsInRect } from "@llmville/game/datacenter/claimMap";
import { GameEngine } from "@/runtime/gameEngine";
import type { BuildViewModel } from "@/build/buildSession";
import type { RackHardwareViewModel } from "@/infrastructure/rackHardwareSession";
import type { ReadyWorldViewModel } from "@/runtime/worldViewModel";
import { localPresenceActions } from "@/multiplayer/localPresenceTransport";
import { DEFAULT_SERVING_MODE } from "@llmville/game/models/servingMode";
import { DEFAULT_SCRAPE_TIER } from "@llmville/game/models/scrapingTiers";
import type { TutorialViewModel } from "@/tutorial/tutorialRuntime";
import {
  DEFAULT_TABLET_STORE_TAB,
  type GameMenuRequest,
  type TabletAppId,
  type TabletNavBundle,
  type TabletNavState,
  type TabletStoreTabId,
} from "@/tablet/tablet";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";

const noop = () => undefined;

const PREVIEW_GAME_ID = "preview-game-id" as Id<"games">;

const PREVIEW_CLAIMS: readonly DatacenterClaim[] = [
  ...cellsInRect({ cx: -2, cz: -2 }, { cx: 1, cz: 0 }).map((cell) => ({
    ...cell,
    ownerGameId: PREVIEW_GAME_ID as string,
    ownerName: "You",
  })),
  ...cellsInRect({ cx: 8, cz: 3 }, { cx: 11, cz: 6 }).map((cell) => ({
    ...cell,
    ownerGameId: "rival-game-id",
    ownerName: "Nimbus Labs",
  })),
  ...cellsInRect({ cx: -9, cz: 5 }, { cx: -7, cz: 7 }).map((cell) => ({
    ...cell,
    ownerGameId: "third-game-id",
    ownerName: "Tensor Co",
  })),
];

function previewSiteHealth(): ReadyWorldViewModel["siteHealth"] {
  return {
    temperatureC: 24,
    heatLoadKw: 2.4,
    coolingCapacityKw: 8,
    thermalThrottle: 1,
    powerDrawKw: 1.8,
    powerCapacityKw: 12,
    powerThrottle: 1,
    vramUsedGb: 8,
    vramCapacityGb: 24,
  };
}

export function createTabletPreviewWorld(): ReadyWorldViewModel {
  const engine = new GameEngine({
    activeSlot: 1,
    gameId: "preview",
    playerId: "preview-player",
  });

  // Fully typed (no cast) so adding a WorldViewModel field is a compile error
  // here instead of a silently stale preview.
  return {
    engine,
    activeSlot: 1,
    connectionError: null,
    game: {
      _id: PREVIEW_GAME_ID,
      createdAt: Date.now(),
      money: 1250,
      dataTokens: 42,
      tutorialStage: "open_tablet",
    },
    routeGameId: PREVIEW_GAME_ID,
    playerId: "preview-player",
    canViewGame: true,
    canEditGame: true,
    isWorldReady: true,
    worldBootLabel: "Entering world…",
    worldBootProgress: 1,
    money: 1250,
    dataTokens: 42,
    servingIncomeRate: 18.5,
    servingThroughputTps: 12,
    siteHealth: previewSiteHealth(),
    shopItems: [],
    personalUpgrades: [],
    hardwareInventory: normalizeHardwareInventory({}),
    coolingInventory: normalizeRackCoolingInventory({}),
    onBuyItem: noop,
    onUnlockResearch: noop,
    onPlaceOrder: async () => true,
    onBuyPersonalUpgrade: noop,
    racks: [],
    totalGpus: 0,
    trainingGpus: 0,
    scrapingGpus: 0,
    servingGpus: 0,
    totalVramGb: 0,
    totalTrainingPowerFp16: 0,
    trainingLaneTflops: 0,
    computeAssignments: {},
    activeScrapeTier: DEFAULT_SCRAPE_TIER,
    scrapeSourceTokensPerToken: 0.012,
    onAssignCard: noop,
    onUnassignCard: noop,
    onSetScrapeTier: noop,
    servingMode: DEFAULT_SERVING_MODE,
    onSetServingMode: noop,
    isTraining: false,
    activeTraining: undefined,
    modelPreview: null,
    launchedModels: [],
    userModels: [],
    baseModelLibrary: [],
    unrevealedModelId: null,
    lastUnlockedBaseModelId: null,
    postTrainError: null,
    onServeModel: noop,
    onQuantizeModel: noop,
    onStartPostTraining: noop,
    onUnlockBaseModel: noop,
    onLaunchLicensedBaseServe: noop,
    onRenameModel: noop,
    onRevealModel: noop,
    onDismissPostTrainError: noop,
    onLaunchDraftModel: noop,
    buildInventory: normalizeBuildInventory({}),
    placedBuildItems: [],
    onPlaceTutorialBench: noop,
    rackCount: 0,
    onSaveProgress: noop,
    onDismissTweet: noop,
    onStepPlayer: noop,
    playerProfile: { walkSpeedLevel: 1, trainingDurationMultiplier: 1, powerCapacityKw: 1.5 },
    selectedAvatarName: "Sam Altman",
    gameTime: {
      year: 2025,
      month: 6,
      monthName: "Jun",
      monthNameFull: "June",
      dayOfMonth: 28,
      hour: 9,
      minute: 41,
      second: 0,
      formattedDate: "Jun 28",
      formattedDateFull: "June 28, 2025",
      formattedTime: "9:41",
      formatted: "Jun 28, 9:41",
    },
    interactionHint: null,
    interactionTarget: null,
    interactionPrompt: null,
    isPointerLocked: false,
    canMove: true,
    launchCelebrationActive: false,
    tweetNotification: null,
    spendPulse: null,
    worldPresences: [],
    hasSessionConflict: false,
    claims: PREVIEW_CLAIMS,
    myClaims: PREVIEW_CLAIMS.filter((claim) => claim.ownerGameId === PREVIEW_GAME_ID).map((claim) => ({
      cx: claim.cx,
      cz: claim.cz,
    })),
    placementCellPolicy: createPlacementCellPolicy(PREVIEW_CLAIMS, PREVIEW_GAME_ID),
    onClaimCell: async () => ({ claimed: false, reason: "insufficient_funds" }),
    worldRacks: [],
    worldPlacedBuildItems: [],
    presenceActions: localPresenceActions,
  };
}

export function createTabletPreviewRackHardware(): RackHardwareViewModel {
  return {
    moveHardware: noop,
    onInstallCoolerToRack: noop,
    onUninstallCoolerFromRack: noop,
  };
}

export function createTabletPreviewBuild(): BuildViewModel {
  const inventory = normalizeBuildInventory({ [STARTER_RACK_CATALOG_ID]: 1 });
  return {
    buildTabs: BUILD_MENU_TAB_SEQUENCE,
    activeBuildTab: "infrastructure",
    activeBuildItems: [],
    buildInventory: inventory,
    selectedBuildItem: null,
    selectedBuildItemIndex: 0,
    selectedBuildPriceLabel: "$0",
    buildPrimaryActionLabel: "Place",
    isBuildPrimaryActionDisabled: true,
    isBuildTrashActionDisabled: true,
    buildPlacementModeActive: false,
    placementDraftItemId: null,
    placementDraftDirection: 0,
    placementPreview: null,
    placedBuildItems: [],
    onBuildPrimaryAction: noop,
    onBuildTrashAction: noop,
    onConfirmPlacement: noop,
    onPlacementPreviewChange: noop,
    onCycleBuildTab: noop,
    onSetBuildTab: noop,
    onCycleBuildItem: noop,
    onSetBuildItemIndex: noop,
    placementFacingLabel: "North",
    placementClaimHint: null,
    onRotatePlacement: noop,
    buildItemCount: 0,
  };
}

export function createTabletPreviewTutorial(): TutorialViewModel {
  return {
    tutorialWords: 0,
    tutorialHint: {
      step: 1,
      total: 8,
      text: "Swipe up or tap the tablet at the bottom and launch the Store app.",
    },
    tutorialStarted: true,
    tutorialCompleted: false,
    tutorialStage: "open_tablet",
    tutorialActionUntil: null,
    tutorialBenchPlaced: false,
    tabletTutorialLock: null,
    onPlaceTutorialBench: noop,
    onTabletAppOpened: noop,
    onTabletStoreTabOpened: noop,
  };
}

interface UsePreviewTabletNavOptions {
  initialOpen?: boolean;
  initialApp?: TabletAppId | null;
}

export function usePreviewTabletNav({
  initialOpen = true,
  initialApp = null,
}: UsePreviewTabletNavOptions = {}): TabletNavBundle {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tabletOpen, setTabletOpen] = useState(initialOpen);
  const [activeTabletApp, setActiveTabletApp] = useState<TabletAppId | null>(initialApp);
  const [activeStoreTab, setActiveStoreTab] = useState<TabletStoreTabId>(DEFAULT_TABLET_STORE_TAB);
  const [rackMenuOverlayRackId, setRackMenuOverlayRackId] = useState<string | null>(null);

  const cancelPointerLockRetry = useCallback(() => undefined, []);
  const requestGameFocus = useCallback(() => undefined, []);

  const openTabletHome = useCallback(() => {
    setTabletOpen(true);
    setActiveTabletApp(null);
    setRackMenuOverlayRackId(null);
  }, []);

  const openTabletApp = useCallback((appId: TabletAppId, storeTab?: TabletStoreTabId) => {
    setTabletOpen(true);
    setActiveTabletApp(appId);
    if (appId === "store" && storeTab !== undefined) {
      setActiveStoreTab(storeTab);
    }
    setRackMenuOverlayRackId(null);
  }, []);

  const closeMenu = useCallback(() => {
    setTabletOpen(false);
    setActiveTabletApp(null);
    setRackMenuOverlayRackId(null);
  }, []);

  const openMenu = useCallback((menuRequest: GameMenuRequest) => {
    if (menuRequest.type === "rack-config") {
      setTabletOpen(false);
      setActiveTabletApp(null);
      setRackMenuOverlayRackId(menuRequest.rackId);
      return;
    }
    if (menuRequest.type === "tablet-app") {
      openTabletApp(menuRequest.appId, menuRequest.storeTab);
      return;
    }
    openTabletHome();
  }, [openTabletApp, openTabletHome]);

  const toggleTablet = useCallback((nextOpen?: boolean) => {
    const menuOpen = rackMenuOverlayRackId !== null || tabletOpen;
    const shouldOpen = nextOpen ?? !menuOpen;
    if (shouldOpen) {
      openTabletHome();
      return;
    }
    closeMenu();
  }, [closeMenu, openTabletHome, rackMenuOverlayRackId, tabletOpen]);

  const nav = useMemo(
    (): TabletNavState => ({
      tabletOpen,
      activeTabletApp,
      activeStoreTab,
      rackMenuOverlayRackId,
      cancelPointerLockRetry,
      requestGameFocus,
      openTabletHome,
      openTabletApp,
      openTabletStoreTab: setActiveStoreTab,
      openMenu,
      closeMenu,
      toggleTablet,
    }),
    [
      activeStoreTab,
      activeTabletApp,
      cancelPointerLockRetry,
      closeMenu,
      openMenu,
      openTabletApp,
      openTabletHome,
      rackMenuOverlayRackId,
      requestGameFocus,
      tabletOpen,
      toggleTablet,
    ],
  );

  return { nav, containerRef };
}

export function usePreviewWorldState() {
  const baseWorld = useMemo(() => createTabletPreviewWorld(), []);
  const [money, setMoney] = useState(baseWorld.money);
  const [dataTokens, setDataTokens] = useState(baseWorld.dataTokens);
  const [servingIncomeRate, setServingIncomeRate] = useState(baseWorld.servingIncomeRate);
  const [spendPulse, setSpendPulse] = useState<ReadyWorldViewModel["spendPulse"]>(null);

  const world = useMemo(
    (): ReadyWorldViewModel => ({
      ...baseWorld,
      money,
      dataTokens,
      servingIncomeRate,
      spendPulse,
      game: baseWorld.game
        ? { ...baseWorld.game, money, dataTokens }
        : baseWorld.game,
    }),
    [baseWorld, dataTokens, money, servingIncomeRate, spendPulse],
  );

  const pulseTabletSpend = useCallback((amount: number) => {
    const token = Date.now();
    setSpendPulse({ amount, token });
    window.setTimeout(() => {
      setSpendPulse((current) => (current?.token === token ? null : current));
    }, 2000);
  }, []);

  const adjustMoney = useCallback(
    (delta: number) => {
      setMoney((current) => Math.max(0, current + delta));
      if (delta < 0) {
        pulseTabletSpend(Math.abs(delta));
      }
    },
    [pulseTabletSpend],
  );

  const adjustTokens = useCallback((delta: number) => {
    setDataTokens((current) => Math.max(0, current + delta));
  }, []);

  return {
    world,
    money,
    dataTokens,
    servingIncomeRate,
    setMoney,
    setDataTokens,
    setServingIncomeRate,
    adjustMoney,
    adjustTokens,
    pulseTabletSpend,
  };
}
