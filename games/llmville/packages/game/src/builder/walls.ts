/**
 * Pure wall-segment geometry. A wall is drawn between two grid-snapped points;
 * the longer axis decides orientation. Both the interactive preview and the
 * committed edit derive their box from `computeWallSegment` so they never drift.
 */
import type { MapGridSpec } from "@llmville/game/world/grid";

export interface BuilderWallSegment {
  args: [number, number, number];
  position: [number, number, number];
}

export function computeWallSegment(
  wallHeight: number,
  wallThickness: number,
  grid: MapGridSpec,
  start: readonly [number, number],
  end: readonly [number, number],
): BuilderWallSegment {
  const [startX, startZ] = start;
  const dx = end[0] - startX;
  const dz = end[1] - startZ;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return {
      args: [Math.max(Math.abs(dx), grid.tileSize), wallHeight, wallThickness],
      position: [startX + dx / 2, wallHeight / 2, startZ],
    };
  }
  return {
    args: [wallThickness, wallHeight, Math.max(Math.abs(dz), grid.tileSize)],
    position: [startX, wallHeight / 2, startZ + dz / 2],
  };
}
