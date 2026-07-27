import type { GameContext } from "../runtime/gameContext";
import { perContext } from "../runtime/perContext";
import { resolveColliders, type ResolvedCollider } from "../scene/colliders";
import type { EntityPosition } from "../scene/entityStore";
import {
  DEFAULT_OBSTACLE_PLAYER_RADIUS,
  resolveObstacleStep,
  type CollisionObstacle,
} from "./movementModel";

/**
 * Broadphase reach floor (XZ): the `inBox` query indexes objects by their center *point*, so the query
 * must extend past the walker by at least the largest blocking-collider extent or a wide object's edge
 * is missed. Floored so default unit boxes stay covered.
 */
const OBSTACLE_MAX_HALF_EXTENT = 4;
/**
 * Hard cap on XZ broadphase reach. City lots ~12-17 m footprint need ~17-20 m after yaw expansion;
 * beyond that we refuse to grow the query into a city-wide box (and rely on the outer AABB of each
 * solid still blocking once its *center* is in range).
 */
const OBSTACLE_HORIZONTAL_CAP = 22;
/**
 * Vertical broadphase floor/cap. A walker only needs nearby ground props / step-ups — never full tower
 * height. Using building height for Y was the Vice Isle pose killer: a 50 m tower turned `inBox` into
 * a 100^3 empty cell walk every frame.
 */
const OBSTACLE_VERTICAL_FLOOR = 3;
const OBSTACLE_VERTICAL_CAP = 8;
/**
 * Mesh compound `boxes` under this count are treated as intentional openings (archways). Above it we
 * walk against the outer fitted AABB only — solid city buildings often ship dense box soups that
 * multiply narrowphase cost without changing the blocked footprint.
 */
const MOVEMENT_MESH_BOX_BUDGET = 12;
/** Feet-to-head span a walker is tested over — matches the player's, so both agree on what a wall is. */
const WALKER_HEIGHT = 1.8;

/** Largest blocking-collider extent in the scene, split so tower height cannot inflate the XZ query. */
export interface ObstacleReach {
  /** Max XZ center-to-face distance of any blocking collider (capped). */
  horizontal: number;
  /** Max vertical center-to-face distance of any blocking collider (capped, much tighter than H). */
  vertical: number;
}

/**
 * The slice of the scene's object store this query needs. Narrow on purpose: the scene context wires
 * its own store here while it is still being constructed, and `ctx.scene.object` satisfies it as-is.
 * @internal
 */
export interface SolidObstacleSource {
  list(): readonly { instanceId: string; position: EntityPosition; rotationY: number }[];
  inBox(
    min: EntityPosition,
    max: EntityPosition,
  ): readonly { instanceId: string; position: EntityPosition; rotationY: number }[];
  collidersOf(instanceId: string): Parameters<typeof resolveColliders>[0] | null;
}

/** Mutable reach cache; one per source, invalidated by object count. @internal */
export interface ObstacleReachCache {
  count: number;
  value: ObstacleReach;
}

/** A fresh {@link ObstacleReachCache} for a caller that owns its own source. @internal */
export function createObstacleReachCache(): ObstacleReachCache {
  return { count: -1, value: { horizontal: OBSTACLE_MAX_HALF_EXTENT, vertical: OBSTACLE_VERTICAL_FLOOR } };
}

const reachCache = perContext(() => createObstacleReachCache());

/**
 * Largest blocking reach in the scene, split into horizontal vs vertical and hard-capped. Cached per
 * ctx and recomputed when the object count changes — the broadphase box every consumer inflates by, so
 * a wall wider than the query box can never be missed.
 * @internal
 */
export function solidObstacleReach(ctx: GameContext): ObstacleReach {
  return sourceObstacleReach(ctx.scene.object, reachCache(ctx));
}

