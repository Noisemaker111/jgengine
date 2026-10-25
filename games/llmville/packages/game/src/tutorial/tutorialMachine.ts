import {
  MIN_SCRAPED_DATA_TOKENS,
  REQUIRED_TUTORIAL_GPU_COUNT,
  type TutorialWorldSignals,
} from "@llmville/game/tutorial/tutorialProgress";
import { TUTORIAL_STAGE, TUTORIAL_STAGE_VALUES, type TutorialStage } from "@llmville/game/tutorial/tutorialStages";

export function normalizeTutorialStage(stage: string | null | undefined): TutorialStage {
  if (stage != null && (TUTORIAL_STAGE_VALUES as readonly string[]).includes(stage)) {
    return stage as TutorialStage;
  }
  return TUTORIAL_STAGE.openTablet;
}

export type TutorialNode =
  | "BOOTSTRAP"
  | "OPEN_TABLET"
  | "PLACE_RACK"
  | "BUY_GPUS"
  | "INSTALL_GPUS"
  | "LICENSE_SCRAPER"
  | "SCRAPE_TOKENS"
  | "FINE_TUNE"
  | "REVEAL_MODEL"
  | "SERVE"
  | "COMPLETE";

export const TUTORIAL_NODE = {
  bootstrap: "BOOTSTRAP",
  openTablet: "OPEN_TABLET",
  placeRack: "PLACE_RACK",
  buyGpus: "BUY_GPUS",
  installGpus: "INSTALL_GPUS",
  licenseScraper: "LICENSE_SCRAPER",
  scrapeTokens: "SCRAPE_TOKENS",
  fineTune: "FINE_TUNE",
  revealModel: "REVEAL_MODEL",
  serve: "SERVE",
  complete: "COMPLETE",
} as const satisfies Record<string, TutorialNode>;

export const TUTORIAL_EVENT_TYPE = {
  bootstrapped: "BOOTSTRAPPED",
  tabletStoreOpened: "TABLET_STORE_OPENED",
  rackPlaced: "RACK_PLACED",
  modelHardwarePurchased: "MODEL_HARDWARE_PURCHASED",
  syncWorldProgress: "SYNC_WORLD_PROGRESS",
  startTerminalStep: "START_TERMINAL_STEP",
  terminalStepCompleted: "TERMINAL_STEP_COMPLETED",
  usersTick: "USERS_TICK",
  shiftActionUntil: "SHIFT_ACTION_UNTIL",
  clearAction: "CLEAR_ACTION",
  forceComplete: "FORCE_COMPLETE",
} as const;

export interface TutorialProgressSnapshot {
  node: TutorialNode;
  completed: boolean;
}

export function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function advanceTutorialNode(
  currentNode: TutorialNode,
  signals: TutorialWorldSignals,
): TutorialProgressSnapshot {
  let node = currentNode;

  while (true) {
    if ((node === TUTORIAL_NODE.openTablet || node === TUTORIAL_NODE.placeRack) && signals.rackPlaced) {
      node = signals.ownedGpuCount >= REQUIRED_TUTORIAL_GPU_COUNT ? TUTORIAL_NODE.installGpus : TUTORIAL_NODE.buyGpus;
      continue;
    }

    if (node === TUTORIAL_NODE.buyGpus && signals.ownedGpuCount >= REQUIRED_TUTORIAL_GPU_COUNT) {
      node = TUTORIAL_NODE.installGpus;
      continue;
    }

    if (node === TUTORIAL_NODE.installGpus && signals.installedGpuCount >= REQUIRED_TUTORIAL_GPU_COUNT) {
      node = TUTORIAL_NODE.licenseScraper;
      continue;
    }

    if (node === TUTORIAL_NODE.licenseScraper && signals.hasLicensedScraper) {
      node = TUTORIAL_NODE.scrapeTokens;
      continue;
    }

    if (
      node === TUTORIAL_NODE.scrapeTokens
      && signals.scrapingAllocated
      && signals.dataTokens >= MIN_SCRAPED_DATA_TOKENS
    ) {
      node = TUTORIAL_NODE.fineTune;
      continue;
    }

    if (node === TUTORIAL_NODE.fineTune && signals.fineTunedModelCount >= 1) {
      node = TUTORIAL_NODE.revealModel;
      continue;
    }

    if (node === TUTORIAL_NODE.revealModel && signals.hasRevealedPlayerModel) {
      node = TUTORIAL_NODE.serve;
      continue;
    }

    if (node === TUTORIAL_NODE.serve && signals.playerServingModelCount >= 1) {
      return { node: TUTORIAL_NODE.complete, completed: true };
    }

    return { node, completed: node === TUTORIAL_NODE.complete };
  }
}

