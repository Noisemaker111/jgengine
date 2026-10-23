import type { GameContext } from "../runtime/gameContext";
import { perContext } from "../runtime/perContext";
import { resolveColliders, type ResolvedCollider } from "../scene/colliders";
import type { EntityPosition } from "../scene/entityStore";
import type { WorldSolid, WorldSolids } from "../world/worldSolids";
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
 * height. Using building height for Y was the Harbor Heat pose killer: a 50 m tower turned `inBox` into
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
/** Most AABB strips an oriented world solid is sliced into, bounding the corner overhang a yawed box leaves. */
const SOLID_MAX_STRIPS = 8;
/** Yaw within this of a quarter turn is treated as axis-aligned (radians). */
const AXIS_ALIGNED_EPSILON = 1e-4;
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
 * its own store here while it is still being constructed, `ctx.scene.object` satisfies it as-is, and a
 * pure rules package with no `GameContext` to import can satisfy it from its own object list.
 */
export interface SolidObstacleSource {
  /** Optional indexed world geometry that is not represented by scene objects. */
  solids?: Pick<WorldSolids, "count" | "inBox">;
  list(): readonly { instanceId: string; position: EntityPosition; rotationY: number }[];
  inBox(
    min: EntityPosition,
    max: EntityPosition,
  ): readonly { instanceId: string; position: EntityPosition; rotationY: number }[];
  collidersOf(instanceId: string): Parameters<typeof resolveColliders>[0] | null;
  /**
   * Bumps whenever membership, a position, a rotation or a collider set changes. A source that reports
   * one is indexed once per version instead of re-resolving every object on every query.
   */
  version?(): number;
}

/** A placed object's blocking geometry, resolved once per index build and shared read-only by queries. */
interface ObstacleGroup {
  x: number;
  y: number;
  z: number;
  obstacles: CollisionObstacle[];
}

/**
 * Version-keyed obstacle index: object centre → its prebuilt obstacles, bucketed in coarse XZ cells so
 * a city-scale movement box walks a few populated cells rather than every object in the world.
 */
interface ObstacleIndex {
  cells: Map<number, ObstacleGroup[]>;
  groups: ObstacleGroup[];
}

/** Mutable reach cache; one per source, invalidated by object count or by the source's version. */
export interface ObstacleReachCache {
  count: number;
  value: ObstacleReach;
  /** Version the value and index were built from; absent for a source that reports none. */
  version?: number | undefined;
  /** Built index, present only for a versioned source. */
  index?: ObstacleIndex | undefined;
}

/** A fresh {@link ObstacleReachCache} for a caller that owns its own source. */
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

/** {@link solidObstacleReach} against a bare source and caller-owned cache. */
export function sourceObstacleReach(source: SolidObstacleSource, cache: ObstacleReachCache): ObstacleReach {
  ensureSourceCache(source, cache);
  return cache.value;
}

/** Coarse XZ cell for the obstacle index: a movement box spans tens of metres, so 1 m cells would be
 * almost all empty lookups while a handful of these cover the whole query. */
const INDEX_CELL_SIZE = 16;
/** Beyond this many coarse cells a query walks the whole group list instead. */
const INDEX_CELL_VOLUME_LIMIT = 4096;
/** Two signed axis indices packed into one small-integer key (no string allocation, no boxing). */
const INDEX_KEY_RADIX = 32768;
const INDEX_KEY_BIAS = 16384;
const INDEX_KEY_LIMIT = 16384;

function indexCell(value: number): number {
  return Math.floor(value / INDEX_CELL_SIZE);
}

function indexKey(cx: number, cz: number): number {
  return (cx + INDEX_KEY_BIAS) * INDEX_KEY_RADIX + (cz + INDEX_KEY_BIAS);
}

/**
 * Refresh `cache` for `source`: one scan resolves the broadphase reach and, when the source reports a
 * version, every blocking object's obstacles into a coarse XZ index. A versioned source is scanned only
 * when that version changes, so a per-frame query costs index lookups instead of a world scan.
 */
