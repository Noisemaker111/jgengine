import { pointInTelegraph } from "@jgengine/core/combat/telegraph";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

export interface WallSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export const SNEAK_RADIUS_FACTOR = 0.55;

function orientation(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const value = (bz - az) * (cx - bx) - (bx - ax) * (cz - bz);
  if (value > 1e-9) return 1;
  if (value < -1e-9) return -1;
  return 0;
}

function onSegment(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): boolean {
  return (
    Math.min(ax, bx) - 1e-9 <= cx &&
    cx <= Math.max(ax, bx) + 1e-9 &&
    Math.min(az, bz) - 1e-9 <= cz &&
    cz <= Math.max(az, bz) + 1e-9
  );
}

function segmentsIntersect(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): boolean {
  const o1 = orientation(ax, az, bx, bz, cx, cz);
  const o2 = orientation(ax, az, bx, bz, dx, dz);
  const o3 = orientation(cx, cz, dx, dz, ax, az);
  const o4 = orientation(cx, cz, dx, dz, bx, bz);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(ax, az, bx, bz, cx, cz)) return true;
  if (o2 === 0 && onSegment(ax, az, bx, bz, dx, dz)) return true;
  if (o3 === 0 && onSegment(cx, cz, dx, dz, ax, az)) return true;
  if (o4 === 0 && onSegment(cx, cz, dx, dz, bx, bz)) return true;
  return false;
}

/**
 * Hand-rolled wall-occlusion test: no engine primitive filters `revealQuery`
 * or `frustumSensor` by 2D wall geometry (both are unfiltered-radius /
 * 3D-camera shaped). This is the game-side gap those two were checked
 * against first — see the gap report.
 */
export function hasLineOfSight(from: EntityPosition, to: EntityPosition, walls: readonly WallSegment[]): boolean {
  for (const wall of walls) {
    if (segmentsIntersect(from[0], from[2], to[0], to[2], wall.x1, wall.z1, wall.x2, wall.z2)) return false;
  }
  return true;
}

export interface VisionCheckInput {
  observerPosition: EntityPosition;
  observerHeading: number;
  visionRadius: number;
  visionAngleDeg: number;
  targetPosition: EntityPosition;
  walls: readonly WallSegment[];
  sneaking: boolean;
}

export function isPointDetected(input: VisionCheckInput): boolean {
  const radius = input.sneaking ? input.visionRadius * SNEAK_RADIUS_FACTOR : input.visionRadius;
  const inCone = pointInTelegraph(
    {
      shape: { kind: "cone", radius, angle: (input.visionAngleDeg * Math.PI) / 180 },
      at: input.observerPosition,
      dir: input.observerHeading,
    },
    input.targetPosition,
  );
  if (!inCone) return false;
  return hasLineOfSight(input.observerPosition, input.targetPosition, input.walls);
}
