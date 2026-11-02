export interface WorldPoint {
  x: number;
  z: number;
}

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const TILE_SIZE = 1; // meters

export const PLAYER_COLLISION_RADIUS = 0.45;

export function squaredDistance2d(a: WorldPoint, b: WorldPoint): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

export interface GridFootprint {
  width: number;
  depth: number;
}
