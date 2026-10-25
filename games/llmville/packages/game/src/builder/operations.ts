/**
 * Pure selection edits over a builder document. Every operation takes a
 * `MapData` plus selection refs and returns a new document — the host
 * store owns normalization (ids/colliders), undo, and any scene composition.
 */
import {
  getDecorFootprint,
  getDecorItemBounds,
  getDecorRotation,
  getDecorWorldPosition,
} from "@llmville/game/world/mapDecor";
import type { DecorItemSpec, MapData } from "@llmville/game/world/mapTypes";
import { getMapGrid } from "@llmville/game/builder/document";
import { snapWorldToGrid } from "@llmville/game/world/grid";

import type { BuilderAssetContext } from "@llmville/game/builder/assets";
import {
  computeFootprintFromBounds,
  selectionBounds,
} from "@llmville/game/builder/bounds";
import {
  cloneSpec,
  nextUniqueDecorId,
  roundCoord,
  splitSelectionRefs,
  type BuilderSelectionRef,
} from "@llmville/game/builder/document";

/** Renderable material values the builder can stamp onto decor items. */
export interface BuilderMaterial {
  key: string;
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
}

export function applyMaterialToDecor(item: DecorItemSpec, material: BuilderMaterial): DecorItemSpec {
  if (item.type === "group" && item.children?.length) {
    return {
      ...item,
      children: item.children.map((child) => applyMaterialToDecor(child, material)),
    };
  }
  return {
    ...item,
    color: material.color,
    roughness: material.roughness,
    metalness: material.metalness,
    ...(material.emissive !== undefined ? { emissive: material.emissive } : {}),
    ...(material.emissiveIntensity !== undefined ? { emissiveIntensity: material.emissiveIntensity } : {}),
  };
}

export function applyMaterialToRefs(
  mapData: MapData,
  refs: readonly BuilderSelectionRef[],
  material: BuilderMaterial,
): MapData {
  const { decorIds } = splitSelectionRefs(refs);
  if (decorIds.size === 0) return mapData;
  return {
    ...mapData,
    decor: mapData.decor.map((item) => (item.id && decorIds.has(item.id) ? applyMaterialToDecor(item, material) : item)),
  };
}

export function applyFloorMaterial(mapData: MapData, materialKey: string, tileSize: number): MapData {
  const size = tileSize || 1;
  const { floor } = mapData.environment;
  return {
    ...mapData,
    environment: {
      ...mapData.environment,
      floorMaterial: materialKey,
      floorRepeat: [floor.width / size, floor.depth / size],
    },
  };
}

export function applyWallMaterial(mapData: MapData, materialKey: string, materialColor: string): MapData {
  return {
    ...mapData,
    environment: {
      ...mapData.environment,
      wallMaterial: materialKey,
      wallColor: materialColor,
    },
  };
}

export function moveSelection(
  mapData: MapData,
  refs: readonly BuilderSelectionRef[],
  delta: { dx: number; dy: number; dz: number },
  snapToGrid: boolean,
): MapData {
  const grid = getMapGrid(mapData);
  const { decorIds, wallIndexes } = splitSelectionRefs(refs);
  const { dx, dy, dz } = delta;

  const decor = mapData.decor.map((item) => {
    if (!item.id || !decorIds.has(item.id)) return item;
    const [x0, y0, z0] = getDecorWorldPosition(item, grid);
    const next = cloneSpec(item);
    delete next.gridX;
    delete next.gridZ;
    if (snapToGrid) {
      const footprint = getDecorFootprint(item, grid);
      const snapped = snapWorldToGrid(grid, x0 + dx, z0 + dz, footprint);
      next.position = [snapped.worldX, y0 + dy, snapped.worldZ];
    } else {
      next.position = [roundCoord(x0 + dx), roundCoord(y0 + dy), roundCoord(z0 + dz)];
    }
    return next;
  });

  const walls = mapData.walls.map((wall, index) => {
    if (!wallIndexes.has(index)) return wall;
    const nextX = wall.position[0] + dx;
    const nextZ = wall.position[2] + dz;
    return {
      ...wall,
      position: [
        snapToGrid ? Math.round(nextX / grid.tileSize) * grid.tileSize : roundCoord(nextX),
        roundCoord(wall.position[1] + dy),
        snapToGrid ? Math.round(nextZ / grid.tileSize) * grid.tileSize : roundCoord(nextZ),
      ] as [number, number, number],
    };
  });

  return { ...mapData, decor, walls };
}

