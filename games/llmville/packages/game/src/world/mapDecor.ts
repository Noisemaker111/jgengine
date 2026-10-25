import { resolveModelKeyBoundsXZ } from "@llmville/game/scene/modelPlacementBounds";
import { WORLD_MODEL_FRAMES } from "@llmville/game/scene/worldModelFrames";
import { WORLD_MODEL_NATIVE_EXTENTS } from "@llmville/game/scene/worldModelNativeExtents";
import type { DecorItemSpec } from "@llmville/game/world/mapTypes";
import { parseCardinal, cardinalToRotationY } from "@llmville/game/world/cardinal";
import {
  DEFAULT_GRID_FOOTPRINT,
  getCenteredFootprintBounds,
  getFootprintWorldSize,
  gridAnchorToWorldPosition,
  normalizeGridFootprint,
  type GridFootprint,
  type MapGridSpec,
  type RoomBounds,
} from "@llmville/game/world/grid";

function filterDecorItem(
  item: DecorItemSpec,
  hiddenDecorIds: ReadonlySet<string>,
): DecorItemSpec | null {
  if (item.id !== undefined && hiddenDecorIds.has(item.id)) {
    return null;
  }

  if (!item.children?.length) {
    return item;
  }

  const visibleChildren = item.children
    .map((child) => filterDecorItem(child, hiddenDecorIds))
    .filter((child): child is DecorItemSpec => child !== null);

  if (visibleChildren.length === item.children.length) {
    return item;
  }

  return { ...item, children: visibleChildren };
}

export function filterDecorItems(
  items: readonly DecorItemSpec[],
  hiddenDecorIds: readonly string[] | undefined,
): readonly DecorItemSpec[] {
  if (!hiddenDecorIds?.length) {
    return items;
  }

  const hiddenDecorIdSet = new Set(hiddenDecorIds);
  return items
    .map((item) => filterDecorItem(item, hiddenDecorIdSet))
    .filter((item): item is DecorItemSpec => item !== null);
}

export function getDecorModelId(spec: DecorItemSpec): string | null {
  return spec.modelId ?? spec.modelKey ?? null;
}

export function getDecorFootprint(
  spec: DecorItemSpec,
  grid?: MapGridSpec | null,
): GridFootprint {
  if (spec.footprint) {
    return normalizeGridFootprint(spec.footprint);
  }

  if (!grid) {
    return DEFAULT_GRID_FOOTPRINT;
  }

  if (spec.type === "box" || spec.type === "model") {
    const width = Math.max(1, Math.ceil((spec.args?.[0] ?? grid.tileSize) / grid.tileSize));
    const depth = Math.max(1, Math.ceil((spec.args?.[2] ?? grid.tileSize) / grid.tileSize));
    return { width, depth };
  }

  if (spec.type === "plane") {
    const width = Math.max(1, Math.ceil((spec.args?.[0] ?? grid.tileSize) / grid.tileSize));
    const depth = Math.max(1, Math.ceil((spec.args?.[1] ?? grid.tileSize) / grid.tileSize));
    return { width, depth };
  }

  return DEFAULT_GRID_FOOTPRINT;
}

export function getDecorScaleVector(spec: DecorItemSpec): [number, number, number] {
  if (typeof spec.scale === "number") {
    return [spec.scale, spec.scale, spec.scale];
  }
  return spec.scale ?? [1, 1, 1];
}

export function getDecorRotation(spec: DecorItemSpec): [number, number, number] | undefined {
  if (spec.rotation) {
    return spec.rotation;
  }
  if (spec.facing !== undefined) {
    return [0, cardinalToRotationY(parseCardinal(spec.facing)), 0];
  }
  if (spec.gridRotation !== undefined) {
    return [0, cardinalToRotationY(spec.gridRotation), 0];
  }
  return undefined;
}

export function getDecorWorldPosition(
  spec: DecorItemSpec,
  grid?: MapGridSpec | null,
): [number, number, number] {
  const position = spec.position ?? [0, 0, 0];
  if (grid && spec.gridX !== undefined && spec.gridZ !== undefined) {
    const footprint = getDecorFootprint(spec, grid);
    const world = gridAnchorToWorldPosition(grid, spec.gridX, spec.gridZ, footprint);
    return [world.x, position[1] ?? 0, world.z];
  }
  return position;
}