/** {@link solidObstacleReach} against a bare source and caller-owned cache. @internal */
export function sourceObstacleReach(source: SolidObstacleSource, cache: ObstacleReachCache): ObstacleReach {
  const objects = source.list();
  if (cache.count === objects.length) return cache.value;
  let horizontal = OBSTACLE_MAX_HALF_EXTENT;
  let vertical = OBSTACLE_VERTICAL_FLOOR;
  for (const object of objects) {
    const set = source.collidersOf(object.instanceId);
    if (set === null) continue;
    for (const collider of resolveColliders(set)) {
      if (!collider.blocks || collider.purpose !== "physical") continue;
      const shape = collider.shape;
      const offset = shape.offset;
      const ox = offset !== undefined ? Math.abs(offset[0]) : 0;
      const oy = offset !== undefined ? Math.abs(offset[1]) : 0;
      const oz = offset !== undefined ? Math.abs(offset[2]) : 0;
      if (shape.kind === "sphere") {
        horizontal = Math.max(horizontal, ox + oz + shape.radius);
        vertical = Math.max(vertical, oy + shape.radius);
      } else {
        // Horizontal bound sums both axes so any yaw of the box stays covered.
        const h = shape.halfExtents;
        horizontal = Math.max(horizontal, ox + oz + h[0] + h[2]);
        vertical = Math.max(vertical, oy + h[1]);
      }
    }
  }
  const value: ObstacleReach = {
    horizontal: Math.min(horizontal, OBSTACLE_HORIZONTAL_CAP),
    vertical: Math.min(vertical, OBSTACLE_VERTICAL_CAP),
  };
  cache.count = objects.length;
  cache.value = value;
  return value;
}

/** Yaw-rotate an entity-local AABB about the object origin and re-fit it to an axis-aligned box, expressed
 * as `min`/`max` relative to `position`. Conservative: the rotated box is grown to its enclosing AABB. */
function yawExpandLocalBox(
  boxMin: readonly [number, number, number],
  boxMax: readonly [number, number, number],
  cos: number,
  sin: number,
): { min: [number, number, number]; max: [number, number, number] } {
  const centerX = (boxMin[0] + boxMax[0]) / 2;
  const centerY = (boxMin[1] + boxMax[1]) / 2;
  const centerZ = (boxMin[2] + boxMax[2]) / 2;
  const halfX = (boxMax[0] - boxMin[0]) / 2;
  const halfY = (boxMax[1] - boxMin[1]) / 2;
  const halfZ = (boxMax[2] - boxMin[2]) / 2;
  const rcX = centerX * cos + centerZ * sin;
  const rcZ = -centerX * sin + centerZ * cos;
  const rhX = Math.abs(halfX * cos) + Math.abs(halfZ * sin);
  const rhZ = Math.abs(halfX * sin) + Math.abs(halfZ * cos);
  return {
    min: [rcX - rhX, centerY - halfY, rcZ - rhZ],
    max: [rcX + rhX, centerY + halfY, rcZ + rhZ],
  };
}

/** One blocking collider as a {@link CollisionObstacle}: a compound `boxes` obstacle for a mesh collider
 * carrying a small sub-box set (openings), else a single half-extents/offset AABB. Yaw is applied by
 * conservatively expanding each AABB to its rotated extent (mirroring `worldOffset`), so the obstruction
 * never under-covers.
 * @internal */
export function obstacleFromCollider(
  collider: ResolvedCollider,
  position: EntityPosition,
  rotationY: number,
): CollisionObstacle {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const shape = collider.shape;
  // Dense compound soups (city buildings) collapse to the outer fitted AABB for movement — openings
  // only stay mesh-box accurate when the box count is small (arches, doorways).
  if (
    shape.kind === "mesh" &&
    shape.boxes !== undefined &&
    shape.boxes.length > 0 &&
    shape.boxes.length <= MOVEMENT_MESH_BOX_BUDGET
  ) {
    return {
      position,
      boxes: shape.boxes.map((b) => yawExpandLocalBox(b.min, b.max, cos, sin)),
    };
  }
  let hx: number;
  let hy: number;
  let hz: number;
  if (shape.kind === "sphere") {
    hx = hy = hz = shape.radius;
  } else {
    hx = shape.halfExtents[0];
    hy = shape.halfExtents[1];
    hz = shape.halfExtents[2];
  }
  const offset = shape.offset;
  const ox = offset !== undefined ? offset[0] : 0;
  const oy = offset !== undefined ? offset[1] : 0;
  const oz = offset !== undefined ? offset[2] : 0;
  return {
    position,
    // Rotate the offset by yaw (mirror of colliders.worldOffset), expand the extents to the rotated AABB.
    offset: [ox * cos + oz * sin, oy, -ox * sin + oz * cos],
    halfExtents: [Math.abs(hx * cos) + Math.abs(hz * sin), hy, Math.abs(hx * sin) + Math.abs(hz * cos)],
  };
}

