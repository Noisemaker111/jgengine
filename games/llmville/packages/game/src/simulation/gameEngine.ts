import { BUILD_MENU_TAB_SEQUENCE, normalizeBuildDirection, type BuildMenuTabId, type BuildPlacementPreview, type CoreBuildPlacementDraft, type CorePlacedBuildItem } from "@llmville/game/build/build";
import type { BuildItemId } from "@llmville/game/build/catalog";
import {
  createTutorialMachineState,
  reduceTutorialMachine,
  TUTORIAL_EVENT_TYPE,
  tutorialEvents,
  tutorialNodeToStage,
  tutorialStageToNode,
  type TutorialMachineState,
} from "@llmville/game/tutorial/tutorialMachine";
import { TUTORIAL_STAGE, type TutorialStage } from "@llmville/game/tutorial/tutorialStages";
import type { TutorialWorldSignals } from "@llmville/game/tutorial/tutorialProgress";
import {
  defaultEngineWorldContext,
  type EngineWorldRack,
} from "@llmville/game/simulation/worldContext";
import { createEmptyMovementKeys, type MovementKey } from "@jgengine/core/movement/movementModel";
import {
  composeStateFeatures,
  EngineStore,
  type EngineStoreConfig,
  type StateFeature,
} from "@llmville/game/simulation/stateStore";
import {
  gamePositionedPromptsEqual,
  interactionHintsEqual,
  interactionTargetsEqual,
  resolveInteractionProximity,
  type GamePositionedPrompt,
  type InteractionHint,
  type InteractionHintResolver,
  type InteractionTarget,
} from "@llmville/game/simulation/interaction";

export type { CoreRackState, GamePositionedPrompt, InteractionHint, ZonePoint } from "@llmville/game/simulation/interaction";
export { EngineStore, type EngineStoreConfig } from "@llmville/game/simulation/stateStore";
export {
  resolveInteractionProximity,
  type InteractionHintResolver,
  type InteractionSnapshot,
  type InteractionProximity,
  type PlayerPosition,
} from "@llmville/game/simulation/interaction";

export type { MovementKey } from "@jgengine/core/movement/movementModel";
export type BuildPlacementDraft = CoreBuildPlacementDraft<BuildItemId>;

export interface BuildMenuState {
  activeTab: BuildMenuTabId;
  selectionByTab: Record<BuildMenuTabId, number>;
  placementDraft: BuildPlacementDraft | null;
  placementPreview: BuildPlacementPreview | null;
}

export interface TweetNotification {
  message: string;
  avatarName: string;
  eventId: string;
}

export interface GameEngineParams {
  activeSlot: number;
  gameId: string;
  playerId: string;
}

export interface GameWorldState {
  playerId: string;
  benchPosition: { x: number; z: number } | null;
  racks: readonly EngineWorldRack[];
  placedBuildItems: readonly CorePlacedBuildItem[];
  isTraining: boolean;
  hasLab: boolean;
  touchControlsEnabled: boolean;
  activePrompt: GamePositionedPrompt | null;
}

export interface GameSessionState {
  gameId: string | null;
  activeSlot: number;
  connection: { isConnecting: boolean; error: string | null };
}

export interface GamePlayerState {
  position: { x: number; z: number };
  rotationDegrees: number;
  keysDown: Record<MovementKey, boolean>;
  pointerLocked: boolean;
  isPaused: boolean;
  pauseStartedAt: number | null;
}

export interface GamePlayState {
  tutorial: TutorialMachineState;
  tutorialStage: TutorialStage;
}

export interface GameInteractionState {
  hint: InteractionHint | null;
  target: InteractionTarget | null;
  activePrompt: GamePositionedPrompt | null;
}

export interface GameEffectsState {
  launchCelebrationUntil: number | null;
  tweetNotification: TweetNotification | null;
  shownEventIds: ReadonlySet<string>;
  unlockSuccess: { baseModelId: string; until: number } | null;
  spendPulse: { amount: number; until: number } | null;
}

export interface GameEngineState {
  session: GameSessionState;
  player: GamePlayerState;
  build: BuildMenuState;
  gameplay: GamePlayState;
  interaction: GameInteractionState;
  effects: GameEffectsState;
  world: GameWorldState;
}

