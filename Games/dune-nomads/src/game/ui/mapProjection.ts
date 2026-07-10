import type { MinimapView } from "@jgengine/core/world/minimap";

export interface WorldPoint {
  x: number;
  z: number;
}

export function unprojectFromMinimap(px: number, py: number, view: MinimapView): WorldPoint {
  const half = view.size / 2;
  const scale = view.worldRadius === 0 ? 0 : half / view.worldRadius;
  if (scale === 0) return { x: view.center[0], z: view.center[1] };
  const dx = (px - half) / scale;
  const dz = (py - half) / scale;
  return { x: view.center[0] + dx, z: view.center[1] + dz };
}

export function windBearingRad(vector: readonly [number, number]): number {
  return Math.atan2(vector[0], -vector[1]);
}
