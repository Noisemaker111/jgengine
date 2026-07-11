import { hasWallLineOfSight, pointInCone, type VisionWall } from "@jgengine/core/sensor/visionCone";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

export interface WallSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export const SNEAK_RADIUS_FACTOR = 0.55;

function toVisionWalls(walls: readonly WallSegment[]): VisionWall[] {
  return walls.map((wall) => ({ from: [wall.x1, wall.z1] as const, to: [wall.x2, wall.z2] as const }));
}

export function hasLineOfSight(from: EntityPosition, to: EntityPosition, walls: readonly WallSegment[]): boolean {
  return hasWallLineOfSight([from[0], from[2]], [to[0], to[2]], toVisionWalls(walls));
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
  const inCone = pointInCone(
    [input.observerPosition[0], input.observerPosition[2]],
    input.observerHeading,
    { range: radius, angle: (input.visionAngleDeg * Math.PI) / 180 },
    [input.targetPosition[0], input.targetPosition[2]],
  );
  if (!inCone) return false;
  return hasLineOfSight(input.observerPosition, input.targetPosition, input.walls);
}