export type GameSessionAction =
  | { type: "BOOTSTRAP_START" }
  | { type: "BOOTSTRAP_SUCCESS"; gameId: string }
  | { type: "BOOTSTRAP_FAILURE"; message: string };

export const ENGINE_WORLD_ACTION = {
  setWorldContext: "SET_WORLD_CONTEXT",
  setActivePrompt: "SET_ACTIVE_PROMPT",
} as const;

export type GameWorldAction =
  | {
    type: typeof ENGINE_WORLD_ACTION.setWorldContext;
    benchPosition: { x: number; z: number } | null;
    racks: readonly EngineWorldRack[];
    placedBuildItems: readonly CorePlacedBuildItem[];
    isTraining: boolean;
    hasLab: boolean;
    touchControlsEnabled: boolean;
    tutorialSignals: TutorialWorldSignals;
  }
  | {
    type: typeof ENGINE_WORLD_ACTION.setActivePrompt;
    activePrompt: GamePositionedPrompt | null;
  };

export type GamePlayerAction =
  | { type: "SET_POINTER_LOCK"; pointerLocked: boolean }
  | { type: "SET_PLAYING"; playing: boolean; now: number }
  | { type: "SET_MOVEMENT_KEY"; key: MovementKey; pressed: boolean }
  | { type: "SET_PLAYER_POSITION"; position: { x: number; z: number } }
  | { type: "RESET_MOVEMENT_KEYS" }
  | { type: "ROTATE_PLACEMENT" };

export type GameBuildAction =
  | { type: "SET_BUILD_TAB"; tab: BuildMenuTabId }
  | { type: "SET_BUILD_ITEM_INDEX"; index: number }
  | { type: "CYCLE_BUILD_TAB"; direction: -1 | 1 }
  | { type: "CYCLE_BUILD_ITEM"; direction: -1 | 1; itemCount: number }
  | { type: "START_PLACEMENT_DRAFT"; itemId: BuildPlacementDraft["itemId"] }
  | { type: "CLEAR_PLACEMENT_DRAFT" }
  | { type: "ROTATE_BUILD_DRAFT" }
  | { type: "SET_PLACEMENT_PREVIEW"; preview: BuildPlacementPreview | null };

export type ProgressAction =
  | {
    type: "HYDRATE_TUTORIAL_PROGRESS";
    stage: TutorialStage;
    words: number;
  }
  | { type: "TABLET_STARTED_TUTORIAL_STEP"; now: number; tutorialStepDurationMs: number }
  | { type: typeof TUTORIAL_EVENT_TYPE.tabletStoreOpened }
  | { type: "PLACE_TUTORIAL_BENCH" }
  | { type: typeof TUTORIAL_EVENT_TYPE.modelHardwarePurchased; count: number }
  | { type: "TICK"; now: number }

export type GameEffectsAction =
  | { type: "SHOW_TWEET"; notification: TweetNotification }
  | { type: "CLEAR_TWEET" }
  | { type: "MARK_EVENT_SHOWN"; eventId: string }
  | { type: "TRIGGER_LAUNCH_CELEBRATION"; now: number; durationMs: number }
  | { type: "CLEAR_LAUNCH_CELEBRATION" }
  | { type: "TRIGGER_UNLOCK_SUCCESS"; baseModelId: string; durationMs: number }
  | { type: "CLEAR_UNLOCK_SUCCESS" }
  | { type: "TRIGGER_SPEND_PULSE"; amount: number }
  | { type: "CLEAR_SPEND_PULSE" };

export type GameEngineAction =
  | GameSessionAction
  | GameWorldAction
  | GamePlayerAction
  | GameBuildAction
  | ProgressAction
  | GameEffectsAction;

