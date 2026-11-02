import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { suspendPlayControls } from "@jgengine/core/game/controlGate";
import { useDisplayProfile } from "@jgengine/core/ui/display.view";
import { useGameContext } from "@jgengine/react/provider";
import { useBuildSession } from "@/build/buildSession";
import { BankruptOverlay } from "@/economy/components/BankruptOverlay";
import { buildRackSlotGpuWorkloadMap } from "@/infrastructure/computeUnits";
import { useRackHardwareSession } from "@/infrastructure/rackHardwareSession";
import { RouteLoadingScreen } from "@/components/RouteLoadingScreen";
import GameOverlay from "@/runtime/components/GameOverlay";
import { GameConnectionErrorScreen } from "@/runtime/components/GameConnectionErrorScreen";
import { engineActions } from "@/runtime/gameEngine";
import { useGameEngineInput } from "@/runtime/input";
import { useInteractionPromptSync } from "@/runtime/interactionPrompts";
import { useLlmvilleSession } from "@/runtime/llmvilleSession";
import { spawnLocalPlayer, useLocalPlayerWalkSpeed } from "@/runtime/localPlayerEntity";
import { readPlayerPosition, usePlayerPosition } from "@/runtime/playerPosition";
import { useRackConfigureCommand } from "@/runtime/promptCommands";
import { useSceneObjectSync } from "@/runtime/sceneObjects";
import { useWorldState } from "@/runtime/worldState";
import { isReadyWorldViewModel } from "@/runtime/worldViewModel";
import { ReducedMotionSync } from "@/settings/components/LlmvilleSettings";
import { useAppSettings } from "@/settings/settings";
import { isTabletUiBlockingGameplay } from "@/tablet/tablet";
import { useTutorialState } from "@/tutorial/tutorialRuntime";
import { localGameState } from "@/user/localGameState";

