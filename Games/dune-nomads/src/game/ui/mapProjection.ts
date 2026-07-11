import { unprojectFromMinimap as coreUnproject, type MinimapView } from "@jgengine/core/world/minimap";

export interface WorldPoint {
  x: number;
  z: number;
}

export function unprojectFromMinimap(px: number, py: number, view: MinimapView): WorldPoint {
  const [x, z] = coreUnproject({ x: px, y: py }, view);
  return { x, z };
}

export function windBearingRad(vector: readonly [number, number]): number {
  return Math.atan2(vector[0], -vector[1]);
}
