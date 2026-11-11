/** @jsxImportSource @jgengine/core/ui/jsx */
import {
  isRackBuildPlacementItem,
  type BuildPlacementPreview,
  type PlacedBuildItem,
} from "@llmville/game/build/build";
import { BuildPlacementPreviewController } from "../../build/buildPlacementPreview";
import type { BuildDirection, BuildItemId } from "@llmville/game/build/catalog";
import {
  type GamePositionedPrompt,
  type InteractionHint,
  type InteractionTarget,
} from "@llmville/game/simulation/interaction";
import { useEffect, useMemo } from "@jgengine/core/ui/jsx";

import type { DatacenterClaim, PlacementCellPolicy } from "@llmville/game/datacenter/claims";
import type { GameEngine } from "../../runtime/gameEngine";
import type { PlacedRack } from "../../infrastructure/infrastructure";
import type { GpuSlotWorkload } from "../../infrastructure/computeUnits";

import BuildProp from "./BuildProp";
import { ClaimedCellOverlay, EndlessDatacenter } from "../../world/components/EndlessDatacenter";
import Rack from "../../infrastructure/components/Rack";
import { SceneAxesHelper, useShowSceneAxes } from "./SceneAxesHelper";
import { useWorldSceneFeed, useWorldSceneProps } from "../../runtime/llmvilleSession";
import { useWorldProjection } from "@jgengine/shell/world/WorldEntityFrames";
import { useLocalPlayerBridge } from "../../runtime/localPlayerEntity";

/** What the scene draws, published by the HUD each time the world view model changes. */
export interface WorldSceneProps {
  gameId: string;
  engine: GameEngine;
  racks: readonly PlacedRack[];
  rackSlotWorkloadMap: ReadonlyMap<string, GpuSlotWorkload>;
  placedBuildItems: readonly PlacedBuildItem[];
  /** Every player's racks in world coordinates (includes the local player's). */
  worldRacks: readonly PlacedRack[];
  worldPlacedBuildItems: readonly PlacedBuildItem[];
  claims: readonly DatacenterClaim[];
  placementCellPolicy: PlacementCellPolicy;
  playerId: string;
  playerPosition: { x: number; z: number };
  buildPlacementModeActive: boolean;
  placementDraftItemId: BuildItemId | null;
  placementDraftDirection: BuildDirection;
  placementPreview: BuildPlacementPreview | null;
  interactionHint?: InteractionHint | null | undefined;
  interactionTarget?: InteractionTarget | null | undefined;
  interactionPrompt?: GamePositionedPrompt | null | undefined;
  tutorialRack: PlacedRack | null;
  showTutorialRackArrow: boolean;
  powerDrawKw: number;
  powerCapacityKw: number;
  onPlacementPreviewChange: (preview: BuildPlacementPreview | null) => void;
}

/** The shell's world environment: the endless datacenter floor, columns and ceiling around the player. */
export function LlmvilleDatacenter() {
  const props = useWorldSceneProps();
  return props === null ? null : <EndlessDatacenter engine={props.engine} />;
}

/** Hands the live camera projection to the HUD, whose prompt markers anchor to world points. */
function ShareWorldProjection() {
  const feed = useWorldSceneFeed();
  const project = useWorldProjection();
  useEffect(() => {
    feed.projection.current = (position) => {
      const point = project(position);
      return point === null ? null : { x: point.x, y: point.y, behind: point.behind === true };
    };
    return () => { feed.projection.current = null; };
  }, [feed, project]);
  return null;
}

