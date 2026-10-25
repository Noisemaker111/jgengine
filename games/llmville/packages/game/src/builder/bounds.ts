/**
 * World-space bounds for builder selections: walls, primitive decor, groups,
 * and footprint-fitted models (measured through the injected asset context).
 */
import {
  getDecorFootprint,
  getDecorItemBounds,
  getDecorRotation,
  getDecorScaleVector,
  getDecorWorldPosition,
  findSmallestDecorAt,
} from "@llmville/game/world/mapDecor";
import type { DecorItemSpec, MapData, WallSegmentSpec } from "@llmville/game/world/mapTypes";
import { getMapGrid } from "@llmville/game/builder/document";
import { resolveModelWorldBounds } from "@llmville/game/world/assetFrame";
import {
  getFootprintWorldSize,
  type GridFootprint,
  type MapGridSpec,
  type RoomBounds,
} from "@llmville/game/world/grid";

import type { BuilderAssetContext } from "@llmville/game/builder/assets";
import { roundCoord, type BuilderSelectionRef } from "@llmville/game/builder/document";

export interface BuilderBounds3d extends RoomBounds {
  minY: number;
  maxY: number;
}

export const MIN_SELECTION_AXIS_SIZE = 0.05;

export function wallBounds(wall: WallSegmentSpec): BuilderBounds3d {
  const [width, height, depth] = wall.args;
  const [x, y, z] = wall.position;
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: y - height / 2,
    maxY: y + height / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  };
}

export function mergeBounds(current: BuilderBounds3d | null, next: BuilderBounds3d): BuilderBounds3d {
  if (!current) return next;
  return {
    minX: Math.min(current.minX, next.minX),
    maxX: Math.max(current.maxX, next.maxX),
    minY: Math.min(current.minY, next.minY),
    maxY: Math.max(current.maxY, next.maxY),
    minZ: Math.min(current.minZ, next.minZ),
    maxZ: Math.max(current.maxZ, next.maxZ),
  };
}

export function decorHeightBounds(item: DecorItemSpec, grid?: MapGridSpec | null): { minY: number; maxY: number } {
  const [, y] = getDecorWorldPosition(item, grid);
  const [, scaleY] = getDecorScaleVector(item);
  if (item.type === "box" || item.type === "model") {
    let height = (item.args?.[1] ?? 1) * Math.abs(scaleY);
    if (item.type === "model" && item.args?.[1] === undefined) {
      const footprint = getDecorFootprint(item, grid);
      const footprintSize = grid ? getFootprintWorldSize(grid, footprint) : footprint;
      height = Math.max(footprintSize.width, footprintSize.depth) * Math.abs(scaleY);
    }
    return { minY: y - height / 2, maxY: y + height / 2 };
  }
  if (item.type === "cylinder") {
    const height = (item.args?.[2] ?? 1) * Math.abs(scaleY);
    return { minY: y - height / 2, maxY: y + height / 2 };
  }
  if (item.type === "sphere") {
    const radius = (item.args?.[0] ?? 0.5) * Math.abs(scaleY);
    return { minY: y - radius, maxY: y + radius };
  }
  if (item.type === "plane") {
    return { minY: y - 0.02, maxY: y + 0.02 };
  }
  if (item.type === "group" && item.children?.length) {
    const childBounds = item.children.reduce<BuilderBounds3d | null>((bounds, child) => {
      const childXz = getDecorItemBounds(child);
      if (!childXz) return bounds;
      const childHeight = decorHeightBounds(child);
      return mergeBounds(bounds, { ...childXz, ...childHeight });
    }, null);
    if (childBounds) {
      const scaledMinY = Math.min(childBounds.minY * scaleY, childBounds.maxY * scaleY);
      const scaledMaxY = Math.max(childBounds.minY * scaleY, childBounds.maxY * scaleY);
      return { minY: y + scaledMinY, maxY: y + scaledMaxY };
    }
  }
  return { minY: y, maxY: y + 1 };
}

