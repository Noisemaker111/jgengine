// @skill jgengine-world
import {
  aabbContains,
  aabbOverlap,
  footprintAabb,
  snapToGrid,
  type Aabb,
  type Footprint,
  type Vec2,
} from "../world/geometry";

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
  snap?: number | undefined;
  /** Authoritative ownership/claim validation for this footprint. */
  territory?: (aabb: Aabb) => { ok: boolean };
}

/** Why a placement was refused; shared by {@link validatePlacement} and {@link validatePlacementBounds}. */
export type PlacementRejection =
  | { status: "rejected"; reason: "out-of-bounds" }
  | { status: "rejected"; reason: "territory.blocked" }
  | { status: "rejected"; reason: "overlap"; obstacle: PlacementObstacle; index: number };

export type PlacementResult = { status: "ok"; center: Vec2; aabb: Aabb } | PlacementRejection;

/** The rules {@link validatePlacementBounds} checks: everything in {@link PlacementRules} but the snap. */
export type PlacementBoundsRules = Omit<PlacementRules, "snap">;

/** {@link validatePlacementBounds}'s verdict: the checked bounds, or why they were refused. */
export type PlacementBoundsResult = { status: "ok"; aabb: Aabb } | PlacementRejection;

/**
 * Footprint validity: bounds + obstacle overlap after optional grid snap.
 * @capability placement-math grid/surface footprint validity for build mode
 */
export function validatePlacement(request: PlacementRequest, rules: PlacementRules = {}): PlacementResult {
  const center = rules.snap === undefined ? request.center : snapToGrid(request.center, rules.snap);
  const result = validatePlacementBounds(footprintAabb(center, request.footprint, request.quarterTurns ?? 0), rules);
  return result.status === "ok" ? { status: "ok", center, aabb: result.aabb } : result;
}

/**
 * The same bounds, overlap and territory checks as {@link validatePlacement}, for a footprint the game
 * has already resolved to world bounds, such as one measured from a model's mesh or off its pivot.
 * @capability placement-bounds validate already-resolved footprint bounds against bounds, obstacles and territory
 */
export function validatePlacementBounds(aabb: Aabb, rules: PlacementBoundsRules = {}): PlacementBoundsResult {
  if (rules.bounds !== undefined && !aabbContains(rules.bounds, aabb)) {
    return { status: "rejected", reason: "out-of-bounds" };
  }

  const obstacles = rules.obstacles ?? [];
  for (const [index, obstacle] of obstacles.entries()) {
    if (aabbOverlap(aabb, obstacle.aabb)) {
      return { status: "rejected", reason: "overlap", obstacle, index };
    }
  }

  if (rules.territory && !rules.territory(aabb).ok) return { status: "rejected", reason: "territory.blocked" };
  return { status: "ok", aabb };
}

export function footprintObstacle(request: PlacementRequest, id?: string): PlacementObstacle {
  const aabb = footprintAabb(request.center, request.footprint, request.quarterTurns ?? 0);
  return id === undefined ? { aabb } : { aabb, id };
}