/** Canonical action constructors — single source for dispatch `type` strings. */
export const engineActions = {
  bootstrapStart: (): GameSessionAction => ({ type: "BOOTSTRAP_START" }),
  bootstrapSuccess: (gameId: string): GameSessionAction => ({ type: "BOOTSTRAP_SUCCESS", gameId }),
  bootstrapFailure: (message: string): GameSessionAction => ({ type: "BOOTSTRAP_FAILURE", message }),
  setMovementKey: (key: MovementKey, pressed: boolean): GamePlayerAction => ({ type: "SET_MOVEMENT_KEY", key, pressed }),
  setPlayerPosition: (position: { x: number; z: number }): GamePlayerAction => ({ type: "SET_PLAYER_POSITION", position }),
  setActivePrompt: (activePrompt: GamePositionedPrompt | null): GameWorldAction => ({
    type: ENGINE_WORLD_ACTION.setActivePrompt,
    activePrompt,
  }),
  resetMovementKeys: (): GamePlayerAction => ({ type: "RESET_MOVEMENT_KEYS" }),
  setPointerLock: (pointerLocked: boolean): GamePlayerAction => ({ type: "SET_POINTER_LOCK", pointerLocked }),
  setPlaying: (playing: boolean, now: number): GamePlayerAction => ({ type: "SET_PLAYING", playing, now }),
  rotatePlacement: (): GamePlayerAction => ({ type: "ROTATE_PLACEMENT" }),
  setBuildTab: (tab: BuildMenuTabId): GameBuildAction => ({ type: "SET_BUILD_TAB", tab }),
  setBuildItemIndex: (index: number): GameBuildAction => ({ type: "SET_BUILD_ITEM_INDEX", index }),
  cycleBuildTab: (direction: -1 | 1): GameBuildAction => ({ type: "CYCLE_BUILD_TAB", direction }),
  cycleBuildItem: (direction: -1 | 1, itemCount: number): GameBuildAction => ({ type: "CYCLE_BUILD_ITEM", direction, itemCount }),
  startPlacementDraft: (itemId: BuildPlacementDraft["itemId"]): GameBuildAction => ({ type: "START_PLACEMENT_DRAFT", itemId }),
  clearPlacementDraft: (): GameBuildAction => ({ type: "CLEAR_PLACEMENT_DRAFT" }),
  rotateBuildDraft: (): GameBuildAction => ({ type: "ROTATE_BUILD_DRAFT" }),
  setPlacementPreview: (preview: BuildPlacementPreview | null): GameBuildAction => ({ type: "SET_PLACEMENT_PREVIEW", preview }),
  placeTutorialBench: (): ProgressAction => ({ type: "PLACE_TUTORIAL_BENCH" }),
  hydrateTutorialProgress: (stage: TutorialStage, words: number): ProgressAction => ({ type: "HYDRATE_TUTORIAL_PROGRESS", stage, words }),
  tabletStoreOpened: (): ProgressAction => ({ type: TUTORIAL_EVENT_TYPE.tabletStoreOpened }),
  tabletStartedTutorialStep: (now: number, tutorialStepDurationMs: number): ProgressAction => ({
    type: "TABLET_STARTED_TUTORIAL_STEP",
    now,
    tutorialStepDurationMs,
  }),
  modelHardwarePurchased: (count: number): ProgressAction => ({
    type: TUTORIAL_EVENT_TYPE.modelHardwarePurchased,
    count,
  }),
  clearLaunchCelebration: (): GameEffectsAction => ({ type: "CLEAR_LAUNCH_CELEBRATION" }),
  clearSpendPulse: (): GameEffectsAction => ({ type: "CLEAR_SPEND_PULSE" }),
  clearUnlockSuccess: (): GameEffectsAction => ({ type: "CLEAR_UNLOCK_SUCCESS" }),
  clearTweet: (): GameEffectsAction => ({ type: "CLEAR_TWEET" }),
  triggerLaunchCelebration: (now: number, durationMs: number): GameEffectsAction => ({ type: "TRIGGER_LAUNCH_CELEBRATION", now, durationMs }),
  triggerUnlockSuccess: (baseModelId: string, durationMs: number): GameEffectsAction => ({ type: "TRIGGER_UNLOCK_SUCCESS", baseModelId, durationMs }),
  triggerSpendPulse: (amount: number): GameEffectsAction => ({ type: "TRIGGER_SPEND_PULSE", amount }),
} as const;

export interface GameEngineEventMap {
  tutorialCompleted: { slot: number };
}

export type GameEngineEventName = keyof GameEngineEventMap;


export type GameFeature = StateFeature<GameEngineState, GameEngineAction, GameEngineEventMap>;

function createInitialBuildMenuState(): BuildMenuState {
  return {
    activeTab: "all",
    selectionByTab: {
      all: 0,
      infrastructure: 0,
      decor: 0,
      hardware: 0,
    },
    placementDraft: null,
    placementPreview: null,
  };
}

