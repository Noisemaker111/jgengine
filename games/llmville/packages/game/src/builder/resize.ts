/**
 * Edge-drag resize math: axis projection anchors, face-handle placement, and
 * lightweight map patches that clone only the selected items. Pointer-ray
 * projection lives with the host viewport (it needs the renderer's camera).
 */
import {
  getDecorScaleVector,
  getDecorWorldPosition,
} from "@llmville/game/world/mapDecor";
import type { DecorItemSpec, MapData, WallSegmentSpec } from "@llmville/game/world/mapTypes";
import type { MapGridSpec } from "@llmville/game/world/grid";
import { getMapGrid } from "@llmville/game/builder/document";

import { MIN_SELECTION_AXIS_SIZE, type BuilderBounds3d } from "@llmville/game/builder/bounds";
import { cloneSpec, splitSelectionRefs, type BuilderSelectionRef } from "@llmville/game/builder/document";

export type BuilderResizeAxis = "x" | "y" | "z";
export type BuilderResizeEdge = "min" | "max";

export const RESIZE_HANDLE_OUTSET = 0.42;

export interface BuilderResizeSnapshot {
  decor: readonly { id: string; item: DecorItemSpec }[];
  walls: readonly { index: number; wall: WallSegmentSpec }[];
}

function cloneWall(wall: WallSegmentSpec): WallSegmentSpec {
  return {
    ...wall,
    args: [...wall.args] as [number, number, number],
    position: [...wall.position] as [number, number, number],
  };
}

export function createResizeSnapshot(
  mapData: MapData,
  refs: readonly BuilderSelectionRef[],
): BuilderResizeSnapshot {
  const { decorIds, wallIndexes } = splitSelectionRefs(refs);
  return {
    decor: mapData.decor
      .filter((item): item is DecorItemSpec & { id: string } => item.id !== undefined && decorIds.has(item.id))
      .map((item) => ({ id: item.id, item: cloneSpec(item) })),
    walls: mapData.walls
      .map((wall, index) => ({ index, wall }))
      .filter(({ index }) => wallIndexes.has(index))
      .map(({ index, wall }) => ({ index, wall: cloneWall(wall) })),
  };
}

/** Point a +Y-aligned arrow mesh along the outward face normal. */
export function resizeArrowRotation(axis: BuilderResizeAxis, edge: BuilderResizeEdge): [number, number, number] {
  const outward = edge === "max" ? 1 : -1;
  if (axis === "x") return [0, 0, outward > 0 ? -Math.PI / 2 : Math.PI / 2];
  if (axis === "y") return [outward > 0 ? 0 : Math.PI, 0, 0];
  return [outward > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0];
}

export function resizeHandlePosition(
  bounds: BuilderBounds3d,
  axis: BuilderResizeAxis,
  edge: BuilderResizeEdge,
): [number, number, number] {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const o = RESIZE_HANDLE_OUTSET;
  if (axis === "x") {
    return [edge === "min" ? bounds.minX - o : bounds.maxX + o, cy, cz];
  }
  if (axis === "y") {
    return [cx, edge === "min" ? bounds.minY - o : bounds.maxY + o, cz];
  }
  return [cx, cy, edge === "min" ? bounds.minZ - o : bounds.maxZ + o];
}

export function clampTargetBoundsForEdgeDrag(
  fromBounds: BuilderBounds3d,
  worldValue: number,
  axis: BuilderResizeAxis,
  edge: BuilderResizeEdge,
): BuilderBounds3d {
  const target = { ...fromBounds };
  if (axis === "x") {
    if (edge === "max") target.maxX = Math.max(worldValue, fromBounds.minX + MIN_SELECTION_AXIS_SIZE);
    else target.minX = Math.min(worldValue, fromBounds.maxX - MIN_SELECTION_AXIS_SIZE);
  } else if (axis === "y") {
    if (edge === "max") target.maxY = Math.max(worldValue, fromBounds.minY + MIN_SELECTION_AXIS_SIZE);
    else target.minY = Math.min(worldValue, fromBounds.maxY - MIN_SELECTION_AXIS_SIZE);
  } else if (edge === "max") {
    target.maxZ = Math.max(worldValue, fromBounds.minZ + MIN_SELECTION_AXIS_SIZE);
  } else {
    target.minZ = Math.min(worldValue, fromBounds.maxZ - MIN_SELECTION_AXIS_SIZE);
  }
  return target;
}

function getResizeAnchor(
  fromBounds: BuilderBounds3d,
  axis: BuilderResizeAxis,
  edge: BuilderResizeEdge,
): [number, number, number] {
  return [
    axis === "x" ? (edge === "min" ? fromBounds.maxX : fromBounds.minX) : fromBounds.minX,
    axis === "y" ? (edge === "min" ? fromBounds.maxY : fromBounds.minY) : fromBounds.minY,
    axis === "z" ? (edge === "min" ? fromBounds.maxZ : fromBounds.minZ) : fromBounds.minZ,
  ];
}

function normalizeDecorScale(scale: [number, number, number]): DecorItemSpec["scale"] {
  if (scale[0] === scale[1] && scale[1] === scale[2]) return scale[0];
  return scale;
}

