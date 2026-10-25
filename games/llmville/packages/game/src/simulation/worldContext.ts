import type { CorePlacedBuildItem } from "@llmville/game/build/build";
import type { TutorialWorldSignals } from "@llmville/game/tutorial/tutorialProgress";
import { deriveTutorialWorldSignals } from "@llmville/game/tutorial/tutorialProgress";

export interface EngineWorldRack {
  id: string;
  rackType: string;
  x: number;
  z: number;
  rotationY: number;
}

export interface EngineWorldContext {
  benchPosition: { x: number; z: number } | null;
  racks: readonly EngineWorldRack[];
  placedBuildItems: readonly CorePlacedBuildItem[];
  isTraining: boolean;
  hasLab: boolean;
  tutorialSignals: TutorialWorldSignals;
  touchControlsEnabled: boolean;
}

export const defaultEngineWorldContext: EngineWorldContext = {
  benchPosition: null,
  racks: [],
  placedBuildItems: [],
  isTraining: false,
  hasLab: false,
  tutorialSignals: deriveTutorialWorldSignals({
    rackPlaced: false,
    ownedGpuCount: 0,
    installedGpuCount: 0,
    dataTokens: 0,
    models: [],
  }),
  touchControlsEnabled: false,
};

function pointsEqual(
  a: { x: number; z: number } | null,
  b: { x: number; z: number } | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.z === b.z;
}

function racksEqual(a: readonly EngineWorldRack[], b: readonly EngineWorldRack[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((rack, index) => {
    const other = b[index];
    return rack.id === other.id
      && rack.rackType === other.rackType
      && rack.x === other.x
      && rack.z === other.z
      && rack.rotationY === other.rotationY;
  });
}

function placedItemsEqual(
  a: readonly CorePlacedBuildItem[],
  b: readonly CorePlacedBuildItem[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return item.id === other.id
      && item.itemId === other.itemId
      && item.x === other.x
      && item.y === other.y
      && item.z === other.z
      && item.direction === other.direction;
  });
}

function tutorialSignalsEqual(a: TutorialWorldSignals, b: TutorialWorldSignals): boolean {
  if (a === b) return true;
  return (Object.keys(a) as (keyof TutorialWorldSignals)[]).every((key) => a[key] === b[key]);
}

export function engineWorldContextEquals(a: EngineWorldContext, b: EngineWorldContext): boolean {
  return a.isTraining === b.isTraining
    && a.hasLab === b.hasLab
    && a.touchControlsEnabled === b.touchControlsEnabled
    && pointsEqual(a.benchPosition, b.benchPosition)
    && tutorialSignalsEqual(a.tutorialSignals, b.tutorialSignals)
    && racksEqual(a.racks, b.racks)
    && placedItemsEqual(a.placedBuildItems, b.placedBuildItems);
}
