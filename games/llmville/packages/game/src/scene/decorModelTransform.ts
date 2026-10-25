import type { AssetTransformInput } from "@llmville/game/scene/assetBounds";
import type { GridFootprint } from "@llmville/game/world/grid";
import { getDecorRotation, getDecorWorldPosition } from "@llmville/game/world/mapDecor";
import type { DecorItemSpec } from "@llmville/game/world/mapTypes";
import type { MapGridSpec } from "@llmville/game/world/grid";

import type { WorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import type { WorldModelFrameEntry } from "@llmville/game/scene/worldModelFrames";
import type { MeasuredAssetExtents } from "@llmville/game/scene/assetBounds";

/**
 * Transform input for map decor GLB models.
 * Must match MapDecor → SceneModel (instanceRotation from getDecorRotation, no placementDirection).
 */
export function decorModelTransformInput(
  item: DecorItemSpec,
  grid: MapGridSpec | null | undefined,
  measuredExtents: MeasuredAssetExtents,
  asset: WorldModelAsset | null | undefined,
  frameEntry: WorldModelFrameEntry | undefined,
): AssetTransformInput {
  return {
    frame: asset?.frame ?? frameEntry?.frame,
    footprint: item.footprint ?? asset?.footprint ?? frameEntry?.footprint,
    measuredExtents,
    instancePosition: getDecorWorldPosition(item, grid),
    instanceRotation: getDecorRotation(item),
    instanceScale: item.scale,
    baseRotation: asset?.baseRotation ?? frameEntry?.baseRotation,
    basePosition: asset?.basePosition ?? frameEntry?.basePosition,
    baseScale: asset?.baseScale ?? frameEntry?.baseScale,
    defaultScale: asset?.defaultScale ?? frameEntry?.defaultScale,
  };
}

export function buildItemTransformInput(
  itemId: string,
  point: { x: number; z: number },
  direction: 0 | 1 | 2 | 3,
  y: number,
  measuredExtents: MeasuredAssetExtents,
  asset: WorldModelAsset | null | undefined,
  frameEntry: WorldModelFrameEntry | undefined,
  footprint?: GridFootprint,
): AssetTransformInput {
  return {
    frame: asset?.frame ?? frameEntry?.frame,
    footprint: footprint ?? asset?.footprint ?? frameEntry?.footprint,
    measuredExtents,
    placementDirection: direction,
    instancePosition: [point.x, y, point.z],
    baseRotation: asset?.baseRotation ?? frameEntry?.baseRotation,
    basePosition: asset?.basePosition ?? frameEntry?.basePosition,
    baseScale: asset?.baseScale ?? frameEntry?.baseScale,
    defaultScale: asset?.defaultScale ?? frameEntry?.defaultScale,
  };
}