export function resolveDecorModelBounds(
  item: DecorItemSpec,
  grid?: MapGridSpec | null,
): RoomBounds | null {
  if (item.type !== "model") return null;

  const modelKey = getDecorModelId(item);
  if (!modelKey) return null;

  const frameEntry = WORLD_MODEL_FRAMES[modelKey];

  return resolveModelKeyBoundsXZ({
    modelKey,
    instancePosition: getDecorWorldPosition(item, grid),
    instanceRotation: getDecorRotation(item),
    footprint: item.footprint ?? frameEntry?.footprint,
    instanceScale: item.scale,
  });
}

function isCollidable(item: DecorItemSpec, _index: number): boolean {
  if (item.type === "group") return true;
  if (item.type === "model") {
    const modelKey = getDecorModelId(item);
    const native = modelKey ? WORLD_MODEL_NATIVE_EXTENTS[modelKey] : undefined;
    return native !== undefined && native.height > 0.15;
  }
  if (item.type === "cylinder") {
    const [rTop = 0.5, rBottom = 0.5] = item.args ?? [];
    const radius = Math.max(rTop, rBottom);
    return radius >= 0.15;
  }
  if (item.type === "box") {
    const [width = 1, height = 1, depth = 1] = item.args ?? [];
    const minDim = Math.min(width, height, depth);
    return minDim >= 0.2 && (width >= 0.3 || depth >= 0.3);
  }
  return false;
}