function cycleBuildTab(current: BuildMenuTabId, direction: -1 | 1): BuildMenuTabId {
  const currentIndex = BUILD_MENU_TAB_SEQUENCE.indexOf(current);
  if (currentIndex < 0) return current;
  const nextIndex = (currentIndex + direction + BUILD_MENU_TAB_SEQUENCE.length) % BUILD_MENU_TAB_SEQUENCE.length;
  const nextTab = BUILD_MENU_TAB_SEQUENCE[nextIndex];
  return nextTab ?? current;
}

function cycleBuildItem(currentIndex: number, itemCount: number, direction: -1 | 1): number {
  if (itemCount < 1) return 0;
  const maxIndex = itemCount - 1;
  if (direction > 0) {
    return (currentIndex + 1) % (maxIndex + 1);
  }
  return (currentIndex - 1 + maxIndex + 1) % (maxIndex + 1);
}

export function commitPlacementDraft(build: BuildMenuState): BuildMenuState {
  return { ...build, placementDraft: null, placementPreview: null };
}

function rotatePlacementDraft(draft: BuildPlacementDraft | null): BuildPlacementDraft | null {
  if (draft === null) return null;
  return {
    ...draft,
    direction: normalizeBuildDirection(draft.direction + 1),
  };
}

const gameLoopFeature: GameFeature = {
  reduce(state, action) {
    if (action.type === "BOOTSTRAP_START") {
      if (state.session.gameId !== null && state.session.connection.error === null) return state;
      return { ...state, session: { ...state.session, connection: { isConnecting: true, error: null } } };
    }
    if (action.type === "BOOTSTRAP_SUCCESS") {
      return {
        ...state,
        session: { ...state.session, gameId: action.gameId, connection: { isConnecting: false, error: null } },
      };
    }
    if (action.type === "BOOTSTRAP_FAILURE") {
      return { ...state, session: { ...state.session, gameId: null, connection: { isConnecting: false, error: action.message } } };
    }
    if (action.type === "SET_POINTER_LOCK") {
      // Pointer lock only governs mouse-look on desktop. Walking is gated by the
      // play/pause state (SET_PLAYING) so the avatar still moves with WASD or the
      // touch D-pad whether or not the cursor happens to be locked.
      if (state.player.pointerLocked === action.pointerLocked) return state;
      return { ...state, player: { ...state.player, pointerLocked: action.pointerLocked } };
    }
    if (action.type === "SET_PLAYING") {
      const wasPaused = state.player.isPaused;
      const becamePaused = !action.playing && !wasPaused;
      const resumed = action.playing && wasPaused;
      if (!becamePaused && !resumed) return state;
      const pauseStartedAt = becamePaused ? action.now : resumed ? null : state.player.pauseStartedAt;
      const pausedFor = resumed && state.player.pauseStartedAt !== null ? action.now - state.player.pauseStartedAt : 0;
      const tutorial = pausedFor > 0
        ? reduceTutorialMachine(state.gameplay.tutorial, tutorialEvents.shiftActionUntil(pausedFor))
        : state.gameplay.tutorial;
      return {
        ...state,
        player: { ...state.player, isPaused: !action.playing, pauseStartedAt },
        gameplay: { ...state.gameplay, tutorial },
      };
    }
    if (action.type === "RESET_MOVEMENT_KEYS") {
      return { ...state, player: { ...state.player, keysDown: createEmptyMovementKeys() } };
    }
    if (action.type === "SET_MOVEMENT_KEY") {
      return { ...state, player: { ...state.player, keysDown: { ...state.player.keysDown, [action.key]: action.pressed } } };
    }
    if (action.type === "SET_PLAYER_POSITION") {
      return { ...state, player: { ...state.player, position: action.position } };
    }
    if (action.type === "TICK") {
      // Fires once, exactly when a timed tutorial step elapses (scheduled by a
      // setTimeout in the runtime) — not a periodic poll. Returns the same state
      // reference when there is nothing to advance so it never forces a re-render.
      if (state.player.isPaused || state.gameplay.tutorial.actionUntil === null || action.now < state.gameplay.tutorial.actionUntil) {
        return state;
      }
      return {
        ...state,
        gameplay: { ...state.gameplay, tutorial: reduceTutorialMachine(state.gameplay.tutorial, tutorialEvents.terminalStepCompleted()) },
      };
    }
    if (action.type === "SHOW_TWEET") return { ...state, effects: { ...state.effects, tweetNotification: action.notification } };
    if (action.type === "CLEAR_TWEET") return { ...state, effects: { ...state.effects, tweetNotification: null } };
    if (action.type === "MARK_EVENT_SHOWN") {
      if (state.effects.shownEventIds.has(action.eventId)) return state;
      const nextShownEventIds = new Set(state.effects.shownEventIds);
      nextShownEventIds.add(action.eventId);
      return { ...state, effects: { ...state.effects, shownEventIds: nextShownEventIds } };
    }
    if (action.type === "TRIGGER_LAUNCH_CELEBRATION") {
      return { ...state, effects: { ...state.effects, launchCelebrationUntil: action.now + action.durationMs } };
    }
    if (action.type === "CLEAR_LAUNCH_CELEBRATION") {
      if (state.effects.launchCelebrationUntil === null) return state;
      return { ...state, effects: { ...state.effects, launchCelebrationUntil: null } };
    }
    if (action.type === "TRIGGER_UNLOCK_SUCCESS") {
      return { ...state, effects: { ...state.effects, unlockSuccess: { baseModelId: action.baseModelId, until: Date.now() + action.durationMs } } };
    }
    if (action.type === "CLEAR_UNLOCK_SUCCESS") {
      if (state.effects.unlockSuccess === null) return state;
      return { ...state, effects: { ...state.effects, unlockSuccess: null } };
    }
    if (action.type === "TRIGGER_SPEND_PULSE") {
      return { ...state, effects: { ...state.effects, spendPulse: { amount: action.amount, until: Date.now() + 2_000 } } };
    }
    if (action.type === "CLEAR_SPEND_PULSE") {
      if (state.effects.spendPulse === null) return state;
      return { ...state, effects: { ...state.effects, spendPulse: null } };
    }
    return state;
  },
};