function ensureSourceCache(source: SolidObstacleSource, cache: ObstacleReachCache): void {
  const version = source.version?.();
  if (version !== undefined) {
    if (cache.version === version && cache.index !== undefined) return;
    cache.version = version;
    cache.count = -1;
    cache.index = undefined;
    buildSourceCache(source, cache, source.list(), true);
    return;
  }
  const objects = source.list();
  if (cache.count === objects.length) return;
  cache.count = objects.length;
  cache.version = undefined;
  cache.index = undefined;
  buildSourceCache(source, cache, objects, false);
}

function buildSourceCache(
  source: SolidObstacleSource,
  cache: ObstacleReachCache,
  objects: readonly { instanceId: string; position: EntityPosition; rotationY: number }[],
  index: boolean,
): void {
  const groups: ObstacleGroup[] = index ? [] : EMPTY_GROUPS;
  const cells = index ? new Map<number, ObstacleGroup[]>() : null;
  let horizontal = OBSTACLE_MAX_HALF_EXTENT;
  let vertical = OBSTACLE_VERTICAL_FLOOR;
  for (const object of objects) {
    const set = source.collidersOf(object.instanceId);
    const obstacles: CollisionObstacle[] = [];
    if (set === null) {
      // No resolved collider: preserve the default 1×1×1 box.
      if (index) obstacles.push({ position: object.position });
    } else {
      for (const collider of resolveColliders(set)) {
        if (!collider.blocks || collider.purpose !== "physical") continue;
        const reach = blockingReach(collider);
        horizontal = Math.max(horizontal, reach[0]);
        vertical = Math.max(vertical, reach[1]);
        if (index) obstacles.push(obstacleFromCollider(collider, object.position, object.rotationY));
      }
    }
    if (!index || obstacles.length === 0) continue;
    const group: ObstacleGroup = {
      x: object.position[0],
      y: object.position[1],
      z: object.position[2],
      obstacles,
    };
    groups.push(group);
    const cx = indexCell(group.x);
    const cz = indexCell(group.z);
    if (cx <= -INDEX_KEY_LIMIT || cx >= INDEX_KEY_LIMIT || cz <= -INDEX_KEY_LIMIT || cz >= INDEX_KEY_LIMIT) continue;
    const key = indexKey(cx, cz);
    const bucket = cells!.get(key);
    if (bucket === undefined) cells!.set(key, [group]);
    else bucket.push(group);
  }
  const value: ObstacleReach = {
    horizontal: Math.min(horizontal, OBSTACLE_HORIZONTAL_CAP),
    vertical: Math.min(vertical, OBSTACLE_VERTICAL_CAP),
  };
  cache.count = objects.length;
  cache.value = value;
  if (index) cache.index = { cells: cells!, groups };
}

const EMPTY_GROUPS: ObstacleGroup[] = [];

/** A blocking collider's center-to-face reach, split so tower height cannot inflate the XZ query. */
function blockingReach(collider: ResolvedCollider): [number, number] {
  const shape = collider.shape;
  const offset = shape.offset;
  const ox = offset !== undefined ? Math.abs(offset[0]) : 0;
  const oy = offset !== undefined ? Math.abs(offset[1]) : 0;
  const oz = offset !== undefined ? Math.abs(offset[2]) : 0;
  if (shape.kind === "sphere") return [ox + oz + shape.radius, oy + shape.radius];
  // Horizontal bound sums both axes so any yaw of the box stays covered.
  const h = shape.halfExtents;
  return [ox + oz + h[0] + h[2], oy + h[1]];
}