/** The shell's world overlay: LLMville's datacenter, racks, avatars and build preview inside the shell canvas. */
export function LlmvilleWorld() {
  const props = useWorldSceneProps();
  useLocalPlayerBridge(props?.engine ?? null);
  if (props === null) return null;
  return (
    <>
      <ShareWorldProjection />
      <GameWorldContent
        engine={props.engine}
        gameId={props.gameId}
        racks={props.racks}
        rackSlotWorkloadMap={props.rackSlotWorkloadMap}
        placedBuildItems={props.placedBuildItems}
        worldRacks={props.worldRacks}
        worldPlacedBuildItems={props.worldPlacedBuildItems}
        claims={props.claims}
        playerPosition={props.playerPosition}
        buildPlacementModeActive={props.buildPlacementModeActive}
        placementDraftItemId={props.placementDraftItemId}
        placementDraftDirection={props.placementDraftDirection}
        placementPreview={props.placementPreview}
        tutorialRack={props.tutorialRack}
        showTutorialRackArrow={props.showTutorialRackArrow}
      />
      <BuildPlacementPreviewController
        enabled={props.placementDraftItemId !== null}
        placementDraftItemId={props.placementDraftItemId}
        placementDraftDirection={props.placementDraftDirection}
        racks={props.racks}
        placedBuildItems={props.placedBuildItems}
        placementCellPolicy={props.placementCellPolicy}
        onPlacementPreviewChange={props.onPlacementPreviewChange}
      />
    </>
  );
}

function GameWorldContent({
  engine,
  gameId,
  racks,
  rackSlotWorkloadMap,
  placedBuildItems,
  worldRacks,
  worldPlacedBuildItems,
  claims,
  buildPlacementModeActive,
  placementDraftItemId,
  placementDraftDirection,
  placementPreview,
  playerPosition,
  tutorialRack,
  showTutorialRackArrow,
}: {
  engine: GameEngine;
  gameId: string;
  racks: readonly PlacedRack[];
  rackSlotWorkloadMap: ReadonlyMap<string, GpuSlotWorkload>;
  placedBuildItems: readonly PlacedBuildItem[];
  worldRacks: readonly PlacedRack[];
  worldPlacedBuildItems: readonly PlacedBuildItem[];
  claims: readonly DatacenterClaim[];
  buildPlacementModeActive: boolean;
  placementDraftItemId: BuildItemId | null;
  placementDraftDirection: BuildDirection;
  placementPreview: BuildPlacementPreview | null;
  playerPosition: { x: number; z: number };
  tutorialRack: PlacedRack | null;
  showTutorialRackArrow: boolean;
}) {
  const placementDraft =
    buildPlacementModeActive && placementDraftItemId !== null
      ? { itemId: placementDraftItemId, direction: placementDraftDirection }
      : null;
  const showAxes = useShowSceneAxes();
  const ownRackIds = useMemo(() => new Set(racks.map((rack) => `${rack.id}`)), [racks]);

  return (
    <>
      {showAxes && <SceneAxesHelper position={[0, 0.5, 0]} size={2} />}


      <ClaimedCellOverlay claims={claims} localGameId={gameId} playerPosition={playerPosition} />

      {worldRacks.map((rack) => (
        <Rack
          key={rack.id}
          rackId={rack.id}
          rackType={rack.rackType}
          x={rack.x}
          z={rack.z}
          rotationY={rack.rotationY}
          installedHardwareSlots={rack.installedHardwareModuleIds}
          installedCoolerId={rack.installedCoolerId}
          slotWorkloadMap={ownRackIds.has(`${rack.id}`) ? rackSlotWorkloadMap : undefined}
        />
      ))}
      {worldPlacedBuildItems.filter(Boolean).map((item) => {
        if (
          typeof item.x !== "number"
          || typeof item.y !== "number"
          || typeof item.z !== "number"
        ) {
          return null;
        }
        return <BuildProp key={item.id} itemId={item.itemId} x={item.x} y={item.y} z={item.z} direction={item.direction} />;
      })}
      {placementDraft !== null && placementPreview !== null ? (
        isRackBuildPlacementItem(placementDraft.itemId) ? (
          <Rack rackType={placementDraft.itemId} x={placementPreview.x} z={placementPreview.z} rotationY={placementDraft.direction * (Math.PI / 2)} ghost={true} isValid={placementPreview.isValid} />
        ) : (
          <BuildProp itemId={placementDraft.itemId} x={placementPreview.x} y={placementPreview.y} z={placementPreview.z} direction={placementDraft.direction} ghost={true} isValid={placementPreview.isValid} />
        )
      ) : null}
    </>
  );
}
