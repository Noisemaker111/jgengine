import { WORLD_FOG_NEAR, WORLD_FOG_FAR, WORLD_CAMERA_FAR, WORLD_FOG_COLOR } from "@llmville/game/world/viewDistance";
import {
  isRackBuildPlacementItem,
  type BuildPlacementPreview,
  type PlacedBuildItem,
} from "@llmville/game/build/build";
import { BuildPlacementPreviewController } from "@/build/buildPlacementPreview";
import type { BuildDirection, BuildItemId } from "@llmville/game/build/catalog";
import {
  INTERACTION_GAUGE,
  type GamePositionedPrompt,
  type InteractionHint,
  type InteractionTarget,
} from "@llmville/game/simulation/interaction";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { ACESFilmicToneMapping, PCFSoftShadowMap } from "three";

import type { DatacenterClaim, PlacementCellPolicy } from "@llmville/game/datacenter/claims";
import { PlayerMovementController } from "@/movement/PlayerMovementController";
import type { MovementKeysState } from "@jgengine/core/movement/movementModel";
import type { GameEngine } from "@/runtime/gameEngine";
import type { PlacedRack } from "@/infrastructure/infrastructure";
import type { GpuSlotWorkload } from "@/infrastructure/computeUnits";

import BuildProp from "@/scene/components/BuildProp";
import { ProximityPromptMarker, type GaugeReading } from "@/scene/components/ProximityPromptMarker";
import { ClaimedCellOverlay, EndlessDatacenter } from "@/world/components/EndlessDatacenter";
import { DatacenterLighting } from "@/scene/components/DatacenterLighting";
import Rack from "@/infrastructure/components/Rack";
import { InterpolatedWorldAgentAvatar } from "@/agent/components/WorldAgentAvatar";
import { PresenceSyncController } from "@/movement/PresenceSyncController";
import type { PresenceActions } from "@/multiplayer/presenceTransport";
import { SceneAxesHelper, useShowSceneAxes } from "@/scene/components/SceneAxesHelper";
import { PlayLook } from "@/movement/components/PlayLook";
import { TutorialRackArrow } from "@/tutorial/components/TutorialUi";
import { PerformanceDiagnosticSampler } from "@/runtime/components/PerformanceDiagnosticSampler";

interface WorldPresenceState {
  presenceId: string;
  kind: "human" | "bot";
  label: string | null;
  position: { x: number; y: number; z: number };
  rotationY: number;
  rotationPitch?: number;
  online?: boolean;
}

interface GameSceneProps {
  activeSlot: number;
  gameId: string;
  engine: GameEngine;
  movementKeys: MovementKeysState;
  playerSpeed: number;
  canMove: boolean;
  playInputTouch: boolean;
  onStepPlayer: (deltaX: number, deltaZ: number) => void;
  /** Touch only: tap the world to interact. */
  onTouchInteract?: () => void;
  racks: readonly PlacedRack[];
  rackSlotWorkloadMap: ReadonlyMap<string, GpuSlotWorkload>;
  placedBuildItems: readonly PlacedBuildItem[];
  /** Every player's racks in world coordinates (includes the local player's). */
  worldRacks: readonly PlacedRack[];
  worldPlacedBuildItems: readonly PlacedBuildItem[];
  claims: readonly DatacenterClaim[];
  placementCellPolicy: PlacementCellPolicy;
  worldPresences: readonly WorldPresenceState[];
  playerId: string;
  playerPosition: { x: number; z: number };
  buildPlacementModeActive: boolean;
  presenceSyncEnabled: boolean;
  presenceActions: PresenceActions;
  placementDraftItemId: BuildItemId | null;
  placementDraftDirection: BuildDirection;
  placementPreview: BuildPlacementPreview | null;
  interactionHint?: InteractionHint | null;
  interactionTarget?: InteractionTarget | null;
  interactionPrompt?: GamePositionedPrompt | null;
  tutorialRack: PlacedRack | null;
  showTutorialRackArrow: boolean;
  powerDrawKw: number;
  powerCapacityKw: number;
  onPlacementPreviewChange: (preview: BuildPlacementPreview | null) => void;
  onSceneReady?: () => void;
}

const SCENE_MOOD = { background: WORLD_FOG_COLOR, fog: WORLD_FOG_COLOR, fogNear: WORLD_FOG_NEAR, fogFar: WORLD_FOG_FAR };