function applyResizeToDecorItem(
  item: DecorItemSpec,
  fromBounds: BuilderBounds3d,
  targetBounds: BuilderBounds3d,
  grid: MapGridSpec,
  edgeDrag?: { axis: BuilderResizeAxis; edge: BuilderResizeEdge },
): DecorItemSpec {
  const sizeX = fromBounds.maxX - fromBounds.minX;
  const sizeY = fromBounds.maxY - fromBounds.minY;
  const sizeZ = fromBounds.maxZ - fromBounds.minZ;
  const sx = sizeX > MIN_SELECTION_AXIS_SIZE ? (targetBounds.maxX - targetBounds.minX) / sizeX : 1;
  const sy = sizeY > MIN_SELECTION_AXIS_SIZE ? (targetBounds.maxY - targetBounds.minY) / sizeY : 1;
  const sz = sizeZ > MIN_SELECTION_AXIS_SIZE ? (targetBounds.maxZ - targetBounds.minZ) / sizeZ : 1;
  const [fromAnchorX, fromAnchorY, fromAnchorZ] = edgeDrag
    ? getResizeAnchor(fromBounds, edgeDrag.axis, edgeDrag.edge)
    : [fromBounds.minX, fromBounds.minY, fromBounds.minZ];
  const [targetAnchorX, targetAnchorY, targetAnchorZ] = edgeDrag
    ? getResizeAnchor(targetBounds, edgeDrag.axis, edgeDrag.edge)
    : [targetBounds.minX, targetBounds.minY, targetBounds.minZ];
  const [px, py, pz] = getDecorWorldPosition(item, grid);
  const [scaleX, scaleY, scaleZ] = getDecorScaleVector(item);
  const next = cloneSpec(item);
  delete next.gridX;
  delete next.gridZ;
  next.scale = normalizeDecorScale([scaleX * sx, scaleY * sy, scaleZ * sz]);
  next.position = [
    targetAnchorX + (px - fromAnchorX) * sx,
    targetAnchorY + (py - fromAnchorY) * sy,
    targetAnchorZ + (pz - fromAnchorZ) * sz,
  ];
  return next;
}

function applyResizeToWall(
  wall: WallSegmentSpec,
  fromBounds: BuilderBounds3d,
  targetBounds: BuilderBounds3d,
  edgeDrag?: { axis: BuilderResizeAxis; edge: BuilderResizeEdge },
): WallSegmentSpec {
  const sizeX = fromBounds.maxX - fromBounds.minX;
  const sizeY = fromBounds.maxY - fromBounds.minY;
  const sizeZ = fromBounds.maxZ - fromBounds.minZ;
  const sx = sizeX > MIN_SELECTION_AXIS_SIZE ? (targetBounds.maxX - targetBounds.minX) / sizeX : 1;
  const sy = sizeY > MIN_SELECTION_AXIS_SIZE ? (targetBounds.maxY - targetBounds.minY) / sizeY : 1;
  const sz = sizeZ > MIN_SELECTION_AXIS_SIZE ? (targetBounds.maxZ - targetBounds.minZ) / sizeZ : 1;
  const [fromAnchorX, fromAnchorY, fromAnchorZ] = edgeDrag
    ? getResizeAnchor(fromBounds, edgeDrag.axis, edgeDrag.edge)
    : [fromBounds.minX, fromBounds.minY, fromBounds.minZ];
  const [targetAnchorX, targetAnchorY, targetAnchorZ] = edgeDrag
    ? getResizeAnchor(targetBounds, edgeDrag.axis, edgeDrag.edge)
    : [targetBounds.minX, targetBounds.minY, targetBounds.minZ];
  const [wx, wy, wz] = wall.position;
  return {
    ...wall,
    args: [wall.args[0] * sx, wall.args[1] * sy, wall.args[2] * sz],
    position: [
      targetAnchorX + (wx - fromAnchorX) * sx,
      targetAnchorY + (wy - fromAnchorY) * sy,
      targetAnchorZ + (wz - fromAnchorZ) * sz,
    ],
  };
}

/** Patch only selected decor/walls from a drag snapshot — avoids cloning the whole map. */
export function patchMapDataForResize(
  currentMap: MapData,
  snapshot: BuilderResizeSnapshot,
  fromBounds: BuilderBounds3d,
  targetBounds: BuilderBounds3d,
  refs: readonly BuilderSelectionRef[],
  edgeDrag?: { axis: BuilderResizeAxis; edge: BuilderResizeEdge },
): MapData {
  const grid = getMapGrid(currentMap);
  const { decorIds, wallIndexes } = splitSelectionRefs(refs);
  const decorSnapshot = new Map(snapshot.decor.map(({ id, item }) => [id, item]));
  const wallSnapshot = new Map(snapshot.walls.map(({ index, wall }) => [index, wall]));

  const decor = currentMap.decor.map((item) => {
    if (!item.id || !decorIds.has(item.id)) return item;
    const source = decorSnapshot.get(item.id);
    if (!source) return item;
    return applyResizeToDecorItem(source, fromBounds, targetBounds, grid, edgeDrag);
  });

  const walls = currentMap.walls.map((wall, index) => {
    if (!wallIndexes.has(index)) return wall;
    const source = wallSnapshot.get(index);
    if (!source) return wall;
    return applyResizeToWall(source, fromBounds, targetBounds, edgeDrag);
  });

  return { ...currentMap, decor, walls };
}