/**
 * Every blocking physical obstacle overlapping the box `position` ± `reachX`/`reachZ`, read from the
 * scene's resolved colliders.
 *
 * This is the engine's single answer to "what is solid here". The player resolver, a walking NPC, and
 * anything else that has to stop at a wall read it rather than deriving their own set — three
 * divergent notions of solid (engine colliders / game catalog flags / nothing at all) is what let a
 * pedestrian stroll through the building the player cannot enter.
 *
 * @capability solid-obstacles the one blocking-geometry query the player resolver and NPC movers share
 */
export function solidObstaclesNear(
  ctx: GameContext,
  position: EntityPosition,
  reachX: number,
  reachZ: number,
  height = WALKER_HEIGHT,
): CollisionObstacle[] {
  return sourceObstaclesNear(ctx.scene.object, solidObstacleReach(ctx), position, reachX, reachZ, height);
}

/** {@link solidObstaclesNear} against a bare source and an already-resolved reach. @internal */
export function sourceObstaclesNear(
  source: SolidObstacleSource,
  reach: ObstacleReach,
  position: EntityPosition,
  reachX: number,
  reachZ: number,
  height = WALKER_HEIGHT,
): CollisionObstacle[] {
  const min: EntityPosition = [
    position[0] - reachX - reach.horizontal,
    position[1] - reach.vertical,
    position[2] - reachZ - reach.horizontal,
  ];
  const max: EntityPosition = [
    position[0] + reachX + reach.horizontal,
    position[1] + height + reach.vertical,
    position[2] + reachZ + reach.horizontal,
  ];
  const obstacles: CollisionObstacle[] = [];
  for (const object of source.inBox(min, max)) {
    const set = source.collidersOf(object.instanceId);
    if (set === null) {
      // No resolved collider: preserve the default 1×1×1 box.
      obstacles.push({ position: object.position });
      continue;
    }
    for (const collider of resolveColliders(set)) {
      if (!collider.blocks || collider.purpose !== "physical") continue;
      obstacles.push(obstacleFromCollider(collider, object.position, object.rotationY));
    }
  }
  return obstacles;
}

/**
 * Slide a walker's horizontal step against the same solid geometry that stops the player, returning the
 * X/Z it may actually take this tick. A step into a wall is cut on the blocked axis and preserved on the
 * other, exactly as {@link stepPlayerMovement} resolves the player's.
 *
 * Bounded by the same broadphase as the player's gather: one `inBox` query sized to this step, never a
 * full-world scan, so it stays affordable per NPC per tick.
 *
 * @capability walker-solid-step slide an NPC's step against the geometry that blocks the player
 */
export function resolveWalkerStep(
  ctx: GameContext,
  position: EntityPosition,
  stepX: number,
  stepZ: number,
  options: { radius?: number; stepUpHeight?: number } = {},
): { stepX: number; stepZ: number } {
  if (stepX === 0 && stepZ === 0) return { stepX, stepZ };
  const radius = options.radius ?? DEFAULT_OBSTACLE_PLAYER_RADIUS;
  const obstacles = solidObstaclesNear(ctx, position, Math.abs(stepX) + radius, Math.abs(stepZ) + radius);
  return slideStep(position, stepX, stepZ, obstacles, radius, options.stepUpHeight ?? 0);
}

/** {@link resolveWalkerStep} against an already-gathered obstacle set. @internal */
export function slideStep(
  position: EntityPosition,
  stepX: number,
  stepZ: number,
  obstacles: readonly CollisionObstacle[],
  radius = DEFAULT_OBSTACLE_PLAYER_RADIUS,
  stepUpHeight = 0,
): { stepX: number; stepZ: number } {
  if (obstacles.length === 0) return { stepX, stepZ };
  return resolveObstacleStep(position, stepX, stepZ, obstacles, radius, stepUpHeight);
}
