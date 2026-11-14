import { createNavGrid, findPath, type NavGrid, type NavPoint } from "@jgengine/core/nav/navGrid";

import { FOG_BOUNDS } from "./fog";
import { onHose, onPatio, type YardLayout } from "./yard";

/**
 * Ant routes across the authored yard, on the engine's walkable grid (`@jgengine/core/nav/navGrid`):
 *
 * - the garden hose is a wall except at its two crossings, so a march over it funnels to a bridge;
 * - a patio stone is a plateau: climbing it costs four times the walk, so a column goes around one
 *   unless it is ordered onto it (where the high-ground sight bonus is).
 *
 * The grid is built once from the yard layout; `routeTo` returns the next waypoint a walker should head
 * for and caches its path until the destination moves. Flying wasps never ask.
 */

export const NAV_CELL = 1.5;
const PATIO_CLIMB_COST = 4;
const ARRIVE_WAYPOINT = 0.9;
const REPATH_DISTANCE = 1.5;

export interface YardNav {
  grid: NavGrid;
  layout: YardLayout;
}

export function buildYardNav(layout: YardLayout): YardNav {
  const grid = createNavGrid({ bounds: FOG_BOUNDS, cellSize: NAV_CELL, diagonal: true });
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const [x, z] = grid.center(col, row);
      if (onHose(layout, x, z)) grid.setWalkable(col, row, false);
    }
  }
  return { grid, layout };
}

/** A whole route from A to B (smoothed), or null when the goal is sealed off. */
export function yardRoute(nav: YardNav, from: NavPoint, to: NavPoint): NavPoint[] | null {
  return findPath(nav.grid, from, to, {
    smooth: true,
    stepCost: (_a, b) => (onPatio(nav.layout, b[0], b[1]) ? PATIO_CLIMB_COST : 1),
    // Smoothing never shortcuts across a plateau the route deliberately went around.
    canTraverse: (a, b) => !crossesPatio(nav, a, b),
    maxNodes: 6000,
  });
}

/** One walker's cached route. */
export interface RouteCache {
  tx: number;
  tz: number;
  points: NavPoint[];
  index: number;
}

/**
 * The point a walker at `from` should step toward to reach `(tx, tz)`: the next waypoint of a cached
 * route, re-planned when the destination moves. Falls back to the destination itself when no route
 * exists, so nothing ever freezes.
 */
export function routeTo(nav: YardNav, cache: Map<string, RouteCache>, id: string, from: NavPoint, tx: number, tz: number): NavPoint {
  let route = cache.get(id);
  if (route === undefined || Math.hypot(route.tx - tx, route.tz - tz) > REPATH_DISTANCE) {
    // Straight line when nothing is in the way: most steps never pay for a search.
    if (nav.grid.lineOfSight(from, [tx, tz]) && !crossesPatio(nav, from, [tx, tz])) {
      cache.set(id, { tx, tz, points: [[tx, tz]], index: 0 });
      return [tx, tz];
    }
    const points = yardRoute(nav, from, [tx, tz]) ?? [[tx, tz]];
    route = { tx, tz, points, index: 0 };
    cache.set(id, route);
  }
  while (route.index < route.points.length - 1) {
    const p = route.points[route.index]!;
    if (Math.hypot(p[0] - from[0], p[1] - from[1]) > ARRIVE_WAYPOINT) break;
    route.index += 1;
  }
  return route.points[route.index] ?? [tx, tz];
}

function crossesPatio(nav: YardNav, a: NavPoint, b: NavPoint): boolean {
  if (onPatio(nav.layout, b[0], b[1])) return false;
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / NAV_CELL);
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (onPatio(nav.layout, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return true;
  }
  return false;
}
