import { useEffect, useMemo, useRef, useState } from "react";

import type { TutorialStage } from "@llmville/game/tutorial/tutorialStages";
import { wrapMutation } from "@/runtime/engineAccess";
import { engineActions, useGameEngineState } from "@/runtime/gameEngine";
import type { WorldViewModel } from "@/runtime/worldState";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@llmville/backend/convex/_generated/api";
import type { TabletAppId, TabletStoreTabId } from "@/tablet/tablet";
import {
  getTabletTutorialLock,
  getTutorialEventForTabletAppOpen,
  getTutorialHint,
  type TabletTutorialLock,
  type TutorialHint,
} from "@/tutorial/tabletTutorial";
import { resolveTutorialInputMode } from "@/tutorial/tutorialInput";
import { normalizeTutorialStage } from "@llmville/game/tutorial/tutorialMachine";

export type {
  TutorialHint,
  TabletTutorialLock,
} from "@/tutorial/tabletTutorial";
export type { TutorialNode, TutorialMachineState, TutorialEvent } from "@llmville/game/tutorial/tutorialMachine";


const EXIT_DURATION_MS = 300;

export interface AnimatedTextState {
  displayed: string;
  exiting: string | null;
  isTransitioning: boolean;
}

export function useAnimatedText(text: string): AnimatedTextState {
  const [displayed, setDisplayed] = useState(text);
  const [exiting, setExiting] = useState<string | null>(null);
  const prevTextRef = useRef(text);

  useEffect(() => {
    if (text === prevTextRef.current) return;
    setExiting(prevTextRef.current);
    setDisplayed(text);
    prevTextRef.current = text;
    const timeoutId = setTimeout(() => setExiting(null), EXIT_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [text]);

  return {
    displayed,
    exiting,
    isTransitioning: exiting !== null,
  };
}

interface TutorialState {
  _id: Id<"games">;
  tutorialStage?: TutorialStage;
  tutorialWords?: number;
}

interface TutorialRuntimeState {
  gameId: Id<"games"> | null;
  tutorialStage: TutorialStage;
  tutorialWords: number;
}

interface UseTutorialProgressOptions {
  engine: TutorialEngine;
  game: TutorialState | null | undefined;
  canEditGame: boolean;
  state: TutorialRuntimeState;
  setTutorialProgress: (args: {
    gameId: Id<"games">;
    tutorialStage: TutorialStage;
    tutorialWords: number;
  }) => Promise<unknown>;
}

interface TutorialEngine {
  dispatch(action: any): void;
}

export function useTutorialProgress({
  engine,
  game,
  canEditGame,
  state,
  setTutorialProgress,
}: UseTutorialProgressOptions) {
  const hydratedTutorialRef = useRef<{ gameId: Id<"games">; engine: TutorialEngine } | null>(null);

  useEffect(() => {
    if (game == null) return;
    const alreadyHydrated = hydratedTutorialRef.current?.gameId === game._id && hydratedTutorialRef.current?.engine === engine;
    if (alreadyHydrated) return;

    const normalizedStage = normalizeTutorialStage(game.tutorialStage);
    hydratedTutorialRef.current = { gameId: game._id, engine };
    engine.dispatch(engineActions.hydrateTutorialProgress(normalizedStage, game.tutorialWords ?? 0));
  }, [engine, game]);

  const lastPersistedTutorialSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canEditGame || state.gameId === null) return;
    const signature = [state.tutorialStage, state.tutorialWords].join("|");
    if (lastPersistedTutorialSignatureRef.current === signature) return;
    lastPersistedTutorialSignatureRef.current = signature;

    void wrapMutation(
      "setTutorialProgress",
      setTutorialProgress({
        gameId: state.gameId,
        tutorialStage: state.tutorialStage,
        tutorialWords: state.tutorialWords,
      }),
    );
  }, [canEditGame, setTutorialProgress, state]);
}

interface UseTutorialStateParams {
  world: Pick<WorldViewModel, "engine" | "game" | "canEditGame" | "playerId" | "buildInventory" | "onPlaceTutorialBench">;
  isTouch?: boolean;
}

export interface TutorialViewModel {
  tutorialWords: number;
  tutorialHint: TutorialHint | null;
  tutorialStarted: boolean;
  tutorialCompleted: boolean;
  tutorialStage: TutorialStage;
  tutorialActionUntil: number | null;
  tutorialBenchPlaced: boolean;
  tabletTutorialLock: TabletTutorialLock | null;
  onPlaceTutorialBench: () => void;
  onTabletAppOpened: (tab: TabletAppId) => void;
  onTabletStoreTabOpened: (tab: TabletStoreTabId) => void;
}

export function useTutorialState({ world, isTouch = false }: UseTutorialStateParams): TutorialViewModel {
  const inputMode = resolveTutorialInputMode(isTouch);
  const setTutorialProgressMutation = useMutation(api.world.setTutorialProgress);
  const gameplay = useGameEngineState(world.engine, (current) => current.gameplay);
  const { tutorial, tutorialStage } = gameplay;
  const {
    words: tutorialWords,
    started: tutorialStarted,
    completed: tutorialCompleted,
    gpusInstalled: tutorialGpusInstalled,
    users: tutorialUsers,
    actionUntil: tutorialActionUntil,
    rackPlaced: tutorialBenchPlaced,
  } = tutorial;

  useTutorialProgress({
    engine: world.engine,
    game: world.game,
    canEditGame: world.canEditGame,
    state: {
      gameId: world.game?._id ?? null,
      tutorialStage,
      tutorialWords,
    },
    setTutorialProgress: setTutorialProgressMutation,
  });

  const tabletTutorialLock = getTabletTutorialLock({
    tutorialStarted,
    tutorialCompleted,
    tutorialStage,
    buildInventory: world.buildInventory,
  });

  const tutorialHint = tutorialCompleted
    ? null
    : getTutorialHint(
      tutorialStage,
      tutorialGpusInstalled,
      tutorialUsers,
      { buildInventory: world.buildInventory },
      inputMode,
    );

  /* eslint-disable react-hooks/exhaustive-deps -- tutorial view-model memo; deps list fields read from world */
  return useMemo(() => ({
    tutorialWords,
    tutorialHint,
    tutorialStarted,
    tutorialCompleted,
    tutorialStage,
    tutorialActionUntil,
    tutorialBenchPlaced,
    tabletTutorialLock,
    onPlaceTutorialBench: () => {
      if (!world.canEditGame) return;
      world.onPlaceTutorialBench();
    },
    onTabletAppOpened: (tab: TabletAppId) => {
      const tutorialEvent = getTutorialEventForTabletAppOpen(tab);
      if (tutorialEvent !== null) {
        world.engine.dispatch(engineActions.tabletStoreOpened());
      }
    },
    onTabletStoreTabOpened: (_tab: TabletStoreTabId) => undefined,
  }), [
    inputMode,
    tabletTutorialLock,
    tutorialActionUntil,
    tutorialBenchPlaced,
    tutorialCompleted,
    tutorialHint,
    tutorialStage,
    tutorialStarted,
    tutorialWords,
    world.canEditGame,
    world.engine,
    world.onPlaceTutorialBench,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */
}