/** The shell's `GameUI`: LLMville's world state, its HUD and tablet, and the scene props the canvas draws. */
export function LlmvilleGameUI() {
  const ctx = useGameContext();
  const session = useLlmvilleSession();
  const { tabletNav, containerRef, gameId } = session;
  const navigate = useNavigate();
  const isTouch = useDisplayProfile().coarsePointer;
  const { keybinds } = useAppSettings();
  const world = useWorldState({
    user: session.user,
    convexUser: session.convexUser,
    gameId,
    touchControlsEnabled: isTouch,
    onExitToMenu: () => {
      void navigate({ to: "/" });
    },
  });
  const isStorageOpenOnTablet = tabletNav.tabletOpen && tabletNav.activeTabletApp === "storage";
  const build = useBuildSession({ world, isStorageOpenOnTablet, onToggleTablet: tabletNav.toggleTablet });
  const rackHardware = useRackHardwareSession({ canEditGame: world.canEditGame, gameId: world.game?._id ?? null });
  const tutorial = useTutorialState({ world, isTouch });
  const playerPosition = usePlayerPosition(world.engine);
  const menuOpen =
    isTabletUiBlockingGameplay(tabletNav.tabletOpen, world.isPointerLocked, isTouch)
    || tabletNav.rackMenuOverlayRackId !== null;

  const enteredWorld = world.isWorldReady;
  useEffect(() => {
    if (!enteredWorld) return;
    spawnLocalPlayer(ctx, readPlayerPosition(world.engine), localGameState().readCameraLook(0, gameId));
    return () => {
      ctx.scene.entity.despawn(ctx.player.userId);
    };
  }, [ctx, enteredWorld, gameId, world.engine]);
  useLocalPlayerWalkSpeed(world.playerProfile?.walkSpeedLevel ?? 1);
  useSceneObjectSync(world.worldRacks, world.worldPlacedBuildItems);
  useInteractionPromptSync(world.engine);
  useRackConfigureCommand(tabletNav.openMenu);
  useGameEngineInput({
    engine: world.engine,
    buildItemCount: build.buildItemCount,
    onBuildPrimaryAction: build.onBuildPrimaryAction,
    onBuildTrashAction: build.onBuildTrashAction,
    onConfirmPlacement: build.onConfirmPlacement,
    isMenuOpen: menuOpen,
    isStorageOpenOnTablet,
    keybinds,
    onToggleTablet: tabletNav.toggleTablet,
  });

  useEffect(() => {
    world.engine.dispatch(engineActions.setPlaying(!menuOpen, Date.now()));
    return menuOpen ? suspendPlayControls(ctx) : undefined;
  }, [ctx, menuOpen, world.engine]);

  useEffect(() => {
    const onPointerLockChange = () => {
      world.engine.dispatch(engineActions.setPointerLock(document.pointerLockElement !== null));
    };
    document.addEventListener("pointerlockchange", onPointerLockChange);
    return () => document.removeEventListener("pointerlockchange", onPointerLockChange);
  }, [world.engine]);

  useEffect(() => {
    const { rackMenuOverlayRackId, closeMenu } = tabletNav;
    if (rackMenuOverlayRackId === null) return;
    if (world.racks.some((rack) => rack.id === rackMenuOverlayRackId)) return;
    closeMenu();
  }, [tabletNav, world.racks]);

  useEffect(() => {
    if (build.buildPlacementModeActive) tabletNav.closeMenu();
  }, [build.buildPlacementModeActive, tabletNav]);

  useEffect(() => {
    if (!world.isPointerLocked) return;
    containerRef.current?.querySelector<HTMLCanvasElement>("canvas")?.focus({ preventScroll: true });
  }, [containerRef, world.isPointerLocked]);

  const rackSlotWorkloadMap = useMemo(
    () =>
      buildRackSlotGpuWorkloadMap({
        racks: world.racks,
        computeAssignments: world.computeAssignments,
        isTraining: world.isTraining,
      }),
    [world.computeAssignments, world.racks, world.isTraining],
  );

  const ready = isReadyWorldViewModel(world);
  const sceneProps = useMemo(
    () =>
      ready
        ? {
          gameId: world.routeGameId,
          engine: world.engine,
          racks: world.racks,
          rackSlotWorkloadMap,
          placedBuildItems: world.placedBuildItems,
          worldRacks: world.worldRacks,
          worldPlacedBuildItems: world.worldPlacedBuildItems,
          claims: world.claims ?? [],
          placementCellPolicy: world.placementCellPolicy,
          playerId: world.playerId,
          playerPosition,
          buildPlacementModeActive: build.buildPlacementModeActive,
          placementDraftItemId: build.placementDraftItemId,
          placementDraftDirection: build.placementDraftDirection,
          placementPreview: build.placementPreview,
          interactionHint: world.interactionHint,
          interactionTarget: world.interactionTarget,
          interactionPrompt: world.interactionPrompt,
          tutorialRack: world.racks[0] ?? null,
          showTutorialRackArrow:
            tutorial.tutorialStarted
            && !tutorial.tutorialCompleted
            && tutorial.tutorialStage === "install_gpus"
            && (world.isPointerLocked || isTouch),
          powerDrawKw: world.siteHealth.powerDrawKw,
          powerCapacityKw: world.siteHealth.powerCapacityKw,
          onPlacementPreviewChange: build.onPlacementPreviewChange,
        }
        : null,
    [ready, world, rackSlotWorkloadMap, playerPosition, build, tutorial, isTouch],
  );
  useEffect(() => session.scene.publish(sceneProps), [session.scene, sceneProps]);
  useEffect(() => () => session.scene.publish(null), [session.scene]);

  if (world.connectionError !== null) {
    return <GameConnectionErrorScreen message={world.connectionError} kind="connection" />;
  }
  if (!isReadyWorldViewModel(world)) {
    return <RouteLoadingScreen label="Loading world" detail={world.worldBootLabel} progress={world.worldBootProgress} />;
  }
  return (
    <>
      <ReducedMotionSync />
      <GameOverlay world={world} build={build} rackHardware={rackHardware} tutorial={tutorial} isTouch={isTouch} />
      <BankruptOverlay />
    </>
  );
}