/** Every indexed obstacle whose object centre lies inside `min`..`max` — the set the broadphase promises. */
function indexedObstaclesNear(
  index: ObstacleIndex,
  min: EntityPosition,
  max: EntityPosition,
  out: CollisionObstacle[],
): void {

  const minCx = indexCell(min[0]);
  const maxCx = indexCell(max[0]);
  const minCz = indexCell(min[2]);
  const maxCz = indexCell(max[2]);
  const volume = Math.max(0, maxCx - minCx + 1) * Math.max(0, maxCz - minCz + 1);

  if (
    volume > INDEX_CELL_VOLUME_LIMIT ||
    minCx <= -INDEX_KEY_LIMIT || maxCx >= INDEX_KEY_LIMIT ||
    minCz <= -INDEX_KEY_LIMIT || maxCz >= INDEX_KEY_LIMIT
  ) {
    for (const group of index.groups) if (groupInBox(group, min, max)) pushGroup(group, out);
    return;
  }
  for (let cx = minCx; cx <= maxCx; cx += 1) {
    const rowBase = (cx + INDEX_KEY_BIAS) * INDEX_KEY_RADIX + minCz + INDEX_KEY_BIAS;
    for (let cz = minCz; cz <= maxCz; cz += 1) {
      const bucket = index.cells.get(rowBase + (cz - minCz));
      if (bucket === undefined) continue;
      for (const group of bucket) if (groupInBox(group, min, max)) pushGroup(group, out);
    }
  }
}

function groupInBox(group: ObstacleGroup, min: EntityPosition, max: EntityPosition): boolean {
  return group.x >= min[0] && group.x <= max[0] && group.y >= min[1] && group.y <= max[1] && group.z >= min[2] && group.z <= max[2];
}