const gameBuildFeature: GameFeature = {
  reduce(state, action) {
    if (action.type === "ROTATE_PLACEMENT") return { ...state, player: { ...state.player, rotationDegrees: (state.player.rotationDegrees + 90) % 360 } };
    if (action.type === "SET_BUILD_TAB") return { ...state, build: { ...state.build, activeTab: action.tab } };
    if (action.type === "SET_BUILD_ITEM_INDEX") {
      const tab = state.build.activeTab;
      return { ...state, build: { ...state.build, selectionByTab: { ...state.build.selectionByTab, [tab]: Math.max(0, action.index) } } };
    }
    if (action.type === "CYCLE_BUILD_TAB") {
      return { ...state, build: { ...state.build, activeTab: cycleBuildTab(state.build.activeTab, action.direction) } };
    }
    if (action.type === "CYCLE_BUILD_ITEM") {
      const currentIndex = state.build.selectionByTab[state.build.activeTab];
      return {
        ...state,
        build: {
          ...state.build,
          selectionByTab: {
            ...state.build.selectionByTab,
            [state.build.activeTab]: cycleBuildItem(currentIndex, action.itemCount, action.direction),
          },
        },
      };
    }
    if (action.type === "START_PLACEMENT_DRAFT") {
      return {
        ...state,
        build: {
          ...state.build,
          placementDraft: { itemId: action.itemId, direction: 0 },
          placementPreview: null,
        },
      };
    }
    if (action.type === "CLEAR_PLACEMENT_DRAFT") {
      return { ...state, build: commitPlacementDraft(state.build) };
    }
    if (action.type === "ROTATE_BUILD_DRAFT") {
      return { ...state, build: { ...state.build, placementDraft: rotatePlacementDraft(state.build.placementDraft) } };
    }
    if (action.type === "SET_PLACEMENT_PREVIEW") {
      return { ...state, build: { ...state.build, placementPreview: action.preview } };
    }
    return state;
  },
};

type GameEventEmitter = <K extends keyof GameEngineEventMap>(eventName: K, payload: GameEngineEventMap[K]) => void;

