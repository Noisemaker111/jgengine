import {
  resolveModelWorldBounds,
  type MeasuredAssetExtents,
} from "@llmville/game/scene/assetBounds";
import { WORLD_MODEL_FRAMES } from "@llmville/game/scene/worldModelFrames";
import { WORLD_MODEL_NATIVE_EXTENTS } from "@llmville/game/scene/worldModelNativeExtents";
import type { CardinalDirection } from "@llmville/game/world/cardinal";
import type { GridFootprint, RoomBounds } from "@llmville/game/world/grid";

export function resolveModelKeyBoundsXZ(input: {
  modelKey: string;
  instancePosition: [number, number, number];
  instanceRotation?: [number, number, number];
  placementDirection?: CardinalDirection;
  footprint?: GridFootprint;
  instanceScale?: number | [number, number, number];
}): RoomBounds | null {
  const native = WORLD_MODEL_NATIVE_EXTENTS[input.modelKey];
  if (!native) return null;

  const frameEntry = WORLD_MODEL_FRAMES[input.modelKey];
  const measuredExtents: MeasuredAssetExtents = {
    width: native.width,
    height: native.height,
    depth: native.depth,
    center: native.center,
    minY: native.minY,
  };

  const bounds3d = resolveModelWorldBounds({
    frame: frameEntry?.frame,
    footprint: input.footprint ?? frameEntry?.footprint,
    measuredExtents,
    placementDirection: input.placementDirection,
    instancePosition: input.instancePosition,
    instanceRotation: input.instanceRotation,
    instanceScale: input.instanceScale,
    baseRotation: frameEntry?.baseRotation,
    basePosition: frameEntry?.basePosition,
    baseScale: frameEntry?.baseScale,
    defaultScale: frameEntry?.defaultScale,
  });

  if (!bounds3d) return null;
  return {
    minX: bounds3d.minX,
    maxX: bounds3d.maxX,
    minZ: bounds3d.minZ,
    maxZ: bounds3d.maxZ,
  };
}