function pushGroup(group: ObstacleGroup, out: CollisionObstacle[]): void {
  for (const obstacle of group.obstacles) out.push(obstacle);
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
 * A {@link WorldSolid} as a {@link CollisionObstacle}. Axis-aligned solids are one box; a yawed solid is
 * cut into strips along its long axis, each fitted with an AABB, so a turned building does not block
 * the street beside it the way a single enclosing box would.
 * @capability solid-obstacles the one blocking-geometry query the player resolver and NPC movers share
 */
export function obstacleFromSolid(solid: WorldSolid): CollisionObstacle {
  const [hx, hy, hz] = solid.halfExtents;
  const yaw = solid.rotationY ?? 0;
  const quarter = yaw / (Math.PI / 2);
  const nearest = Math.round(quarter);
  if (Math.abs(quarter - nearest) < AXIS_ALIGNED_EPSILON) {
    const swapped = Math.abs(nearest) % 2 === 1;
    return { position: solid.center, halfExtents: swapped ? [hz, hy, hx] : [hx, hy, hz] };
  }
  const alongX = hx >= hz;
  const long = alongX ? hx : hz;
  const short = Math.max(alongX ? hz : hx, 1e-6);
  const strips = Math.min(SOLID_MAX_STRIPS, Math.max(1, Math.ceil(long / short)));
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const boxes: { min: [number, number, number]; max: [number, number, number] }[] = [];
  for (let i = 0; i < strips; i += 1) {
    const from = -long + (2 * long * i) / strips;
    const to = from + (2 * long) / strips;
    const boxMin: [number, number, number] = alongX ? [from, -hy, -hz] : [-hx, -hy, from];
    const boxMax: [number, number, number] = alongX ? [to, hy, hz] : [hx, hy, to];
    boxes.push(yawExpandLocalBox(boxMin, boxMax, cos, sin));
  }
  return { position: solid.center, boxes };
}

/**
 * Every blocking physical obstacle overlapping the box `position` ± `reachX`/`reachZ`, read from the
 * scene's resolved colliders and `ctx.world.solids`.
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
  const obstacles = sourceObstaclesNear(
    ctx.scene.object,
    solidObstacleReach(ctx),
    position,
    reachX,
    reachZ,
    height,
    reachCache(ctx),
  );
  appendWorldSolidObstacles(obstacles, ctx.world.solids, position, reachX, reachZ, height);
  return obstacles;
}

function appendWorldSolidObstacles(
  obstacles: CollisionObstacle[],
  solids: Pick<WorldSolids, "count" | "inBox"> | undefined,
  position: EntityPosition,
  reachX: number,
  reachZ: number,
  height: number,
): void {
  if (solids === undefined || solids.count() === 0) return;
  for (const solid of solids.inBox(
    [position[0] - reachX, position[1] - height, position[2] - reachZ],
    [position[0] + reachX, position[1] + 2 * height, position[2] + reachZ],
  )) {
    obstacles.push(obstacleFromSolid(solid));
  }
}

/**
 * {@link solidObstaclesNear} against a bare source and an already-resolved reach. Pass the source's
 * {@link ObstacleReachCache} to use the version-keyed obstacle index; a source that reports no
 * `version()` keeps the per-query `inBox` gather.
 */
export function sourceObstaclesNear(
  source: SolidObstacleSource,
  reach: ObstacleReach,
  position: EntityPosition,
  reachX: number,
  reachZ: number,
  height = WALKER_HEIGHT,
  cache?: ObstacleReachCache,
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
  if (cache !== undefined && source.version !== undefined) {
    ensureSourceCache(source, cache);
    const index = cache.index;
    if (index !== undefined) {
      indexedObstaclesNear(index, min, max, obstacles);
      appendWorldSolidObstacles(obstacles, source.solids, position, reachX, reachZ, height);
      return obstacles;
    }
  }
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
  appendWorldSolidObstacles(obstacles, source.solids, position, reachX, reachZ, height);
  return obstacles;
}

/**
 * Slide a walker's horizontal step against the same solid geometry that stops the player, returning the
 * X/Z it may actually take this tick. A step into a wall is cut on the blocked axis and preserved on the
 * other, exactly as {@link stepPlayerMovement} resolves the player's.
 *
 * Bounded by the same broadphase as the player's gather: one query sized to this step, answered from the
 * source's obstacle index, never a full-world scan, so it stays affordable per NPC per tick.
 *
 * The sliding is already axis-separated: X and Z are resolved independently inside, so a caller that
 * also splits its own movement by axis must hand this exactly one axis per call (`stepZ: 0`, then
 * `stepX: 0`). Running an axis-split pass over a step this function already resolved double-cuts it,
 * and the composition is wrong in either order.
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

/**
 * {@link resolveWalkerStep} with no `GameContext`: gather plus slide against a bare
 * {@link SolidObstacleSource} and a caller-owned {@link ObstacleReachCache}.
 *
 * This is the entry point for rules that live in a pure package — no React, no three.js, no engine
 * context to import. Hold one cache per source for the life of that source (`createObstacleReachCache()`)
 * rather than making a fresh one per step; it is what keeps the reach scan off the per-step path.
 * The same axis-separation note as {@link resolveWalkerStep} applies.
 *
 * @capability walker-solid-step-source slide a step against solid geometry from a pure rules package
 */
export function resolveSourceWalkerStep(
  source: SolidObstacleSource,
  cache: ObstacleReachCache,
  position: EntityPosition,
  stepX: number,
  stepZ: number,
  options: { radius?: number; stepUpHeight?: number } = {},
): { stepX: number; stepZ: number } {
  if (stepX === 0 && stepZ === 0) return { stepX, stepZ };
  const radius = options.radius ?? DEFAULT_OBSTACLE_PLAYER_RADIUS;
  const obstacles = sourceObstaclesNear(
    source,
    sourceObstacleReach(source, cache),
    position,
    Math.abs(stepX) + radius,
    Math.abs(stepZ) + radius,
    WALKER_HEIGHT,
    cache,
  );
  return slideStep(position, stepX, stepZ, obstacles, radius, options.stepUpHeight ?? 0);
}

/** {@link resolveWalkerStep} against an already-gathered obstacle set. */
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
