import type { RoomBounds } from "@llmville/game/world/grid";
import type { WallSegmentSpec } from "@llmville/game/world/mapTypes";

export const INTERACTION_TARGET_RADIUS = 2.0;
export const INTERACTION_DESK_RADIUS = 2.3;

export function boundsOverlap(left: RoomBounds, right: RoomBounds): boolean {
  return left.minX < right.maxX
    && left.maxX > right.minX
    && left.minZ < right.maxZ
    && left.maxZ > right.minZ;
}

export function boundsContainBounds(container: RoomBounds, inner: RoomBounds): boolean {
  return inner.minX >= container.minX
    && inner.maxX <= container.maxX
    && inner.minZ >= container.minZ
    && inner.maxZ <= container.maxZ;
}

/** Footprint AABB of one wall segment (ignores height). */
export function wallSegmentToBounds(wall: WallSegmentSpec): RoomBounds {
  const [width, , depth] = wall.args;
  const [x, , z] = wall.position;
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  };
}

export function wallSegmentsToColliders(walls: readonly WallSegmentSpec[]): RoomBounds[] {
  return walls.map(wallSegmentToBounds);
}