export function rotateSelection90(mapData: MapData, refs: readonly BuilderSelectionRef[]): MapData {
  const { decorIds, wallIndexes } = splitSelectionRefs(refs);
  const decor = mapData.decor.map((item) => {
    if (!item.id || !decorIds.has(item.id)) return item;
    if (item.gridRotation !== undefined) {
      return { ...item, gridRotation: (((item.gridRotation + 1) % 4) as 0 | 1 | 2 | 3) };
    }
    const rotation = item.rotation ?? [0, 0, 0];
    return { ...item, rotation: [rotation[0], rotation[1] + Math.PI / 2, rotation[2]] as [number, number, number] };
  });
  const walls = mapData.walls.map((wall, index) => {
    if (!wallIndexes.has(index)) return wall;
    return {
      ...wall,
      args: [wall.args[2], wall.args[1], wall.args[0]] as [number, number, number],
    };
  });
  return { ...mapData, decor, walls };
}

export function duplicateSelection(
  mapData: MapData,
  refs: readonly BuilderSelectionRef[],
  offset: [number, number, number],
): { mapData: MapData; selectedRefs: BuilderSelectionRef[] } {
  const grid = getMapGrid(mapData);
  const { decorIds, wallIndexes } = splitSelectionRefs(refs);
  const next = cloneSpec(mapData);
  const selectedRefs: BuilderSelectionRef[] = [];

  for (const item of mapData.decor) {
    if (!item.id || !decorIds.has(item.id)) continue;
    const [x, y, z] = getDecorWorldPosition(item, grid);
    const duplicate = cloneSpec(item);
    duplicate.id = nextUniqueDecorId(next, `${item.id}_copy`);
    delete duplicate.gridX;
    delete duplicate.gridZ;
    duplicate.position = [
      roundCoord(x + offset[0]),
      roundCoord(y + offset[1]),
      roundCoord(z + offset[2]),
    ];
    next.decor.push(duplicate);
    selectedRefs.push({ kind: "decor", id: duplicate.id });
  }

  for (const [index, wall] of mapData.walls.entries()) {
    if (!wallIndexes.has(index)) continue;
    next.walls.push({
      ...wall,
      args: [...wall.args] as [number, number, number],
      position: [
        roundCoord(wall.position[0] + offset[0]),
        roundCoord(wall.position[1] + offset[1]),
        roundCoord(wall.position[2] + offset[2]),
      ] as [number, number, number],
    });
    selectedRefs.push({ kind: "wall", index: next.walls.length - 1 });
  }

  return { mapData: next, selectedRefs };
}

export function deleteRefs(mapData: MapData, refs: readonly BuilderSelectionRef[]): MapData {
  const { decorIds, wallIndexes } = splitSelectionRefs(refs);
  return {
    ...mapData,
    decor: mapData.decor.filter((item) => !item.id || !decorIds.has(item.id)),
    walls: mapData.walls.filter((_, index) => !wallIndexes.has(index)),
  };
}

