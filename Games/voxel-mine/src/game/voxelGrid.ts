import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createVoxelField, VOXEL_FACE_NORMALS } from "@jgengine/core/world/voxelField";

export type Vec3 = [number, number, number];

export interface VoxelHit {
  cell: Vec3;
  normal: Vec3;
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export interface VoxelGrid {
  set(catalogId: string, x: number, y: number, z: number): boolean;
  remove(x: number, y: number, z: number): boolean;
  has(x: number, y: number, z: number): boolean;
  catalogAt(x: number, y: number, z: number): string | null;
  count(): number;
  raycast(origin: Vec3, direction: Vec3, maxDistance: number): VoxelHit | null;
}

export function createVoxelGrid(ctx: GameContext): VoxelGrid {
  const field = createVoxelField();
  const instances = new Map<string, string>();

  return {
    set(catalogId, x, y, z) {
      if (field.has(x, y, z)) return false;
      const instanceId = ctx.scene.object.place(catalogId, x, y, z);
      instances.set(cellKey(x, y, z), instanceId);
      field.set(x, y, z, catalogId);
      return true;
    },
    remove(x, y, z) {
      const key = cellKey(x, y, z);
      const instanceId = instances.get(key);
      if (instanceId === undefined) return false;
      ctx.scene.object.remove(instanceId);
      instances.delete(key);
      field.remove(x, y, z);
      return true;
    },
    has(x, y, z) {
      return field.has(x, y, z);
    },
    catalogAt(x, y, z) {
      const instanceId = cells.get(cellKey(x, y, z));
      if (instanceId === undefined) return null;
      return ctx.scene.object.get(instanceId)?.catalogId ?? null;
    },
    count() {
      return field.count();
    },
    raycast(origin, direction, maxDistance) {
      const hit = field.raycast([origin[0] + 0.5, origin[1], origin[2] + 0.5], direction, maxDistance);
      if (hit === null) return null;
      const normal = hit.distance === 0 ? ([0, 0, 0] as Vec3) : ([...VOXEL_FACE_NORMALS[hit.face]] as Vec3);
      return { cell: [hit.x, hit.y, hit.z], normal };
    },
  };
}
