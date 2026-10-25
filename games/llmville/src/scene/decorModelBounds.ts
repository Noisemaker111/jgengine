import {
  resolveModelWorldBounds,
  type MeasuredAssetExtents,
  type ModelWorldBounds,
} from "@llmville/game/scene/assetBounds";
import { WORLD_MODEL_FRAMES } from "@llmville/game/scene/worldModelFrames";
import { WORLD_MODEL_NATIVE_EXTENTS } from "@llmville/game/scene/worldModelNativeExtents";
import type { MapGridSpec } from "@llmville/game/world/grid";
import type { DecorItemSpec } from "@llmville/game/world/mapTypes";

import { decorModelTransformInput } from "@llmville/game/scene/decorModelTransform";
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

/** Mesh-tight world bounds for a model decor item (cache → baked native extents). */
export function resolveWebDecorModelBounds3d(
  item: DecorItemSpec,
  grid?: MapGridSpec | null,
): ModelWorldBounds | null {
  if (item.type !== "model") return null;

  const modelKey = item.modelKey ?? item.modelId;
  if (!modelKey) return null;

  const asset = getWorldModelAsset(modelKey);
  const frameEntry = WORLD_MODEL_FRAMES[modelKey];
  const measured = resolveMeasuredExtents(modelKey, asset?.modelPath);
  if (!measured) return null;

  return resolveModelWorldBounds(
    decorModelTransformInput(item, grid, measured, asset, frameEntry),
  );
}