/** Collapse a mixed selection into one group decor item (walls become boxes). */
export function buildGroupFromSelection(
  assets: BuilderAssetContext,
  mapData: MapData,
  selectedRefs: readonly BuilderSelectionRef[],
  groupId: string,
  materialColor: string,
): DecorItemSpec | null {
  const bounds = selectionBounds(assets, mapData, selectedRefs);
  if (!bounds) return null;

  const grid = getMapGrid(mapData);
  const originX = roundCoord((bounds.minX + bounds.maxX) / 2);
  const originZ = roundCoord((bounds.minZ + bounds.maxZ) / 2);
  const { decorIds, wallIndexes } = splitSelectionRefs(selectedRefs);

  const children: DecorItemSpec[] = [];
  for (const item of mapData.decor) {
    if (!item.id || !decorIds.has(item.id)) continue;
    const [worldX, worldY, worldZ] = getDecorWorldPosition(item, grid);
    const child = cloneSpec(item);
    delete child.gridX;
    delete child.gridZ;
    child.position = [roundCoord(worldX - originX), roundCoord(worldY), roundCoord(worldZ - originZ)];
    children.push(child);
  }

  for (const [index, wall] of mapData.walls.entries()) {
    if (!wallIndexes.has(index)) continue;
    children.push({
      id: `wall_${index}`,
      type: "box",
      args: [...wall.args],
      position: [
        roundCoord(wall.position[0] - originX),
        roundCoord(wall.position[1]),
        roundCoord(wall.position[2] - originZ),
      ],
      color: materialColor,
      roughness: 0.78,
      metalness: 0.05,
      castShadow: true,
      receiveShadow: true,
    });
  }

  if (children.length === 0) return null;
  const group: DecorItemSpec = {
    id: groupId,
    type: "group",
    footprint: computeFootprintFromBounds(bounds, grid),
    position: [originX, 0, originZ],
    children,
    castShadow: true,
    receiveShadow: true,
  };
  const groupBounds = getDecorItemBounds(group, grid);
  if (groupBounds) {
    group.footprint = computeFootprintFromBounds(groupBounds, grid);
  }
  return group;
}

/** Replace the selection with the group built from it ("glue"). */
export function glueSelection(
  assets: BuilderAssetContext,
  mapData: MapData,
  selectedRefs: readonly BuilderSelectionRef[],
  groupId: string,
  materialColor: string,
): { mapData: MapData; group: DecorItemSpec } | null {
  const group = buildGroupFromSelection(assets, mapData, selectedRefs, groupId, materialColor);
  if (!group) return null;

  const { decorIds, wallIndexes } = splitSelectionRefs(selectedRefs);
  return {
    mapData: {
      ...mapData,
      decor: [
        ...mapData.decor.filter((item) => !item.id || !decorIds.has(item.id)),
        group,
      ],
      walls: mapData.walls.filter((_, index) => !wallIndexes.has(index)),
    },
    group,
  };
}

/** Expand a group back into world-space children in place of the group. */
export function ungroupDecor(
  mapData: MapData,
  groupId: string,
): { mapData: MapData; children: DecorItemSpec[] } | null {
  const groupIndex = mapData.decor.findIndex((item) => item.id === groupId);
  const group = mapData.decor[groupIndex];
  if (!group || group.type !== "group" || !group.children?.length) return null;

  const grid = getMapGrid(mapData);
  const [groupX, groupY, groupZ] = getDecorWorldPosition(group, grid);
  const rotationY = getDecorRotation(group)?.[1] ?? 0;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const usedIds = new Set(
    mapData.decor
      .filter((_, index) => index !== groupIndex)
      .map((item) => item.id)
      .filter((id): id is string => id !== undefined),
  );
  const children = group.children.map((child, index) => {
    const local = child.position ?? [0, 0, 0];
    const worldX = groupX + local[0] * cos - local[2] * sin;
    const worldZ = groupZ + local[0] * sin + local[2] * cos;
    const childRotation = child.rotation ?? [0, 0, 0];
    let id = child.id ?? `${groupId}_child_${index + 1}`;
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}_${suffix}`)) suffix += 1;
      id = `${id}_${suffix}`;
    }
    usedIds.add(id);
    const nextChild = cloneSpec(child);
    delete nextChild.gridX;
    delete nextChild.gridZ;
    return {
      ...nextChild,
      id,
      position: [roundCoord(worldX), roundCoord(groupY + local[1]), roundCoord(worldZ)] as [number, number, number],
      rotation: [childRotation[0], childRotation[1] + rotationY, childRotation[2]] as [number, number, number],
    };
  });

  return {
    mapData: {
      ...mapData,
      decor: [
        ...mapData.decor.slice(0, groupIndex),
        ...children,
        ...mapData.decor.slice(groupIndex + 1),
      ],
    },
    children,
  };
}
