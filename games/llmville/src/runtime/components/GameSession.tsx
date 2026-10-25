import { JoinGate } from "@jgengine/shell/JoinGate";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";

import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { useBuildSession, type BuildViewModel } from "@/build/buildSession";
import { engineActions } from "@/runtime/gameEngine";
import { usePlayerPosition } from "@/runtime/playerPosition";
import { useGameEngineInput } from "@/runtime/input";
import { useWorldState, type WorldViewModel } from "@/runtime/worldState";
import { isReadyWorldViewModel, type ReadyWorldViewModel } from "@/runtime/worldViewModel";
import { useAppSettings } from "@/settings/settings";
import type { AppKeybinds } from "@/settings/settings";
import { useTutorialState, type TutorialViewModel } from "@/tutorial/tutorialRuntime";

import { buildRackSlotGpuWorkloadMap } from "@/infrastructure/computeUnits";
import { useIsTouchDevice } from "@/movement/movementInput";
import { useMovement } from "@/movement/useMovement";
import { RackHardwareDragVisualProvider } from "@/infrastructure/rackHardwareDragVisual";
import { useRackHardwareSession, type RackHardwareViewModel } from "@/infrastructure/rackHardwareSession";
import { BankruptOverlay } from "@/economy/components/BankruptOverlay";
import { GameConnectionErrorScreen } from "@/runtime/components/GameConnectionErrorScreen";
import { RouteLoadingScreen } from "@/components/RouteLoadingScreen";
import GameOverlay from "@/runtime/components/GameOverlay";
import GameScene from "@/scene/components/GameScene";
import { isTabletUiBlockingGameplay, useTabletNav, type TabletNavState } from "@/tablet/tablet";
import { TabletNavProvider } from "@/tablet/components/tabletNav";
import { useProfiledRender } from "@/runtime/useProfiledRender";
import { PROFILE_SECTION } from "@/runtime/runtimePerformanceProfiler";
import { gameConfig } from "@/game.config";
import { useLocalPlayerPositionSync, useLocalPlayerSpawn } from "@/runtime/localPlayerEntity";
import { LlmvilleGameProvider } from "@/runtime/gameContext";
import { useSceneObjectSync } from "@/runtime/sceneObjects";
import { useInteractionPromptSync } from "@/runtime/interactionPrompts";
import { useRackConfigureCommand } from "@/runtime/promptCommands";
import { WorldServerSessionProvider, useWorldServer } from "@/runtime/worldServerSession";
import { PresenceTransportProvider } from "@/multiplayer/PresenceTransportProvider";

interface RuntimeProps {
  user: { id: string; name: string | null };
  convexUser: { displayName: string; avatarId?: string | null } | null;
  gameId: Id<"games">;
}

export function GameSession(props: RuntimeProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = gameConfig.name;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <LlmvilleGameProvider userId={props.user.id}>
      <WorldServerSessionProvider playerId={props.user.id}>
        <WorldServerJoinGate>
          <PresenceTransportProvider transport={gameConfig.multiplayer}>
            <GameSessionLocalPlayer>
              <GameSessionRuntime {...props} />
            </GameSessionLocalPlayer>
          </PresenceTransportProvider>
        </WorldServerJoinGate>
      </WorldServerSessionProvider>
    </LlmvilleGameProvider>
  );
}

function WorldServerJoinGate({ children }: { children: ReactNode }) {
  const { status, failureReason, retry } = useWorldServer();
  return <JoinGate status={status} failureReason={failureReason} retry={retry}
    renderJoining={() => <RouteLoadingScreen label="Joining world" detail="Connecting to the datacenter…" />}
    renderFailure={(reason, onRetry) => <GameConnectionErrorScreen message={reason ?? "Could not join the world."} kind="connection" onRetry={onRetry} />}
  >{children}</JoinGate>;
}