const gameProgressFeature: GameFeature = {
  reduce(state, action) {
    if (action.type === "BOOTSTRAP_SUCCESS") {
      return { ...state, gameplay: { ...state.gameplay, tutorial: reduceTutorialMachine(state.gameplay.tutorial, tutorialEvents.bootstrapped()) } };
    }
    if (action.type === "HYDRATE_TUTORIAL_PROGRESS") {
      const words = Math.max(0, Math.floor(action.words));
      return {
        ...state,
        gameplay: {
          ...state.gameplay,
          tutorial: {
            ...state.gameplay.tutorial,
            node: tutorialStageToNode(action.stage),
            started: true,
            completed: action.stage === TUTORIAL_STAGE.complete,
            words,
          },
        },
      };
    }
    if (action.type === TUTORIAL_EVENT_TYPE.tabletStoreOpened) {
      return { ...state, gameplay: { ...state.gameplay, tutorial: reduceTutorialMachine(state.gameplay.tutorial, tutorialEvents.tabletStoreOpened()) } };
    }
    if (action.type === "PLACE_TUTORIAL_BENCH") {
      return { ...state, gameplay: { ...state.gameplay, tutorial: reduceTutorialMachine(state.gameplay.tutorial, tutorialEvents.rackPlaced()) } };
    }
    if (action.type === TUTORIAL_EVENT_TYPE.modelHardwarePurchased) {
      return { ...state, gameplay: { ...state.gameplay, tutorial: reduceTutorialMachine(state.gameplay.tutorial, tutorialEvents.modelHardwarePurchased(action.count)) } };
    }
    if (action.type === "TABLET_STARTED_TUTORIAL_STEP") {
      return {
        ...state,
        gameplay: {
          ...state.gameplay,
          tutorial: reduceTutorialMachine(
            state.gameplay.tutorial,
            tutorialEvents.startTerminalStep(action.now, action.tutorialStepDurationMs),
          ),
        },
      };
    }
    return state;
  },
  derive(state) {
    return { ...state, gameplay: { ...state.gameplay, tutorialStage: tutorialNodeToStage(state.gameplay.tutorial.node) } };
  },
  onTransition(previous, next, emit: GameEventEmitter) {
    if (!previous.gameplay.tutorial.completed && next.gameplay.tutorial.completed) {
      emit("tutorialCompleted", { slot: next.session.activeSlot });
    }
  },
};

const gameWorldFeature: GameFeature = {
  reduce(state, action) {
    if (action.type === ENGINE_WORLD_ACTION.setActivePrompt) {
      if (gamePositionedPromptsEqual(state.world.activePrompt, action.activePrompt)) return state;
      return { ...state, world: { ...state.world, activePrompt: action.activePrompt } };
    }
    if (action.type !== ENGINE_WORLD_ACTION.setWorldContext) return state;
    const tutorial = reduceTutorialMachine(
      state.gameplay.tutorial,
      tutorialEvents.syncWorldProgress(action.tutorialSignals),
    );
    return {
      ...state,
      world: {
        ...state.world,
        benchPosition: action.benchPosition,
        racks: action.racks,
        placedBuildItems: action.placedBuildItems,
        isTraining: action.isTraining,
        hasLab: action.hasLab,
        touchControlsEnabled: action.touchControlsEnabled,
      },
      gameplay: { ...state.gameplay, tutorial },
    };
  },
};

const nullInteractionHintResolver: InteractionHintResolver = () => null;

function createGameInteractionFeature(resolveHint: InteractionHintResolver): GameFeature {
  return {
    derive(state) {
      const world = state.world;
      const proximity = resolveInteractionProximity(
        state.player.position,
        world.benchPosition,
        world.activePrompt,
      );
      const interactionHint = resolveHint(
        {
          playerPosition: state.player.position,
          tutorialNode: state.gameplay.tutorial.node,
          tutorialStarted: state.gameplay.tutorial.started,
          tutorialCompleted: state.gameplay.tutorial.completed,
          tutorialBenchPlaced: state.gameplay.tutorial.rackPlaced,
          tutorialGpusInstalled: state.gameplay.tutorial.gpusInstalled,
          tutorialUsers: state.gameplay.tutorial.users,
          pointerLocked: state.player.pointerLocked,
          touchControlsEnabled: world.touchControlsEnabled,
          placementDraftActive: state.build.placementDraft !== null,
          hasLab: world.hasLab,
          benchPosition: world.benchPosition,
          isTraining: world.isTraining,
          racks: world.racks,
          placedBuildItems: world.placedBuildItems,
        },
        proximity,
      );

      const previous = state.interaction;
      const hint = interactionHintsEqual(previous.hint, interactionHint)
        ? previous.hint
        : interactionHint;
      const target = interactionTargetsEqual(previous.target, proximity.target)
        ? previous.target
        : proximity.target;
      const activePrompt = gamePositionedPromptsEqual(previous.activePrompt, proximity.activePrompt)
        ? previous.activePrompt
        : proximity.activePrompt;
      if (hint === previous.hint && target === previous.target && activePrompt === previous.activePrompt) return state;
      return { ...state, interaction: { hint, target, activePrompt } };
    },
  };
}

