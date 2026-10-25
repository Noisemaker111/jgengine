import { TUTORIAL_OBJECTIVE_STEP_COUNT, TUTORIAL_STAGE, type TutorialStage } from "@llmville/game/tutorial/tutorialStages";
import { TUTORIAL_TRAIN_BASE_MODEL_ID } from "@llmville/game/tutorial/tutorialProgress";
import { BUILD_CATALOG } from "@llmville/game/build/catalog";
import { STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";
import { INTERACTION_TARGET_TYPE, type InteractionHint } from "@llmville/game/simulation/interaction";
import { TABLET_APP_ID, TABLET_STORE_TAB_ID, type TabletAppId, type TabletStoreTabId } from "@/tablet/tabletIds";
import { TUTORIAL_EVENT_TYPE, TUTORIAL_NODE, type TutorialNode } from "@llmville/game/tutorial/tutorialMachine";
import {
  TUTORIAL_INPUT_MODE,
  tutorialPlaceConfirmPhrase,
  tutorialRackConfigurePhrase,
  tutorialTabletOpenPhrase,
  type TutorialInputMode,
} from "@/tutorial/tutorialInput";

export interface TutorialHint {
  step: number;
  total: number;
  text: string;
}

export interface TabletTutorialObjective {
  step: number;
  total: number;
  text: string;
}

export interface TabletTutorialLock {
  enabled: boolean;
  allowedApps: readonly TabletAppId[];
  highlightedApp: TabletAppId | null;
  allowedStoreTabs: readonly TabletStoreTabId[];
  highlightedStoreTab: TabletStoreTabId | null;
}

const STORE_ONLY_APPS: readonly TabletAppId[] = [TABLET_APP_ID.store];
const STORE_AND_MAP_APPS: readonly TabletAppId[] = [TABLET_APP_ID.store, TABLET_APP_ID.map];
const STORAGE_AND_MAP_APPS: readonly TabletAppId[] = [TABLET_APP_ID.storage, TABLET_APP_ID.map];
const MODELS_ONLY_APPS: readonly TabletAppId[] = [TABLET_APP_ID.models];
const INFERENCE_ONLY_APPS: readonly TabletAppId[] = [TABLET_APP_ID.inference];
const ALL_STORE_TABS: readonly TabletStoreTabId[] = [
  TABLET_STORE_TAB_ID.infrastructure,
  TABLET_STORE_TAB_ID.decor,
  TABLET_STORE_TAB_ID.hardware,
  TABLET_STORE_TAB_ID.cooling,
  TABLET_STORE_TAB_ID.operator,
];
const INFRASTRUCTURE_ONLY_STORE_TABS: readonly TabletStoreTabId[] = [TABLET_STORE_TAB_ID.infrastructure];
const HARDWARE_ONLY_STORE_TABS: readonly TabletStoreTabId[] = [TABLET_STORE_TAB_ID.hardware];

const OBJECTIVE_TOTAL = TUTORIAL_OBJECTIVE_STEP_COUNT;

function starterRackLabel(): string {
  return BUILD_CATALOG.find((item) => item.id === STARTER_RACK_CATALOG_ID)?.label ?? "2-Slot GPU Rack";
}

interface GetTabletTutorialObjectiveParams {
  tutorialStage: TutorialStage;
  installedGpus: number;
  buildInventory?: Record<string, number>;
  inputMode?: TutorialInputMode;
}

interface GetTabletTutorialLockParams {
  tutorialStarted: boolean;
  tutorialCompleted: boolean;
  tutorialStage: TutorialStage;
  buildInventory?: Record<string, number>;
}

export function getTabletTutorialLock({
  tutorialStarted,
  tutorialCompleted,
  tutorialStage,
  buildInventory = {},
}: GetTabletTutorialLockParams): TabletTutorialLock | null {
  if (!tutorialStarted || tutorialCompleted) return null;

  if (tutorialStage === TUTORIAL_STAGE.openTablet) {
    return {
      enabled: true,
      allowedApps: STORE_ONLY_APPS,
      highlightedApp: TABLET_APP_ID.store,
      allowedStoreTabs: ALL_STORE_TABS,
      highlightedStoreTab: null,
    };
  }

  if (tutorialStage === TUTORIAL_STAGE.placeRack) {
    const inStorage = (buildInventory[STARTER_RACK_CATALOG_ID] ?? 0) > 0;
    if (inStorage) {
      return {
        enabled: true,
        allowedApps: STORAGE_AND_MAP_APPS,
        highlightedApp: TABLET_APP_ID.storage,
        allowedStoreTabs: ALL_STORE_TABS,
        highlightedStoreTab: null,
      };
    }

    return {
      enabled: true,
      allowedApps: STORE_AND_MAP_APPS,
      highlightedApp: TABLET_APP_ID.store,
      allowedStoreTabs: INFRASTRUCTURE_ONLY_STORE_TABS,
      highlightedStoreTab: TABLET_STORE_TAB_ID.infrastructure,
    };
  }

  if (tutorialStage === TUTORIAL_STAGE.buyGpus) {
    return {
      enabled: true,
      allowedApps: STORE_ONLY_APPS,
      highlightedApp: TABLET_APP_ID.store,
      allowedStoreTabs: HARDWARE_ONLY_STORE_TABS,
      highlightedStoreTab: TABLET_STORE_TAB_ID.hardware,
    };
  }

  if (tutorialStage === TUTORIAL_STAGE.licenseScraper || tutorialStage === TUTORIAL_STAGE.fineTune) {
    return {
      enabled: true,
      allowedApps: tutorialStage === TUTORIAL_STAGE.fineTune ? [TABLET_APP_ID.models, TABLET_APP_ID.inference, TABLET_APP_ID.store, TABLET_APP_ID.storage] : MODELS_ONLY_APPS,
      highlightedApp: TABLET_APP_ID.models,
      allowedStoreTabs: ALL_STORE_TABS,
      highlightedStoreTab: null,
    };
  }

  if (tutorialStage === TUTORIAL_STAGE.scrapeTokens || tutorialStage === TUTORIAL_STAGE.revealModel || tutorialStage === TUTORIAL_STAGE.serve) {
    return {
      enabled: true,
      allowedApps: INFERENCE_ONLY_APPS,
      highlightedApp: TABLET_APP_ID.inference,
      allowedStoreTabs: ALL_STORE_TABS,
      highlightedStoreTab: null,
    };
  }

  return null;
}

function getTabletTutorialObjective({
  tutorialStage,
  installedGpus,
  buildInventory = {},
  inputMode = TUTORIAL_INPUT_MODE.keyboard,
}: GetTabletTutorialObjectiveParams): TabletTutorialObjective | null {
  const openTablet = tutorialTabletOpenPhrase(inputMode);

  if (tutorialStage === TUTORIAL_STAGE.openTablet) {
    return { step: 1, total: OBJECTIVE_TOTAL, text: `${openTablet} and launch the Store app.` };
  }

  if (tutorialStage === TUTORIAL_STAGE.placeRack) {
    const inStorage = (buildInventory[STARTER_RACK_CATALOG_ID] ?? 0) > 0;
    if (inStorage) {
      return {
        step: 2,
        total: OBJECTIVE_TOTAL,
        text: `Storage app: select ${starterRackLabel()}, ${tutorialPlaceConfirmPhrase(inputMode)}.`,
      };
    }

    return { step: 2, total: OBJECTIVE_TOTAL, text: `Store > Infrastructure: buy ${starterRackLabel()}.` };
  }

  if (tutorialStage === TUTORIAL_STAGE.buyGpus) {
    return { step: 3, total: OBJECTIVE_TOTAL, text: "Store > Hardware: buy 2 starter GPUs." };
  }

  if (tutorialStage === TUTORIAL_STAGE.installGpus) {
    return {
      step: 4,
      total: OBJECTIVE_TOTAL,
      text: tutorialRackConfigurePhrase(inputMode, installedGpus),
    };
  }

  if (tutorialStage === TUTORIAL_STAGE.licenseScraper) {
    return {
      step: 5,
      total: OBJECTIVE_TOTAL,
      text: `${openTablet} > All Models: license Alpaca 1 (~$200). It scrapes 2.5× the data of the free starter model.`,
    };
  }

  if (tutorialStage === TUTORIAL_STAGE.scrapeTokens) {
    return {
      step: 6,
      total: OBJECTIVE_TOTAL,
      text: inputMode === TUTORIAL_INPUT_MODE.touch
        ? "GPU jobs: choose Collect data from a GPU's job menu. Tokens arrive automatically."
        : "GPU jobs: choose Collect data from a GPU's job menu, or drag its card onto that lane.",
    };
  }

  if (tutorialStage === TUTORIAL_STAGE.fineTune) {
    return {
      step: 7,
      total: OBJECTIVE_TOTAL,
      text: `Train models: fine-tune ${TUTORIAL_TRAIN_BASE_MODEL_ID === "llamma_3" ? "Llamma 3" : "your starter model"} using farmed data tokens.`,
    };
  }

  if (tutorialStage === TUTORIAL_STAGE.revealModel) {
    return {
      step: 8,
      total: OBJECTIVE_TOTAL,
      text: `${openTablet} > GPU jobs: reveal your trained model.`,
    };
  }

  if (tutorialStage === TUTORIAL_STAGE.serve) {
    return {
      step: 9,
      total: OBJECTIVE_TOTAL,
      text: inputMode === TUTORIAL_INPUT_MODE.touch
        ? "GPU jobs: serve your trained model, then drag a GPU onto it for $. Keep some GPUs on Collect data for tokens as you scale."
        : "GPU jobs: serve your trained model, then drag a GPU card onto it for income. Data-collection GPUs keep farming tokens separately.",
    };
  }

  return null;
}

export function getTutorialEventForTabletAppOpen(
  appId: TabletAppId,
): typeof TUTORIAL_EVENT_TYPE.tabletStoreOpened | null {
  if (appId === TABLET_APP_ID.store) return TUTORIAL_EVENT_TYPE.tabletStoreOpened;
  return null;
}

export interface TutorialPlacementState {
  buildInventory: Record<string, number>;
}

export function getTutorialHint(
  stage: TutorialStage,
  installedGpus: number,
  _users: number,
  placementState?: TutorialPlacementState | null,
  inputMode: TutorialInputMode = TUTORIAL_INPUT_MODE.keyboard,
): TutorialHint | null {
  if (stage === TUTORIAL_STAGE.complete) return null;
  return getTabletTutorialObjective({
    tutorialStage: stage,
    installedGpus,
    buildInventory: placementState?.buildInventory,
    inputMode,
  });
}

interface TutorialInteractionSnapshot {
  tutorialNode: TutorialNode;
  pointerLocked: boolean;
  tutorialGpusInstalled: number;
  inputMode?: TutorialInputMode;
}

interface TutorialInteractionProximity {
  targetType: (typeof INTERACTION_TARGET_TYPE)[keyof typeof INTERACTION_TARGET_TYPE] | null;
}

export function getTutorialInteractionHint(
  snapshot: TutorialInteractionSnapshot,
  proximity: TutorialInteractionProximity,
): InteractionHint | null {
  if (
    snapshot.tutorialNode === TUTORIAL_NODE.openTablet
    || snapshot.tutorialNode === TUTORIAL_NODE.placeRack
    || snapshot.tutorialNode === TUTORIAL_NODE.buyGpus
    || snapshot.tutorialNode === TUTORIAL_NODE.licenseScraper
    || snapshot.tutorialNode === TUTORIAL_NODE.scrapeTokens
    || snapshot.tutorialNode === TUTORIAL_NODE.fineTune
    || snapshot.tutorialNode === TUTORIAL_NODE.revealModel
    || snapshot.tutorialNode === TUTORIAL_NODE.serve
  ) {
    return null;
  }

  const inPlay = snapshot.pointerLocked || snapshot.inputMode === TUTORIAL_INPUT_MODE.touch;
  if (snapshot.tutorialNode === TUTORIAL_NODE.installGpus && inPlay) {
    if (proximity.targetType === INTERACTION_TARGET_TYPE.rack) {
      return { key: "E", action: `Configure Rack (${snapshot.tutorialGpusInstalled}/2 installed)` };
    }
    return null;
  }

  return null;
}