export interface TutorialMachineState {
  node: TutorialNode;
  started: boolean;
  completed: boolean;
  words: number;
  rackPlaced: boolean;
  gpusOwned: number;
  gpusInstalled: number;
  users: number;
  actionUntil: number | null;
}

export type TutorialEvent =
  | { type: typeof TUTORIAL_EVENT_TYPE.bootstrapped }
  | { type: typeof TUTORIAL_EVENT_TYPE.tabletStoreOpened }
  | { type: typeof TUTORIAL_EVENT_TYPE.rackPlaced }
  | { type: typeof TUTORIAL_EVENT_TYPE.modelHardwarePurchased; count: number }
  | { type: typeof TUTORIAL_EVENT_TYPE.syncWorldProgress; signals: TutorialWorldSignals }
  | { type: typeof TUTORIAL_EVENT_TYPE.startTerminalStep; now: number; durationMs: number }
  | { type: typeof TUTORIAL_EVENT_TYPE.terminalStepCompleted }
  | { type: typeof TUTORIAL_EVENT_TYPE.usersTick; delta: number }
  | { type: typeof TUTORIAL_EVENT_TYPE.shiftActionUntil; deltaMs: number }
  | { type: typeof TUTORIAL_EVENT_TYPE.clearAction }
  | { type: typeof TUTORIAL_EVENT_TYPE.forceComplete };

const TUTORIAL_NODE_TO_STAGE: Record<TutorialNode, TutorialStage> = {
  [TUTORIAL_NODE.bootstrap]: TUTORIAL_STAGE.openTablet,
  [TUTORIAL_NODE.openTablet]: TUTORIAL_STAGE.openTablet,
  [TUTORIAL_NODE.placeRack]: TUTORIAL_STAGE.placeRack,
  [TUTORIAL_NODE.buyGpus]: TUTORIAL_STAGE.buyGpus,
  [TUTORIAL_NODE.installGpus]: TUTORIAL_STAGE.installGpus,
  [TUTORIAL_NODE.licenseScraper]: TUTORIAL_STAGE.licenseScraper,
  [TUTORIAL_NODE.scrapeTokens]: TUTORIAL_STAGE.scrapeTokens,
  [TUTORIAL_NODE.fineTune]: TUTORIAL_STAGE.fineTune,
  [TUTORIAL_NODE.revealModel]: TUTORIAL_STAGE.revealModel,
  [TUTORIAL_NODE.serve]: TUTORIAL_STAGE.serve,
  [TUTORIAL_NODE.complete]: TUTORIAL_STAGE.complete,
};

const TUTORIAL_STAGE_TO_NODE: Record<TutorialStage, TutorialNode> = {
  [TUTORIAL_STAGE.openTablet]: TUTORIAL_NODE.openTablet,
  [TUTORIAL_STAGE.placeRack]: TUTORIAL_NODE.placeRack,
  [TUTORIAL_STAGE.buyGpus]: TUTORIAL_NODE.buyGpus,
  [TUTORIAL_STAGE.installGpus]: TUTORIAL_NODE.installGpus,
  [TUTORIAL_STAGE.licenseScraper]: TUTORIAL_NODE.licenseScraper,
  [TUTORIAL_STAGE.scrapeTokens]: TUTORIAL_NODE.scrapeTokens,
  [TUTORIAL_STAGE.fineTune]: TUTORIAL_NODE.fineTune,
  [TUTORIAL_STAGE.revealModel]: TUTORIAL_NODE.revealModel,
  [TUTORIAL_STAGE.serve]: TUTORIAL_NODE.serve,
  [TUTORIAL_STAGE.complete]: TUTORIAL_NODE.complete,
};

/** Canonical tutorial machine events — single source for reducer `type` strings. */
export const tutorialEvents = {
  bootstrapped: (): TutorialEvent => ({ type: TUTORIAL_EVENT_TYPE.bootstrapped }),
  tabletStoreOpened: (): TutorialEvent => ({ type: TUTORIAL_EVENT_TYPE.tabletStoreOpened }),
  rackPlaced: (): TutorialEvent => ({ type: TUTORIAL_EVENT_TYPE.rackPlaced }),
  modelHardwarePurchased: (count: number): TutorialEvent => ({
    type: TUTORIAL_EVENT_TYPE.modelHardwarePurchased,
    count,
  }),
  syncWorldProgress: (signals: TutorialWorldSignals): TutorialEvent => ({
    type: TUTORIAL_EVENT_TYPE.syncWorldProgress,
    signals,
  }),
  startTerminalStep: (now: number, durationMs: number): TutorialEvent => ({
    type: TUTORIAL_EVENT_TYPE.startTerminalStep,
    now,
    durationMs,
  }),
  terminalStepCompleted: (): TutorialEvent => ({ type: TUTORIAL_EVENT_TYPE.terminalStepCompleted }),
  shiftActionUntil: (deltaMs: number): TutorialEvent => ({ type: TUTORIAL_EVENT_TYPE.shiftActionUntil, deltaMs }),
  clearAction: (): TutorialEvent => ({ type: TUTORIAL_EVENT_TYPE.clearAction }),
  forceComplete: (): TutorialEvent => ({ type: TUTORIAL_EVENT_TYPE.forceComplete }),
  usersTick: (delta: number): TutorialEvent => ({ type: TUTORIAL_EVENT_TYPE.usersTick, delta }),
} as const;

