import {
  command,
  keybind,
  positionedPromptsEqual,
  proximityPrompt,
  resolveActivePrompt,
  type PositionedPrompt,
  type PromptCommand,
  type ProximityPrompt,
} from "@jgengine/core/interaction/proximityPrompt";
import type { CommandDecodeResult } from "@jgengine/core/commands/commandRegistry";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { INTERACTION_DESK_RADIUS } from "@llmville/game/world/bounds";
import type { CorePlacedBuildItem } from "@llmville/game/build/build";
import { isBuildItemId, isInfrastructureBuildItem } from "@llmville/game/build/catalog";
import type { TutorialNode } from "@llmville/game/tutorial/tutorialMachine";
import type { PlayerPosition } from "@llmville/game/movement/playerMovement";

export type { PlayerPosition };

export const INTERACTION_TARGET_TYPE = {
  rack: "rack",
  placedItem: "placed_item",
} as const;

export type InteractionTargetType = (typeof INTERACTION_TARGET_TYPE)[keyof typeof INTERACTION_TARGET_TYPE];

export interface InteractionTarget {
  type: InteractionTargetType;
  id: string;
  itemId: string;
}

export interface ZonePoint {
  x: number;
  z: number;
}

export interface CoreRackState<TRackType extends string = string> {
  id: string;
  rackType: TRackType;
  x: number;
  z: number;
  rotationY: number;
}

export interface InteractionHint {
  key: string;
  action: string;
}

export interface InteractionSnapshot {
  playerPosition: { x: number; z: number };
  tutorialNode: TutorialNode;
  tutorialStarted: boolean;
  tutorialCompleted: boolean;
  tutorialBenchPlaced: boolean;
  tutorialGpusInstalled: number;
  tutorialUsers: number;
  pointerLocked: boolean;
  touchControlsEnabled: boolean;
  placementDraftActive: boolean;
  hasLab: boolean;
  benchPosition: { x: number; z: number } | null;
  isTraining: boolean;
  racks: readonly CoreRackState[];
  placedBuildItems: readonly CorePlacedBuildItem[];
}

export interface InteractionProximity {
  nearDeskRig: boolean;
  target: InteractionTarget | null;
  activePrompt: GamePositionedPrompt | null;
}

export const INTERACTION_COMMAND = {
  rackConfigure: "rack.configure",
} as const;

export interface RackConfigureInput {
  rackId: string;
}

export function decodeRackConfigureInput(input: unknown): CommandDecodeResult<RackConfigureInput> {
  if (typeof input !== "object" || input === null) return { ok: false, reason: "Expected an object" };
  const rackId = (input as { rackId?: unknown }).rackId;
  if (typeof rackId !== "string" || rackId.length === 0) {
    return { ok: false, reason: "Expected a non-empty rackId" };
  }
  return { ok: true, value: { rackId } };
}

export const INTERACTION_GAUGE = {
  power: "power",
} as const;

export interface GamePositionedPrompt extends PositionedPrompt {
  target: InteractionTarget;
}

export const INTERACTION_PROMPT_PRIORITY = {
  placedItem: 1,
  rack: 0,
} as const;

export type ScenePromptResolver = (instanceId: string) => ProximityPrompt | null;

export function buildSceneObjectPrompts(
  objects: readonly SceneObject[],
  resolvePrompt: ScenePromptResolver,
): GamePositionedPrompt[] {
  const prompts: GamePositionedPrompt[] = [];
  for (const object of objects) {
    const catalogPrompt = resolvePrompt(object.instanceId);
    if (catalogPrompt === null) continue;
    const isRack = isBuildItemId(object.catalogId) && isInfrastructureBuildItem(object.catalogId);
    prompts.push({
      id: object.instanceId,
      position: { x: object.position[0], z: object.position[2] },
      priority: isRack ? INTERACTION_PROMPT_PRIORITY.rack : INTERACTION_PROMPT_PRIORITY.placedItem,
      prompt: proximityPrompt({
        radius: catalogPrompt.radius,
        display: catalogPrompt.display,
        invoke: isRack
          ? command(INTERACTION_COMMAND.rackConfigure, { rackId: object.instanceId } satisfies RackConfigureInput)
          : null,
      }),
      target: {
        type: isRack ? INTERACTION_TARGET_TYPE.rack : INTERACTION_TARGET_TYPE.placedItem,
        id: object.instanceId,
        itemId: object.catalogId,
      },
    });
  }
  return prompts;
}

function zonePromptActive(
  position: { x: number; z: number },
  point: { x: number; z: number } | null,
  radius: number,
  actionId: string,
): boolean {
  if (point === null) return false;
  const prompt: PositionedPrompt = {
    id: "zone",
    position: point,
    prompt: proximityPrompt({ radius, display: keybind(actionId) }),
  };
  return resolveActivePrompt(position, [prompt]) !== null;
}

export function resolveInteractionProximity(
  position: { x: number; z: number },
  benchPosition: { x: number; z: number } | null,
  activePrompt: GamePositionedPrompt | null,
): InteractionProximity {
  const nearDeskRig = zonePromptActive(position, benchPosition, INTERACTION_DESK_RADIUS, "toggleTablet");

  return {
    nearDeskRig,
    target: activePrompt?.target ?? null,
    activePrompt,
  };
}

export function gamePositionedPromptsEqual(
  a: GamePositionedPrompt | null,
  b: GamePositionedPrompt | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return positionedPromptsEqual(a, b) && interactionTargetsEqual(a.target, b.target);
}

export type { PositionedPrompt, PromptCommand };

export function interactionTargetsEqual(
  a: InteractionTarget | null,
  b: InteractionTarget | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.type === b.type && a.id === b.id && a.itemId === b.itemId;
}

export function interactionHintsEqual(
  a: InteractionHint | null,
  b: InteractionHint | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.key === b.key && a.action === b.action;
}

export type InteractionHintResolver = (
  snapshot: InteractionSnapshot,
  proximity: InteractionProximity,
) => InteractionHint | null;