function GameSessionLocalPlayer({ children }: { children: ReactNode }) {
  useLocalPlayerSpawn();
  return <>{children}</>;
}

function GameSessionRuntime({ user, convexUser, gameId }: RuntimeProps) {
  useProfiledRender(PROFILE_SECTION.reactGameSession);
  const navigate = useNavigate();
  const isTouch = useIsTouchDevice();
  const { keybinds } = useAppSettings();
  const { nav: tabletNav, containerRef } = useTabletNav({ gameId });
  const world = useWorldState({
    user,
    convexUser,
    gameId,
    touchControlsEnabled: isTouch,
    onExitToMenu: () => {
      void navigate({ to: "/" });
    },
  });
  const isStorageOpenOnTablet = tabletNav.tabletOpen && tabletNav.activeTabletApp === "storage";
  const build = useBuildSession({
    world,
    isStorageOpenOnTablet,
    onToggleTablet: tabletNav.toggleTablet,
  });
  const rackHardware = useRackHardwareSession({
    canEditGame: world.canEditGame,
    gameId: world.game?._id ?? null,
  });
  const tutorial = useTutorialState({ world, isTouch });

  useSceneObjectSync(world.worldRacks, world.worldPlacedBuildItems);
  useLocalPlayerPositionSync(world.engine);
  useInteractionPromptSync(world.engine);

  useGameSessionBindings({
    world,
    build,
    tabletNav,
    containerRef,
    keybinds,
    isTouch,
  });

  if (world.connectionError !== null) {
    return <GameConnectionErrorScreen message={world.connectionError} kind="connection" />;
  }
  if (!isReadyWorldViewModel(world)) {
    return (
      <RouteLoadingScreen
        label="Loading world"
        detail={world.worldBootLabel}
        progress={world.worldBootProgress}
      />
    );
  }
  return (
    <GameSessionFrame
      world={world}
      build={build}
      rackHardware={rackHardware}
      tutorial={tutorial}
      tabletNav={tabletNav}
      containerRef={containerRef}
      keybinds={keybinds}
    />
  );
}

interface GameSessionFrameProps {
  world: ReadyWorldViewModel;
  build: BuildViewModel;
  rackHardware: RackHardwareViewModel;
  tutorial: TutorialViewModel;
  tabletNav: TabletNavState;
  containerRef: RefObject<HTMLDivElement | null>;
  keybinds: AppKeybinds;
}

