import {
  resolveModelWorldBounds,
  type MeasuredAssetExtents,
  type ModelWorldBounds,
} from "@llmville/game/scene/assetBounds";
import { WORLD_MODEL_FRAMES } from "@llmville/game/scene/worldModelFrames";
import { WORLD_MODEL_NATIVE_EXTENTS } from "@llmville/game/scene/worldModelNativeExtents";
import type { BuildDirection } from "@llmville/game/build/catalog";
import type { RoomBounds, WorldPoint } from "@llmville/game/world/grid";

import { buildItemTransformInput } from "@llmville/game/scene/decorModelTransform";
import { getCachedModelBounds } from "@/scene/modelBoundsCache";
import { getWorldModelAsset } from "@llmville/game/world/worldModelCatalog";

function resolveMeasuredExtents(modelKey: string, modelPath?: string): MeasuredAssetExtents | undefined {
  if (modelPath) {
    const cached = getCachedModelBounds(modelPath);
    if (cached) return cached;
  }

  const native = WORLD_MODEL_NATIVE_EXTENTS[modelKey];
  if (!native) return undefined;
  return {
    width: native.width,
    height: native.height,
    depth: native.depth,
    center: native.center,
    minY: native.minY,
  };
}

/** Mesh-tight world bounds for a placed build decor item (cache → baked native extents). */
export function resolveWebBuildItemPlacementBounds3d(
  itemId: string,
  point: WorldPoint,
  direction: BuildDirection,
  y?: number,
): ModelWorldBounds | null {
  const asset = getWorldModelAsset(itemId);
  const frameEntry = WORLD_MODEL_FRAMES[itemId];
  const measured = resolveMeasuredExtents(itemId, asset?.modelPath);
  if (!measured) return null;

  return resolveModelWorldBounds(
    buildItemTransformInput(itemId, point, direction, y ?? 0, measured, asset, frameEntry),
  );
}

export function resolveWebBuildItemPlacementBounds(
  itemId: string,
  point: WorldPoint,
  direction: BuildDirection,
  y?: number,
): RoomBounds | null {
  const bounds3d = resolveWebBuildItemPlacementBounds3d(itemId, point, direction, y);
  if (!bounds3d) return null;
  return {
    minX: bounds3d.minX,
    maxX: bounds3d.maxX,
    minZ: bounds3d.minZ,
    maxZ: bounds3d.maxZ,
  };
}