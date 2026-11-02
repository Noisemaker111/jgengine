import type { AssetTransformInput } from "@llmville/game/scene/assetBounds";
import type { GridFootprint } from "@llmville/game/world/grid";

import type { WorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import type { WorldModelFrameEntry } from "@llmville/game/scene/worldModelFrames";
import type { MeasuredAssetExtents } from "@llmville/game/scene/assetBounds";

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