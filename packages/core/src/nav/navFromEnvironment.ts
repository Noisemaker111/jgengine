import { resolveStructureBuildings } from "../world/environmentSummary";
import type { EnvironmentWorldFeature } from "../world/features";
import type { Aabb } from "../world/geometry";

export interface NavObstacleGrid {
  blockAabb(aabb: Aabb): void;
}

/**
 * Expands every structure descriptor on an environment world feature into its
 * generated buildings and blocks their footprints on `grid`. Returns the
 * number of buildings blocked.
 */
export function populateNavGridFromEnvironment(grid: NavObstacleGrid, world: EnvironmentWorldFeature): number {
  let blocked = 0;
  for (const descriptor of world.structures ?? []) {
    for (const building of resolveStructureBuildings(descriptor)) {
      grid.blockAabb(building.bounds);
      blocked += 1;
    }
  }
  return blocked;
}