export function clampSelectionBounds(bounds: BuilderBounds3d): BuilderBounds3d {
  let { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  if (minX > maxX) [minX, maxX] = [maxX, minX];
  if (minY > maxY) [minY, maxY] = [maxY, minY];
  if (minZ > maxZ) [minZ, maxZ] = [maxZ, minZ];
  const width = Math.max(MIN_SELECTION_AXIS_SIZE, maxX - minX);
  const height = Math.max(MIN_SELECTION_AXIS_SIZE, maxY - minY);
  const depth = Math.max(MIN_SELECTION_AXIS_SIZE, maxZ - minZ);
  return {
    minX,
    maxX: minX + width,
    minY,
    maxY: minY + height,
    minZ,
    maxZ: minZ + depth,
  };
}

export function getBoundsDimensions(bounds: BuilderBounds3d): { width: number; height: number; depth: number } {
  return {
    width: roundCoord(bounds.maxX - bounds.minX),
    height: roundCoord(bounds.maxY - bounds.minY),
    depth: roundCoord(bounds.maxZ - bounds.minZ),
  };
}

function modelDecorBounds3d(
  assets: BuilderAssetContext,
  item: DecorItemSpec,
  grid?: MapGridSpec | null,
): BuilderBounds3d | null {
  const modelKey = item.modelKey ?? item.modelId;
  const asset = modelKey ? assets.getModelAsset(modelKey) : null;
  const measured = asset?.modelPath ? assets.getMeasuredModelBounds(asset.modelPath) : undefined;
  if (!asset || !measured) return null;

  return resolveModelWorldBounds({
    frame: asset.frame,
    footprint: item.footprint ?? asset.footprint,
    measuredExtents: measured,
    instancePosition: getDecorWorldPosition(item, grid),
    instanceRotation: getDecorRotation(item),
    instanceScale: item.scale,
    baseRotation: asset.baseRotation,
    basePosition: asset.basePosition,
    baseScale: asset.baseScale,
    defaultScale: asset.defaultScale,
  });
}

/** Measured model bounds when available, footprint/primitive math otherwise. */
export function decorBounds3d(
  assets: BuilderAssetContext,
  item: DecorItemSpec,
  grid?: MapGridSpec | null,
): BuilderBounds3d | null {
  if (item.type === "model") {
    const measuredBounds = modelDecorBounds3d(assets, item, grid);
    if (measuredBounds) return measuredBounds;
  }
  const xz = getDecorItemBounds(item, grid);
  if (!xz) return null;
  return { ...xz, ...decorHeightBounds(item, grid) };
}

export function selectionBounds(
  assets: BuilderAssetContext,
  mapData: MapData,
  selectedRefs: readonly BuilderSelectionRef[],
): BuilderBounds3d | null {
  const grid = getMapGrid(mapData);
  return selectedRefs.reduce<BuilderBounds3d | null>((bounds, ref) => {
    if (ref.kind === "decor") {
      const item = mapData.decor.find((candidate) => candidate.id === ref.id);
      if (!item) return bounds;
      const itemBounds = decorBounds3d(assets, item, grid);
      return itemBounds ? mergeBounds(bounds, itemBounds) : bounds;
    }
    const wall = mapData.walls[ref.index];
    return wall ? mergeBounds(bounds, wallBounds(wall)) : bounds;
  }, null);
}

export function computeFootprintFromBounds(bounds: RoomBounds, grid: MapGridSpec): GridFootprint {
  return {
    width: Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / grid.tileSize)),
    depth: Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / grid.tileSize)),
  };
}

/** Smallest decor item under the point wins; walls only when no decor hit. */
export function findHitRef(mapData: MapData, x: number, z: number): BuilderSelectionRef | null {
  const grid = getMapGrid(mapData);
  const decorHit = findSmallestDecorAt(mapData.decor, x, z, grid, (item) => item.id !== undefined);
  if (decorHit?.id) return { kind: "decor", id: decorHit.id };

  let bestWall: { ref: BuilderSelectionRef; area: number } | null = null;
  for (const [index, wall] of mapData.walls.entries()) {
    const bounds = wallBounds(wall);
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
    const area = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    if (!bestWall || area < bestWall.area) {
      bestWall = { ref: { kind: "wall", index }, area };
    }
  }
  return bestWall?.ref ?? null;
}