function gameFeatureSet(resolveHint: InteractionHintResolver, extraFeatures: readonly GameFeature[] = []) {
  return composeStateFeatures([
    gameLoopFeature,
    gameBuildFeature,
    gameProgressFeature,
    gameWorldFeature,
    createGameInteractionFeature(resolveHint),
    ...extraFeatures,
  ]);
}

function createState(params: GameEngineParams): GameEngineState {
  const tutorial = createTutorialMachineState(true, false);
  const playerPosition = { x: 0, z: 0 };

  return {
    session: {
      gameId: null,
      activeSlot: params.activeSlot,
      connection: { isConnecting: true, error: null },
    },
    player: {
      position: playerPosition,
      rotationDegrees: 0,
      keysDown: createEmptyMovementKeys(),
      pointerLocked: false,
      isPaused: true,
      pauseStartedAt: null,
    },
    build: createInitialBuildMenuState(),
    gameplay: {
      tutorial,
      tutorialStage: tutorialNodeToStage(tutorial.node),
    },
    interaction: {
      hint: null,
      target: null,
      activePrompt: null,
    },
    effects: {
      launchCelebrationUntil: null,
      tweetNotification: null,
      shownEventIds: new Set<string>(),
      unlockSuccess: null,
      spendPulse: null,
    },
    world: {
      playerId: params.playerId,
      benchPosition: defaultEngineWorldContext.benchPosition,
      racks: defaultEngineWorldContext.racks,
      placedBuildItems: defaultEngineWorldContext.placedBuildItems,
      isTraining: defaultEngineWorldContext.isTraining,
      hasLab: defaultEngineWorldContext.hasLab,
      touchControlsEnabled: defaultEngineWorldContext.touchControlsEnabled,
      activePrompt: null,
    },
  };
}

export function createGameStoreConfig(
  params: GameEngineParams,
  resolveHint: InteractionHintResolver = nullInteractionHintResolver,
  extraFeatures: readonly GameFeature[] = [],
): EngineStoreConfig<GameEngineState, GameEngineAction, GameEngineEventMap> {
  const { reduce, derive, onTransition } = gameFeatureSet(resolveHint, extraFeatures);

  return {
    initialState: createState(params),
    reduce,
    derive,
    onTransition,
  };
}

export interface GameEngineConfig extends GameEngineParams {
  resolveHint?: InteractionHintResolver;
  extraFeatures?: readonly GameFeature[];
}

export class GameEngine {
  private readonly store: EngineStore<GameEngineState, GameEngineAction, GameEngineEventMap>;

  constructor(config: GameEngineConfig) {
    this.store = new EngineStore(createGameStoreConfig(
      config,
      config.resolveHint,
      config.extraFeatures,
    ));
  }

  getState() {
    return this.store.getState();
  }

  subscribe(listener: (state: GameEngineState) => void) {
    return this.store.subscribe(listener);
  }

  dispatch(action: GameEngineAction) {
    this.store.dispatch(action);
  }

  readonly state = {
    get: () => this.getState(),
    subscribe: (listener: (state: GameEngineState) => void) => this.subscribe(listener),
  };

  readonly actions = {
    tick: (now: number) => this.dispatch({ type: "TICK", now }),
  };

  readonly events = {
    on: <K extends GameEngineEventName>(eventName: K, listener: (payload: GameEngineEventMap[K]) => void) => {
      return this.store.on(eventName, listener);
    },
  };
}