function GameSessionFrame({
  world,
  build,
  rackHardware,
  tutorial,
  tabletNav,
  containerRef,
  keybinds,
}: GameSessionFrameProps) {
  const [sceneReady, setSceneReady] = useState(false);
  const {
    tabletOpen,
    rackMenuOverlayRackId,
  } = tabletNav;
  const playerPosition = usePlayerPosition(world.engine);

  // One entry point for all movement: device + key input, world tap/long-press
  // interaction, walk speed, and the player-step handler. Interaction lives on
  // the world surface (TouchLookController), not an on-screen button.
  const movement = useMovement({ world, keybinds });
  const rackSlotWorkloadMap = useMemo(
    () =>
      buildRackSlotGpuWorkloadMap({
        racks: world.racks,
        computeAssignments: world.computeAssignments,
        isTraining: world.isTraining,
      }),
    [world.computeAssignments, world.racks, world.isTraining],
  );

  const menuOpen =
    isTabletUiBlockingGameplay(tabletOpen, world.isPointerLocked, movement.isTouch)
    || rackMenuOverlayRackId !== null;
  useEffect(() => {
    world.engine.dispatch(engineActions.setPlaying(!menuOpen, Date.now()));
  }, [menuOpen, world.engine]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden bg-slate-950"
      onMouseDown={movement.onSessionMouseDown}
    >
      {!sceneReady ? (
        <RouteLoadingScreen label="Loading world" detail="Starting 3D scene…" overlay />
      ) : null}
      <RackHardwareDragVisualProvider>
        <TabletNavProvider value={tabletNav}>
          <GameScene
            activeSlot={world.activeSlot}
            gameId={world.routeGameId}
            engine={world.engine}
            {...movement.sceneBindings}
            racks={world.racks}
            rackSlotWorkloadMap={rackSlotWorkloadMap}
            placedBuildItems={world.placedBuildItems}
            worldRacks={world.worldRacks}
            worldPlacedBuildItems={world.worldPlacedBuildItems}
            claims={world.claims ?? []}
            placementCellPolicy={world.placementCellPolicy}
            playerPosition={playerPosition}
            buildPlacementModeActive={build.buildPlacementModeActive}
            placementDraftItemId={build.placementDraftItemId}
            placementDraftDirection={build.placementDraftDirection}
            placementPreview={build.placementPreview}
            tutorialRack={world.racks[0] ?? null}
            showTutorialRackArrow={
              tutorial.tutorialStarted
              && !tutorial.tutorialCompleted
              && tutorial.tutorialStage === "install_gpus"
              && (world.isPointerLocked || movement.isTouch)
            }
            onPlacementPreviewChange={build.onPlacementPreviewChange}
            onSceneReady={() => setSceneReady(true)}
            worldPresences={world.worldPresences}
            playerId={world.playerId}
            presenceSyncEnabled={world.canViewGame}
            presenceActions={world.presenceActions}
            interactionHint={world.interactionHint}
            interactionTarget={world.interactionTarget}
            interactionPrompt={world.interactionPrompt}
            powerDrawKw={world.siteHealth.powerDrawKw}
            powerCapacityKw={world.siteHealth.powerCapacityKw}
          />
          <GameOverlay world={world} build={build} rackHardware={rackHardware} tutorial={tutorial} movement={movement} />
          <BankruptOverlay />
        </TabletNavProvider>
      </RackHardwareDragVisualProvider>
    </div>
  );
}

interface UseGameSessionBindingsParams {
  world: WorldViewModel;
  build: BuildViewModel;
  tabletNav: TabletNavState;
  containerRef: RefObject<HTMLDivElement | null>;
  keybinds: AppKeybinds;
  isTouch: boolean;
}

function useGameSessionBindings({
  world,
  build,
  tabletNav,
  containerRef,
  keybinds,
  isTouch,
}: UseGameSessionBindingsParams) {
  const {
    tabletOpen,
    activeTabletApp,
    rackMenuOverlayRackId,
    openMenu,
    closeMenu,
    toggleTablet,
  } = tabletNav;
  const isStorageOpenOnTablet = tabletOpen && activeTabletApp === "storage";

  useRackConfigureCommand(openMenu);

  useGameEngineInput({
    engine: world.engine,
    buildItemCount: build.buildItemCount,
    onBuildPrimaryAction: build.onBuildPrimaryAction,
    onBuildTrashAction: build.onBuildTrashAction,
    onConfirmPlacement: build.onConfirmPlacement,
    isMenuOpen:
      isTabletUiBlockingGameplay(tabletOpen, world.isPointerLocked, isTouch)
      || rackMenuOverlayRackId !== null,
    isStorageOpenOnTablet,
    keybinds,
    onToggleTablet: toggleTablet,
  });

  useEffect(() => {
    if (rackMenuOverlayRackId === null) return;
    if (world.racks.some((rack) => rack.id === rackMenuOverlayRackId)) return;
    closeMenu();
  }, [closeMenu, rackMenuOverlayRackId, world.racks]);

  useEffect(() => {
    if (!build.buildPlacementModeActive) return;
    closeMenu();
  }, [build.buildPlacementModeActive, closeMenu]);

  useEffect(() => {
    if (!world.isPointerLocked) return;
    const canvas = containerRef.current?.querySelector<HTMLCanvasElement>("canvas");
    canvas?.focus({ preventScroll: true });
  }, [containerRef, world.isPointerLocked]);
}
