/**
 * Decor item factories: primitives from drafts, models from a catalog key,
 * and stamping reusable templates onto a document at a world point.
 */
import {
  getDecorFootprint,
  getDecorItemBounds,
  getDecorWorldPosition,
} from "@llmville/game/world/mapDecor";
import type { DecorItemSpec } from "@llmville/game/world/mapTypes";
import { snapWorldToGrid, type MapGridSpec } from "@llmville/game/world/grid";

import type { BuilderAssetContext } from "@llmville/game/builder/assets";
import { computeFootprintFromBounds, decorHeightBounds } from "@llmville/game/builder/bounds";
import { cloneSpec, roundCoord } from "@llmville/game/builder/document";
import { applyMaterialToDecor, type BuilderMaterial } from "@llmville/game/builder/operations";

export type BuilderPrimitiveKind = "box" | "plane" | "cylinder" | "sphere";

export interface BuilderPrimitiveDraft {
  kind: BuilderPrimitiveKind;
  width: number;
  height: number;
  depth: number;
  radius: number;
  segments: number;
}

export function catalogModelToDecor(
  assets: BuilderAssetContext,
  modelKey: string,
  grid: MapGridSpec,
  x: number,
  z: number,
  id: string,
): DecorItemSpec {
  const asset = assets.getModelAsset(modelKey);
  const footprint = asset?.footprint ?? { width: 1, depth: 1 };
  const snapped = snapWorldToGrid(grid, x, z, footprint);
  return {
    id,
    type: "model",
    assetType: "model",
    modelKey,
    gridX: snapped.gridX,
    gridZ: snapped.gridZ,
    footprint,
    position: [0, 0, 0],
    castShadow: true,
    receiveShadow: true,
  };
}

export function primitiveToDecor(
  primitive: BuilderPrimitiveDraft,
  grid: MapGridSpec,
  x: number,
  z: number,
  id: string,
  material: BuilderMaterial,
): DecorItemSpec {
  if (primitive.kind === "box") {
    const footprint = {
      width: Math.max(1, Math.ceil(primitive.width / grid.tileSize)),
      depth: Math.max(1, Math.ceil(primitive.depth / grid.tileSize)),
    };
    const snapped = snapWorldToGrid(grid, x, z, footprint);
    return applyMaterialToDecor({
      id,
      type: "box",
      assetType: "primitive",
      args: [primitive.width, primitive.height, primitive.depth],
      footprint,
      position: [snapped.worldX, primitive.height / 2, snapped.worldZ],
      castShadow: true,
      receiveShadow: true,
    }, material);
  }

  if (primitive.kind === "plane") {
    const footprint = {
      width: Math.max(1, Math.ceil(primitive.width / grid.tileSize)),
      depth: Math.max(1, Math.ceil(primitive.depth / grid.tileSize)),
    };
    const snapped = snapWorldToGrid(grid, x, z, footprint);
    return applyMaterialToDecor({
      id,
      type: "plane",
      assetType: "primitive",
      args: [primitive.width, primitive.depth],
      footprint,
      position: [snapped.worldX, 0.024, snapped.worldZ],
      rotation: [-Math.PI / 2, 0, 0],
      doubleSide: true,
      receiveShadow: true,
    }, material);
  }

  if (primitive.kind === "cylinder") {
    const diameter = primitive.radius * 2;
    const footprint = {
      width: Math.max(1, Math.ceil(diameter / grid.tileSize)),
      depth: Math.max(1, Math.ceil(diameter / grid.tileSize)),
    };
    const snapped = snapWorldToGrid(grid, x, z, footprint);
    return applyMaterialToDecor({
      id,
      type: "cylinder",
      assetType: "primitive",
      args: [primitive.radius, primitive.radius, primitive.height, primitive.segments],
      footprint,
      position: [snapped.worldX, primitive.height / 2, snapped.worldZ],
      castShadow: true,
      receiveShadow: true,
    }, material);
  }

  const footprint = {
    width: Math.max(1, Math.ceil((primitive.radius * 2) / grid.tileSize)),
    depth: Math.max(1, Math.ceil((primitive.radius * 2) / grid.tileSize)),
  };
  const snapped = snapWorldToGrid(grid, x, z, footprint);
  return applyMaterialToDecor({
    id,
    type: "sphere",
    assetType: "primitive",
    args: [primitive.radius, primitive.segments, Math.max(12, Math.floor(primitive.segments / 2))],
    footprint,
    position: [snapped.worldX, primitive.radius, snapped.worldZ],
    castShadow: true,
    receiveShadow: true,
  }, material);
}

/** Strip instance identity/placement so a decor item can be re-stamped. */
export function decorToStampTemplate(item: DecorItemSpec): DecorItemSpec {
  const template = cloneSpec(item);
  delete template.id;
  delete template.gridX;
  delete template.gridZ;
  template.position = [0, template.position?.[1] ?? 0, 0];
  return template;
}

/** Instantiate a stamp template at a world point, snapped to the grid. */
export function stampDecorAt(
  assets: BuilderAssetContext,
  template: DecorItemSpec,
  grid: MapGridSpec,
  x: number,
  z: number,
  id: string,
): DecorItemSpec {
  if (template.type === "model" && template.modelKey) {
    return catalogModelToDecor(assets, template.modelKey, grid, x, z, id);
  }
  const item = cloneSpec(template);
  item.id = id;
  delete item.gridX;
  delete item.gridZ;
  const footprint = item.footprint ?? getDecorFootprint(item, grid) ?? { width: 1, depth: 1 };
  const snapped = snapWorldToGrid(grid, x, z, footprint);
  const baseY = item.position?.[1] ?? 0;
  item.position = [snapped.worldX, baseY, snapped.worldZ];
  item.footprint = footprint;
  const bounds = getDecorItemBounds(item, grid);
  if (bounds) item.footprint = computeFootprintFromBounds(bounds, grid);
  return item;
}

/** Move decor so its world-space bounding-box center is at XZ origin and its base sits on Y=0. */
export function centerDecorAtOrigin(item: DecorItemSpec, grid?: MapGridSpec | null): DecorItemSpec {
  const xz = getDecorItemBounds(item, grid);
  const next = cloneSpec(item);
  delete next.gridX;
  delete next.gridZ;

  if (!xz) {
    next.position = [0, next.position?.[1] ?? 0, 0];
    return next;
  }

  const [px, py, pz] = getDecorWorldPosition(item, grid);
  const centerX = (xz.minX + xz.maxX) / 2;
  const centerZ = (xz.minZ + xz.maxZ) / 2;

  if (item.type === "model") {
    // Catalog models anchor at floor-center; the renderer snaps mesh feet to this Y.
    next.position = [roundCoord(px - centerX), 0, roundCoord(pz - centerZ)];
    return next;
  }

  const yBounds = decorHeightBounds(item, grid);
  next.position = [
    roundCoord(px - centerX),
    roundCoord(py - yBounds.minY),
    roundCoord(pz - centerZ),
  ];
  return next;
}