export function tutorialNodeToStage(node: TutorialNode): TutorialStage {
  return TUTORIAL_NODE_TO_STAGE[node];
}

export function tutorialStageToNode(stage: TutorialStage | string): TutorialNode {
  return TUTORIAL_STAGE_TO_NODE[normalizeTutorialStage(stage)];
}

export function createTutorialMachineState(started: boolean, completed: boolean): TutorialMachineState {
  return {
    node: TUTORIAL_NODE.bootstrap,
    started,
    completed,
    words: 0,
    rackPlaced: false,
    gpusOwned: 0,
    gpusInstalled: 0,
    users: 0,
    actionUntil: null,
  };
}

export function reduceTutorialMachine(state: TutorialMachineState, event: TutorialEvent): TutorialMachineState {
  if (event.type === TUTORIAL_EVENT_TYPE.bootstrapped) {
    if (state.completed) {
      return { ...state, node: TUTORIAL_NODE.complete };
    }
    if (state.node === TUTORIAL_NODE.bootstrap) {
      return { ...state, node: TUTORIAL_NODE.openTablet };
    }
    return state;
  }

  if (event.type === TUTORIAL_EVENT_TYPE.shiftActionUntil) {
    if (state.actionUntil === null) return state;
    return { ...state, actionUntil: state.actionUntil + event.deltaMs };
  }

  if (event.type === TUTORIAL_EVENT_TYPE.clearAction) {
    if (state.actionUntil === null) return state;
    return { ...state, actionUntil: null };
  }

  if (event.type === TUTORIAL_EVENT_TYPE.forceComplete) {
    return { ...state, node: TUTORIAL_NODE.complete, completed: true, actionUntil: null };
  }

  if (event.type === TUTORIAL_EVENT_TYPE.syncWorldProgress) {
    const signals = event.signals;
    const gpusOwned = Math.max(state.gpusOwned, signals.ownedGpuCount);
    const gpusInstalled = Math.max(
      state.gpusInstalled,
      Math.min(REQUIRED_TUTORIAL_GPU_COUNT, signals.installedGpuCount),
    );
    const rackPlaced = state.rackPlaced || signals.rackPlaced;

    const progress = advanceTutorialNode(state.node, {
      ...signals,
      rackPlaced,
      ownedGpuCount: gpusOwned,
      installedGpuCount: gpusInstalled,
    });

    return {
      ...state,
      node: progress.node,
      completed: state.completed || progress.completed,
      rackPlaced,
      gpusOwned,
      gpusInstalled,
      users: signals.playerServingModelCount > 0 ? Math.max(state.users, 1) : state.users,
      actionUntil: progress.node === TUTORIAL_NODE.complete ? null : state.actionUntil,
    };
  }

  if (state.node === TUTORIAL_NODE.openTablet && event.type === TUTORIAL_EVENT_TYPE.tabletStoreOpened) {
    return { ...state, node: TUTORIAL_NODE.placeRack };
  }

  if (state.node === TUTORIAL_NODE.placeRack && event.type === TUTORIAL_EVENT_TYPE.rackPlaced) {
    return { ...state, node: TUTORIAL_NODE.buyGpus, rackPlaced: true };
  }

  if (state.node === TUTORIAL_NODE.buyGpus && event.type === TUTORIAL_EVENT_TYPE.modelHardwarePurchased) {
    return {
      ...state,
      gpusOwned: Math.max(state.gpusOwned, clampNonNegative(event.count)),
    };
  }

  if (event.type === TUTORIAL_EVENT_TYPE.startTerminalStep) return state;
  if (event.type === TUTORIAL_EVENT_TYPE.terminalStepCompleted) return state;
  if (event.type === TUTORIAL_EVENT_TYPE.usersTick) return state;

  return state;
}
