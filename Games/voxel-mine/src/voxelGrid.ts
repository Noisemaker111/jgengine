import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { raycastVoxel, type Vec3, type VoxelHit } from "./raycast";

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
  const cells = new Map<string, string>();

  return {
    set(catalogId, x, y, z) {
      const key = cellKey(x, y, z);
      if (cells.has(key)) return false;
      const instanceId = ctx.scene.object.place(catalogId, x, y, z);
      cells.set(key, instanceId);
      return true;
    },
    remove(x, y, z) {
      const key = cellKey(x, y, z);
      const instanceId = cells.get(key);
      if (instanceId === undefined) return false;
      ctx.scene.object.remove(instanceId);
      cells.delete(key);
      return true;
    },
    has(x, y, z) {
      return cells.has(cellKey(x, y, z));
    },
    catalogAt(x, y, z) {
      const instanceId = cells.get(cellKey(x, y, z));
      if (instanceId === undefined) return null;
      return ctx.scene.object.get(instanceId)?.catalogId ?? null;
    },
    count() {
      return cells.size;
    },
    raycast(origin, direction, maxDistance) {
      const latticeOrigin: Vec3 = [origin[0] + 0.5, origin[1], origin[2] + 0.5];
      return raycastVoxel((x, y, z) => cells.has(cellKey(x, y, z)), latticeOrigin, direction, maxDistance);
    },
  };
}
