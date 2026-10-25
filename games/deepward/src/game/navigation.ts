import { createNavGrid, findPath, type NavGrid, type NavPoint } from "@jgengine/core/nav/navGrid";
import { distance, walkable, WORLD_BOUNDS, type Place, type Point } from "../world";

const CELL = 0.5;
/** Routes use the same authored footprints and actor clearance as locomotion. */
export function traversable(from: Point, to: Point, place: Place): boolean {
  const steps = Math.max(1, Math.ceil(distance(from, to) / 0.12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!walkable(from[0] + (to[0] - from[0]) * t, from[2] + (to[2] - from[2]) * t, place)) return false;
  }
  return true;
}

/**
 * The station's route grid: the shared occupancy grid at the game's own 0.5 m cell, marked from
 * the authored room and machinery footprints. The pathfinder, the corner rule and the straight-run
 * smoothing are the engine's; only which cells are walkable is Deepward's.
 */
const grids = new Map<Place, NavGrid>();
function grid(place: Place): NavGrid {
  const cached = grids.get(place);
  if (cached) return cached;
  const map = createNavGrid({ bounds: WORLD_BOUNDS, cellSize: CELL, diagonal: true });
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const [x, z] = map.center(col, row);
      if (!walkable(x, z, place)) map.setWalkable(col, row, false);
    }
  }
  grids.set(place, map);
  return map;
}

const flat = (point: Point): NavPoint => [point[0], point[2]];
const raise = (point: NavPoint): Point => [point[0], 0, point[1]];

/** Empty means unreachable. This is document-derived routing, not a baked navmesh. */
export function findRoute(from: Point, to: Point, place: Place): Point[] {
  if (traversable(from, to, place)) return [to];
  const map = grid(place);
  // Both ends must already stand on this floor. Letting the pathfinder snap a goal would route
  // across a wall or from the home floor to the vault, which is not a walk the fitter can take.
  const onFloor = (point: Point) => {
    const cell = map.cellAt(flat(point));
    return map.inBounds(cell.col, cell.row) && map.isWalkable(cell.col, cell.row)
      && traversable(point, raise(map.center(cell.col, cell.row)), place);
  };
  if (!onFloor(from) || !onFloor(to)) return [];
  const path = findPath(map, flat(from), flat(to), {
    smooth: true,
    // The grid knows the room; this keeps the route off the authored machinery the same way a
    // step does, so a smoothed run never cuts a corner the walker cannot take.
    canTraverse: (a, b) => traversable(raise(a), raise(b), place),
  });
  if (path === null || path.length === 0) return [];
  const points = path.map(raise);
  // The path ends on the goal's own cell; the caller asked for the exact spot.
  points[points.length - 1] = to;
  return points;
}

export interface Navigator { goal: Point | null; path: Point[] }
export function createNavigator(): Navigator { return { goal: null, path: [] }; }
/** Preserve the route while chasing; rebuild only when the target changes cell or the path is obstructed. */
export function advanceRoute(route: Navigator, from: Point, goal: Point, budget: number, place: Place): Point {
  if (!(budget > 0) || !Number.isFinite(budget)) return from;
  if (traversable(from, goal, place)) { route.goal = goal; route.path = [goal]; }
  else if (route.goal === null || distance(route.goal, goal) > CELL || (route.path.length && !traversable(from, route.path[0]!, place))) {
    route.goal = goal; route.path = findRoute(from, goal, place);
  }
  let at = from, left = budget;
  while (route.path.length && left > 0) {
    const next = route.path[0]!, remaining = distance(at, next);
    if (remaining <= left) { at = next; left -= remaining; route.path.shift(); }
    else { const f = left / remaining; at = [at[0] + (next[0] - at[0]) * f, at[1], at[2] + (next[2] - at[2]) * f]; left = 0; }
  }
  return at;
}
