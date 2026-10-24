import { intersectAabb } from "../scene/objectQuery";
import type { WorldSolid, WorldSolids } from "../world/worldSolids";

/** The indexing floor a sight test needs from world collision: boxes, narrowed by a ray when available. */
export type SightSolids = Pick<WorldSolids, "inBox"> & Partial<Pick<WorldSolids, "inRay">>;

/** One world point in `[x, y, z]` order, as a sight test takes it. */
export type SightPoint = readonly [number, number, number];

function solidAlong(solid: WorldSolid, origin: SightPoint, direction: SightPoint, maxDistance: number): boolean {
  const cos = Math.cos(solid.rotationY ?? 0);
  const sin = Math.sin(solid.rotationY ?? 0);
  const x = origin[0] - solid.center[0];
  const z = origin[2] - solid.center[2];
  const [hx, hy, hz] = solid.halfExtents;
  const hit = intersectAabb(
    [x * cos - z * sin, origin[1] - solid.center[1], x * sin + z * cos],
    [direction[0] * cos - direction[2] * sin, direction[1], direction[0] * sin + direction[2] * cos],
    [-hx, -hy, -hz],
    [hx, hy, hz],
    maxDistance,
  );
  // A solid the observer stands inside cannot lie between eye and target; blocking on it would blind everyone indoors.
  return hit !== null && hit.distance > 1e-6;
}

/**
 * True when a world solid stands on the straight line from `from` to `to` — the occlusion test a
 * sight check needs, against the same collision set movement and bullets use.
 *
 * One bounded query and a box test per candidate; the candidate set is the world's own hash grid,
 * so far apart points cost nothing extra.
 *
 * @capability sight-line block a sight test behind the world's own collision boxes
 */
export function sightLineBlocked(solids: SightSolids, from: SightPoint, to: SightPoint): boolean {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 0) || !Number.isFinite(length)) return false;
  const direction: SightPoint = [dx / length, dy / length, dz / length];
  let candidates: readonly WorldSolid[];
  if (solids.inRay !== undefined) {
    candidates = solids.inRay(from, direction, length);
  } else {
    candidates = solids.inBox(
      [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.min(from[2], to[2])],
      [Math.max(from[0], to[0]), Math.max(from[1], to[1]), Math.max(from[2], to[2])],
    );
  }
  for (const solid of candidates) if (solidAlong(solid, from, direction, length)) return true;
  return false;
}