export default function GameScene(props: GameSceneProps) {
  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 1.7, 0], fov: 75, near: 0.1, far: WORLD_CAMERA_FAR }}
        shadows="soft"
        gl={{ antialias: true, stencil: false, depth: true }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = PCFSoftShadowMap;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.25;
          (gl.domElement as HTMLCanvasElement).tabIndex = -1;
          requestAnimationFrame(() => {
            props.onSceneReady?.();
          });
        }}
      >
        <color attach="background" args={[SCENE_MOOD.background]} />
        <fog attach="fog" args={[SCENE_MOOD.fog, SCENE_MOOD.fogNear, SCENE_MOOD.fogFar]} />
        <DatacenterLighting engine={props.engine} />

        <GameWorldContent
          engine={props.engine}
          gameId={props.gameId}
          racks={props.racks}
          rackSlotWorkloadMap={props.rackSlotWorkloadMap}
          placedBuildItems={props.placedBuildItems}
          worldRacks={props.worldRacks}
          worldPlacedBuildItems={props.worldPlacedBuildItems}
          claims={props.claims}
          worldPresences={props.worldPresences}
          playerPosition={props.playerPosition}
          buildPlacementModeActive={props.buildPlacementModeActive}
          placementDraftItemId={props.placementDraftItemId}
          placementDraftDirection={props.placementDraftDirection}
          placementPreview={props.placementPreview}
          tutorialRack={props.tutorialRack}
          showTutorialRackArrow={props.showTutorialRackArrow}
          powerDrawKw={props.powerDrawKw}
          powerCapacityKw={props.powerCapacityKw}
          interactionHint={props.interactionHint}
          interactionTarget={props.interactionTarget}
          interactionPrompt={props.interactionPrompt}
        />

        <PlayLook
          touchMode={props.playInputTouch}
          onTouchTap={props.onTouchInteract}
        />
        <PlayerMovementController activeSlot={props.activeSlot} gameId={props.gameId} engine={props.engine} movementKeys={props.movementKeys} playerSpeed={props.playerSpeed} canMove={props.canMove} onStepPlayer={props.onStepPlayer} />
        <PresenceSyncController
          engine={props.engine}
          playerId={props.playerId}
          enabled={props.presenceSyncEnabled}
          presenceActions={props.presenceActions}
        />
        <PerformanceDiagnosticSampler />
        <BuildPlacementPreviewController
          enabled={props.placementDraftItemId !== null}
          placementDraftItemId={props.placementDraftItemId}
          placementDraftDirection={props.placementDraftDirection}
          racks={props.racks}
          placedBuildItems={props.placedBuildItems}
          placementCellPolicy={props.placementCellPolicy}
          onPlacementPreviewChange={props.onPlacementPreviewChange}
        />
      </Canvas>
    </div>
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
  worldPresences,
  buildPlacementModeActive,
  placementDraftItemId,
  placementDraftDirection,
  placementPreview,
  playerPosition,
  tutorialRack,
  showTutorialRackArrow,
  powerDrawKw,
  powerCapacityKw,
  interactionHint,
  interactionTarget,
  interactionPrompt,
}: {
  engine: GameEngine;
  gameId: string;
  racks: readonly PlacedRack[];
  rackSlotWorkloadMap: ReadonlyMap<string, GpuSlotWorkload>;
  placedBuildItems: readonly PlacedBuildItem[];
  worldRacks: readonly PlacedRack[];
  worldPlacedBuildItems: readonly PlacedBuildItem[];
  claims: readonly DatacenterClaim[];
  worldPresences: readonly WorldPresenceState[];
  buildPlacementModeActive: boolean;
  placementDraftItemId: BuildItemId | null;
  placementDraftDirection: BuildDirection;
  placementPreview: BuildPlacementPreview | null;
  playerPosition: { x: number; z: number };
  tutorialRack: PlacedRack | null;
  showTutorialRackArrow: boolean;
  powerDrawKw: number;
  powerCapacityKw: number;
  interactionHint?: InteractionHint | null;
  interactionTarget?: InteractionTarget | null;
  interactionPrompt?: GamePositionedPrompt | null;
}) {
  const placementDraft =
    buildPlacementModeActive && placementDraftItemId !== null
      ? { itemId: placementDraftItemId, direction: placementDraftDirection }
      : null;
  const showAxes = useShowSceneAxes();
  const ownRackIds = useMemo(() => new Set(racks.map((rack) => `${rack.id}`)), [racks]);
  const gaugeValues = useMemo<Record<string, GaugeReading>>(
    () => ({ [INTERACTION_GAUGE.power]: { value: powerDrawKw, max: powerCapacityKw, unit: "kW" } }),
    [powerDrawKw, powerCapacityKw],
  );

  return (
    <>
      {showAxes && <SceneAxesHelper position={[0, 0.5, 0]} size={2} />}
      <TutorialRackArrow rack={tutorialRack} show={showTutorialRackArrow} />

      {(interactionHint || interactionPrompt) && (
        <ProximityPromptMarker
          hint={interactionHint ?? null}
          target={interactionTarget}
          promptDisplay={interactionPrompt?.prompt.display ?? null}
          gaugeValues={gaugeValues}
          racks={racks}
          placedBuildItems={placedBuildItems}
        />
      )}

      <EndlessDatacenter engine={engine} />
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
      {worldPresences.map((presence) => (
        <InterpolatedWorldAgentAvatar
          key={presence.presenceId}
          presenceId={presence.presenceId}
          label={presence.label}
          kind={presence.kind}
          online={presence.online !== false}
        />
      ))}
    </>
  );
}
