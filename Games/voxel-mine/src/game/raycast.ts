export type Vec3 = [number, number, number];

export interface VoxelHit {
  cell: Vec3;
  normal: Vec3;
}

export type SolidQuery = (x: number, y: number, z: number) => boolean;

export function raycastVoxel(
  isSolid: SolidQuery,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
): VoxelHit | null {
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = direction;

  let ix = Math.floor(ox);
  let iy = Math.floor(oy);
  let iz = Math.floor(oz);

  if (isSolid(ix, iy, iz)) return { cell: [ix, iy, iz], normal: [0, 0, 0] };

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Number.POSITIVE_INFINITY;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Number.POSITIVE_INFINITY;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Number.POSITIVE_INFINITY;

  const boundary = (i: number, o: number, step: number): number => (step > 0 ? i + 1 - o : o - i);

  let tMaxX = dx !== 0 ? boundary(ix, ox, stepX) * tDeltaX : Number.POSITIVE_INFINITY;
  let tMaxY = dy !== 0 ? boundary(iy, oy, stepY) * tDeltaY : Number.POSITIVE_INFINITY;
  let tMaxZ = dz !== 0 ? boundary(iz, oz, stepZ) * tDeltaZ : Number.POSITIVE_INFINITY;

  let normal: Vec3 = [0, 0, 0];
  let travelled = 0;

  while (travelled <= maxDistance) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      ix += stepX;
      travelled = tMaxX;
      tMaxX += tDeltaX;
      normal = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      iy += stepY;
      travelled = tMaxY;
      tMaxY += tDeltaY;
      normal = [0, -stepY, 0];
    } else {
      iz += stepZ;
      travelled = tMaxZ;
      tMaxZ += tDeltaZ;
      normal = [0, 0, -stepZ];
    }
    if (travelled > maxDistance) break;
    if (isSolid(ix, iy, iz)) return { cell: [ix, iy, iz], normal };
  }

  return null;
}
