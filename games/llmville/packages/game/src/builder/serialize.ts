/**
 * Exports from a builder document: raw map JSON, selection payloads, and
 * code snippets targeting the world-builder DSL and asset catalogs.
 */
import type { DecorItemSpec, MapData, WallSegmentSpec } from "@llmville/game/world/mapTypes";

import { splitSelectionRefs, type BuilderSelectionRef } from "@llmville/game/builder/document";

/** Marker for copied-selection payloads: positions are relative to the selection bounds center. */
export const BUILDER_GROUP_ORIGIN = "selection_bounds_center";

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_/-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function exportBuilderMapJson(mapData: MapData): string {
  return JSON.stringify(mapData, null, 2);
}

export interface BuilderSelectionPayload {
  origin: typeof BUILDER_GROUP_ORIGIN;
  decor: DecorItemSpec[];
  walls: WallSegmentSpec[];
}

export function buildSelectionPayload(
  mapData: MapData,
  refs: readonly BuilderSelectionRef[],
): BuilderSelectionPayload {
  const { decorIds, wallIndexes } = splitSelectionRefs(refs);
  return {
    origin: BUILDER_GROUP_ORIGIN,
    decor: mapData.decor.filter((item): item is DecorItemSpec => item.id !== undefined && decorIds.has(item.id)),
    walls: mapData.walls.filter((_, index) => wallIndexes.has(index)),
  };
}

/** Catalog entry snippet for promoting a built group to a world-model asset. */
export function buildCatalogSnippet(group: DecorItemSpec, label: string, prompt: string): string {
  const footprint = group.footprint ?? { width: 1, depth: 1 };
  const slug = group.id ?? "custom_asset";
  return `${slug}: createAsset(
  ${JSON.stringify(label)},
  "dev/${slug.replaceAll("_", "-")}",
  ${JSON.stringify(prompt)},
  {
    category: WORLD_MODEL_CATEGORY.decor,
    footprint: ${JSON.stringify(footprint)},
    frame: {
      anchor: "floor-center",
      fitFootprint: true,
    },
  },
),`;
}

function decorToWorldBuilderLine(item: DecorItemSpec): string {
  if (item.type === "model") {
    return `.placeProp(${JSON.stringify({
      ...(item.id !== undefined ? { id: item.id } : {}),
      modelKey: item.modelKey ?? item.modelId ?? "model_key",
      gridX: item.gridX ?? 0,
      gridZ: item.gridZ ?? 0,
      ...(item.facing !== undefined ? { facing: item.facing } : {}),
      ...(item.footprint !== undefined ? { footprint: item.footprint } : {}),
      ...(item.scale !== undefined ? { scale: item.scale } : {}),
    })})`;
  }
  return `.placeObject(${JSON.stringify(item)})`;
}

/** Re-author the current document as a `createRoom(...)` DSL module. */
export function buildWorldBuilderSnippet(mapData: MapData): string {
  const { environment } = mapData;
  const roomOptions = {
    mapId: mapData.mapId,
    width: environment.floor.width,
    depth: environment.floor.depth,
    wallHeight: environment.wallHeight,
    wallThickness: environment.wallThickness,
    floorMaterial: environment.floorMaterial,
    wallMaterial: environment.wallMaterial,
    ceilingColor: environment.ceilingColor,
    wallColor: environment.wallColor,
    centerX: environment.floor.centerX,
    centerZ: environment.floor.centerZ,
  };
  const wallLines = mapData.walls.map((wall) => `.placeWall(${JSON.stringify(wall)})`);
  const decorLines = mapData.decor.map(decorToWorldBuilderLine);
  return `import { createRoom } from "@llmville/game/world/worldBuilder";

export function buildAuthoredPlace() {
  return createRoom(${JSON.stringify(roomOptions, null, 2)})
    ${[...wallLines, ...decorLines].join("\n    ")}
    .setFrontDoor(${JSON.stringify(mapData.frontDoorPosition)})
    .setDropoff(${JSON.stringify(mapData.dropoffPosition)})
    .build();
}`;
}
