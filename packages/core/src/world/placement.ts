import {
  aabbContains,
  aabbOverlap,
  footprintAabb,
  snapToGrid,
  type Aabb,
  type Footprint,
  type Vec2,
} from "./geometry";

export interface PlacementObstacle {
  aabb: Aabb;
  id?: string;
}

export interface PlacementRequest {
  center: Vec2;
  footprint: Footprint;
  quarterTurns?: number;
}

export interface PlacementRules {
  bounds?: Aabb;
  obstacles?: readonly PlacementObstacle[];
  snap?: number;
}

export type PlacementResult =
  | { status: "ok"; center: Vec2; aabb: Aabb }
  | { status: "rejected"; reason: "out-of-bounds" }
  | { status: "rejected"; reason: "overlap"; obstacle: PlacementObstacle; index: number };

/**
 * Footprint validity: bounds + obstacle overlap after optional grid snap.
 * @capability placement-math grid/surface footprint validity for build mode
 */
export function validatePlacement(request: PlacementRequest, rules: PlacementRules = {}): PlacementResult {
  const center = rules.snap === undefined ? request.center : snapToGrid(request.center, rules.snap);
  const aabb = footprintAabb(center, request.footprint, request.quarterTurns ?? 0);

  if (rules.bounds !== undefined && !aabbContains(rules.bounds, aabb)) {
    return { status: "rejected", reason: "out-of-bounds" };
  }

  const obstacles = rules.obstacles ?? [];
  for (let index = 0; index < obstacles.length; index++) {
    const obstacle = obstacles[index]!;
    if (aabbOverlap(aabb, obstacle.aabb)) {
      return { status: "rejected", reason: "overlap", obstacle, index };
    }
  }

  return { status: "ok", center, aabb };
}

export function footprintObstacle(request: PlacementRequest, id?: string): PlacementObstacle {
  const aabb = footprintAabb(request.center, request.footprint, request.quarterTurns ?? 0);
  return id === undefined ? { aabb } : { aabb, id };
}
