import type { EnvironmentWorldFeature } from "../world/features";
import type { Aabb } from "../world/geometry";
import { structureSolids, worldSolidFootprint, type WorldSolids } from "../world/worldSolids";

export interface NavObstacleGrid {
  blockAabb(aabb: Aabb): void;
}

export function populateNavGridFromEnvironment(grid: NavObstacleGrid, world: EnvironmentWorldFeature): number {
  const solids = structureSolids(world);
  for (const solid of solids) grid.blockAabb(worldSolidFootprint(solid));
  return solids.length;
}

/** @capability nav-from-solids block world solids on a nav grid */
export function populateNavGridFromSolids(grid: NavObstacleGrid, solids: Pick<WorldSolids, "all">): number {
  const all = solids.all();
  for (const solid of all) grid.blockAabb(worldSolidFootprint(solid));
  return all.length;
}
