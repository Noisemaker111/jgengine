import type { DecorItemSpec, MapData } from "@llmville/game/world/mapTypes";
import { createRoom } from "@llmville/game/world/worldBuilder";
import { getMapGrid } from "@llmville/game/builder/document";
import { wallSegmentsToColliders } from "@llmville/game/world/bounds";
import type { MapGridSpec } from "@llmville/game/world/grid";
import { getWorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import { centerDecorAtOrigin } from "@llmville/game/builder/placement";

import type { BuilderPlaceableItem } from "@/dev/builder/builderPlaceableCatalog";

export type BuilderEditingScope = "room" | "isolated";

/** Open workbench floor — 50 m canvas (5× the original 10 m stage per side). */
export const BUILDER_STAGE_SIZE = 50;
const ISOLATED_STAGE_SIZE = BUILDER_STAGE_SIZE;

export function createIsolatedStageMap(size = ISOLATED_STAGE_SIZE): MapData {
  const mapData = createRoom({
    mapId: "isolated-stage",
    width: size,
    depth: size,
    wallHeight: 3.4,
    wallThickness: 0.25,
    floorMaterial: "garage-floor",
    wallMaterial: "garage-wall",
    ceilingColor: "#dbdde0",
    wallColor: "#828c87",
    floorRepeat: [size, size],
    centerX: 0,
    centerZ: 0,
  })
    .build();

  return {
    ...mapData,
    walls: [],
    decor: [],
    colliders: wallSegmentsToColliders([]),
  };
}

function catalogModelToIsolatedDecor(modelKey: string, placeableId: string, grid: MapGridSpec): DecorItemSpec {
  const asset = getWorldModelAsset(modelKey);
  const footprint = asset?.footprint ?? { width: 1, depth: 1 };
  return centerDecorAtOrigin({
    id: placeableId,
    type: "model",
    assetType: "model",
    modelKey,
    footprint,
    position: [0, 0, 0],
    castShadow: true,
    receiveShadow: true,
  }, grid);
}

function decorToIsolatedItem(template: DecorItemSpec, placeableId: string, grid: MapGridSpec): DecorItemSpec {
  const item = centerDecorAtOrigin(template, grid);
  item.id = placeableId;
  return item;
}

export function createIsolatedAssetMapFromPlaceable(
  placeable: BuilderPlaceableItem,
): { mapData: MapData; decorId: string | null } {
  const stage = createIsolatedStageMap();
  const grid = getMapGrid(stage);
  if (placeable.source.kind === "catalog") {
    const decor = catalogModelToIsolatedDecor(placeable.source.modelKey, placeable.id, grid);
    return { mapData: { ...stage, decor: [decor] }, decorId: placeable.id };
  }
  if (placeable.source.kind === "decor") {
    const decor = decorToIsolatedItem(placeable.source.template, placeable.id, grid);
    return { mapData: { ...stage, decor: [decor] }, decorId: placeable.id };
  }
  return { mapData: stage, decorId: null };
}

export function createIsolatedAssetMapFromDecor(
  decor: DecorItemSpec,
  id: string,
): { mapData: MapData; decorId: string } {
  const stage = createIsolatedStageMap();
  const grid = getMapGrid(stage);
  const item = decorToIsolatedItem(decor, id, grid);
  return { mapData: { ...stage, decor: [item] }, decorId: id };
}
