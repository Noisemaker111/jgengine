import type { EnvironmentWorldFeature } from "../world/features";
import type { Aabb } from "../world/geometry";
import { structureSolids, worldSolidFootprint, type WorldSolids } from "../world/worldSolids";

export interface NavObstacleGrid {
  blockAabb(aabb: Aabb): void;
}

/**
 * Blocks the footprint of every solid building an environment feature's `structures` generate — the
 * same set `ctx.world.solids` holds for it. Returns the number of buildings blocked.
 */
export function populateNavGridFromEnvironment(grid: NavObstacleGrid, world: EnvironmentWorldFeature): number {
  const solids = structureSolids(world);
  for (const solid of solids) grid.blockAabb(worldSolidFootprint(solid));
  return solids.length;
}

/**
 * Blocks the XZ footprint of every solid in `solids` (usually `ctx.world.solids`) on `grid`, so NPC
 * paths avoid exactly what movement and physics collide with. Returns the number of solids blocked.
 * @capability nav-from-solids block world solids on a nav grid
 */
export function populateNavGridFromSolids(grid: NavObstacleGrid, solids: Pick<WorldSolids, "all">): number {
  const all = solids.all();
  for (const solid of all) grid.blockAabb(worldSolidFootprint(solid));
  return all.length;
}