function boxXZBoundsLocal(width: number, depth: number, rotationY: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const corners: [number, number][] = [
    [halfWidth * cos - halfDepth * sin, halfWidth * sin + halfDepth * cos],
    [-halfWidth * cos - halfDepth * sin, -halfWidth * sin + halfDepth * cos],
    [halfWidth * cos + halfDepth * sin, halfWidth * sin - halfDepth * cos],
    [-halfWidth * cos + halfDepth * sin, -halfWidth * sin - halfDepth * cos],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of corners) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

function scaleAxisBounds(min: number, max: number, scale: number): { min: number; max: number } {
  return {
    min: Math.min(min * scale, max * scale),
    max: Math.max(min * scale, max * scale),
  };
}

function primitiveBounds(item: DecorItemSpec, grid?: MapGridSpec | null): RoomBounds | null {
  const [positionX, , positionZ] = getDecorWorldPosition(item, grid);
  const rotationY = getDecorRotation(item)?.[1] ?? 0;
  const [scaleX, , scaleZ] = getDecorScaleVector(item);

  if (item.type === "model") {
    const meshBounds = resolveDecorModelBounds(item, grid);
    if (meshBounds) return meshBounds;

    const footprint = getDecorFootprint(item, grid ?? undefined);
    const isGridAnchored = grid && item.gridX !== undefined && item.gridZ !== undefined;
    if (isGridAnchored && item.scale === undefined && item.rotation === undefined) {
      return getCenteredFootprintBounds(grid, { x: positionX, z: positionZ }, footprint);
    }

    const footprintSize = grid ? getFootprintWorldSize(grid, footprint) : footprint;
    const width = item.footprint ? footprintSize.width : item.args?.[0] ?? footprintSize.width;
    const depth = item.footprint ? footprintSize.depth : item.args?.[2] ?? footprintSize.depth;
    const bounds = boxXZBoundsLocal(width * Math.abs(scaleX), depth * Math.abs(scaleZ), rotationY);
    return {
      minX: positionX + bounds.minX,
      maxX: positionX + bounds.maxX,
      minZ: positionZ + bounds.minZ,
      maxZ: positionZ + bounds.maxZ,
    };
  }

  if (item.type === "box") {
    const [width = 1, , depth = 1] = item.args ?? [];
    const bounds = boxXZBoundsLocal(width * Math.abs(scaleX), depth * Math.abs(scaleZ), rotationY);
    return {
      minX: positionX + bounds.minX,
      maxX: positionX + bounds.maxX,
      minZ: positionZ + bounds.minZ,
      maxZ: positionZ + bounds.maxZ,
    };
  }

  if (item.type === "cylinder") {
    const [rTop = 0.5, rBottom = 0.5] = item.args ?? [];
    const radius = Math.max(rTop, rBottom) * Math.max(Math.abs(scaleX), Math.abs(scaleZ));
    const bounds = boxXZBoundsLocal(radius * 2, radius * 2, rotationY);
    return {
      minX: positionX + bounds.minX,
      maxX: positionX + bounds.maxX,
      minZ: positionZ + bounds.minZ,
      maxZ: positionZ + bounds.maxZ,
    };
  }

  if (item.type === "plane") {
    const [width = 1, height = 1] = item.args ?? [];
    const bounds = boxXZBoundsLocal(width * Math.abs(scaleX), height * Math.abs(scaleZ), rotationY);
    return {
      minX: positionX + bounds.minX,
      maxX: positionX + bounds.maxX,
      minZ: positionZ + bounds.minZ,
      maxZ: positionZ + bounds.maxZ,
    };
  }

  if (item.type === "sphere") {
    const [radius = 0.5] = item.args ?? [];
    const scaledRadius = radius * Math.max(Math.abs(scaleX), Math.abs(scaleZ));
    return {
      minX: positionX - scaledRadius,
      maxX: positionX + scaledRadius,
      minZ: positionZ - scaledRadius,
      maxZ: positionZ + scaledRadius,
    };
  }

  return null;
}

function groupBoundsLocal(item: DecorItemSpec): RoomBounds | null {
  if (!item.children?.length) {
    if (item.footprint) {
      const halfW = item.footprint.width / 2;
      const halfD = item.footprint.depth / 2;
      return { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD };
    }
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const child of item.children) {
    const bounds = decorItemBoundsLocal(child);
    if (bounds) {
      minX = Math.min(minX, bounds.minX);
      maxX = Math.max(maxX, bounds.maxX);
      minZ = Math.min(minZ, bounds.minZ);
      maxZ = Math.max(maxZ, bounds.maxZ);
    }
  }

  if (minX === Infinity) return null;
  const [scaleX, , scaleZ] = getDecorScaleVector(item);
  const scaledX = scaleAxisBounds(minX, maxX, scaleX);
  const scaledZ = scaleAxisBounds(minZ, maxZ, scaleZ);
  return { minX: scaledX.min, maxX: scaledX.max, minZ: scaledZ.min, maxZ: scaledZ.max };
}

function decorItemBoundsLocal(item: DecorItemSpec): RoomBounds | null {
  if (item.type === "group") {
    return groupBoundsLocal(item);
  }
  return primitiveBounds(item);
}

export function getDecorItemBounds(item: DecorItemSpec, grid?: MapGridSpec | null): RoomBounds | null {
  if (item.type === "group") {
    const local = groupBoundsLocal(item);
    if (!local) return null;
    const [positionX, , positionZ] = getDecorWorldPosition(item, grid);
    const rotationY = getDecorRotation(item)?.[1] ?? 0;
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const corners: [number, number][] = [
      [local.minX, local.minZ],
      [local.maxX, local.minZ],
      [local.minX, local.maxZ],
      [local.maxX, local.maxZ],
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [localX, localZ] of corners) {
      const worldX = positionX + localX * cos - localZ * sin;
      const worldZ = positionZ + localX * sin + localZ * cos;
      minX = Math.min(minX, worldX);
      maxX = Math.max(maxX, worldX);
      minZ = Math.min(minZ, worldZ);
      maxZ = Math.max(maxZ, worldZ);
    }
    return { minX, maxX, minZ, maxZ };
  }
  return primitiveBounds(item, grid);
}

/** Smallest-area eligible decor item whose XZ bounds contain the point. */
export function findSmallestDecorAt(
  decor: readonly DecorItemSpec[],
  x: number,
  z: number,
  grid: MapGridSpec | null | undefined,
  isEligible: (item: DecorItemSpec) => boolean,
): DecorItemSpec | null {
  let best: DecorItemSpec | null = null;
  let bestArea = Infinity;
  for (const item of decor) {
    if (!isEligible(item)) continue;
    const bounds = getDecorItemBounds(item, grid);
    if (!bounds || x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
    const area = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    if (area < bestArea) {
      bestArea = area;
      best = item;
    }
  }
  return best;
}

export function computeDecorColliders(decor: readonly DecorItemSpec[], grid?: MapGridSpec | null): RoomBounds[] {
  const output: RoomBounds[] = [];
  for (const [index, item] of decor.entries()) {
    if (!isCollidable(item, index)) continue;
    const bounds = getDecorItemBounds(item, grid);
    if (bounds) output.push(bounds);
  }
  return output;
}

export function getDecorBoundsList(decor: readonly DecorItemSpec[], grid?: MapGridSpec | null): (RoomBounds | null)[] {
  return decor.map((item, index) => (
    isCollidable(item, index) ? getDecorItemBounds(item, grid) : null
  ));
}

