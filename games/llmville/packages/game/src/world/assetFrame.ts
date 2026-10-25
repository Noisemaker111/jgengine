/**
 * LLMville spatial contract — every prop, rack, and map decor shares this frame.
 *
 * World axes (Three.js, Y-up):
 *   +X = East (right)
 *   +Y = up
 *   +Z = North (toward the tier front door)
 *
 * Grid: 1 cell = 1 meter (`TILE_SIZE` ≈ 3.28 ft). Footprints are whole cells (integers).
 * Facing: 0 = North, 1 = East, 2 = South, 3 = West.
 *
 * === SCALING RULE (THE ONE FUNCTION) ===
 * ALL scaling happens through `resolveAssetTransform`.
 * - Declare `footprint: {width, depth}` in catalog (in tiles).
 * - If `frame.fitFootprint: true`, we measure the GLTF on load and uniformly scale it
 *   to exactly fit the footprint.
 * - This makes sizes predictable regardless of how the source artist modeled the GLB.
 * - Use the 6ft human reference in SpatialDebugOverlay to judge "is this car the right size?"
 * - On import/preview, you immediately see effective size vs human (6ft) and grid.
 */

export { CARDINAL } from "@llmville/game/world/cardinal";

import type { MeasuredAssetExtents } from "@llmville/game/scene/assetBounds";

export type {
  AssetAnchor,
  AssetBoundsMeters,
  AssetFrame,
  AssetTransformInput,
  MeasuredAssetExtents,
  ModelWorldBounds,
  ResolvedAssetTransform,
  SourceForwardAxis,
} from "@llmville/game/scene/assetBounds";

export {
  clampFootprintFitScale,
  MAX_FOOTPRINT_FIT_SCALE,
  MIN_FOOTPRINT_FIT_SCALE,
  meshExtentsToFootprintAxes,
  normalizeScaleVec,
  resolveAssetTransform,
  resolveModelWorldBounds,
} from "@llmville/game/scene/assetBounds";

/** Fully measured local bounds of a loaded mesh (meters in file space). */
export interface MeasuredMeshBounds extends MeasuredAssetExtents {
  /** Local-space center of the axis-aligned bounds. */
  center: [number, number, number];
  /** Local-space minimum Y of the axis-aligned bounds. */
  minY: number;
}