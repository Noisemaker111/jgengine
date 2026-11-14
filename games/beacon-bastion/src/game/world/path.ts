import { groundFieldFor } from "@jgengine/core/terrain/terrain";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";

import { world } from "../../world";
import { BUILD_PLOT_XZ, FLANK_WAYPOINTS_XZ, PATH_WAYPOINTS_XZ, creepPathLength } from "./layout";
import type { Vec2 } from "@jgengine/core/world/geometry";

export type { Vec2 };
export { PATH_WAYPOINTS_XZ, BUILD_PLOT_XZ, perpendicularPoint, creepPathLength as pathLength } from "./layout";

let terrainField = groundFieldFor(world);

export function groundHeightAt(x: number, z: number): number {
  return terrainField.sampleHeight(x, z);
}

function lift(point: Vec2): Waypoint {
  return [point[0], groundHeightAt(point[0], point[1]), point[1]];
}

/** The authored entry an encounter group names: the main road. */
export const SPAWN_POINT_KEY = "approach";
/** The second road, when the scene authors one; a group that names it walks the main road otherwise. */
export const FLANK_POINT_KEY = "flank";

// Read from the live map's scene document (via editorLayers → layout) and grounded on its field.
// These are live bindings: `rebindPath` recomputes them when the scene set switches maps.
export let PATH_WAYPOINTS: readonly Waypoint[] = [];
export let SPAWN_POINT: Waypoint = [0, 0, 0];
export let KEEP_POINT: Waypoint = [0, 0, 0];
/** Each road a wave can send tech down, grounded on the live field. */
export let ROUTES: Readonly<Record<string, readonly Waypoint[]>> = {};
/** Road length of each road, so "first on the road" means nearest the town hall whichever road it is on. */
export let ROUTE_LENGTHS: Readonly<Record<string, number>> = {};
/** Whether the scene authors a second road. */
export let HAS_FLANK = false;

export interface BuildPlot {
  id: string;
  position: Waypoint;
}

export let BUILD_PLOTS: readonly BuildPlot[] = [];

/** Recompute the roads and plots from the live map (after `bindScene` and `rebindWorld`). */
export function rebindPath(): void {
  terrainField = groundFieldFor(world);
  PATH_WAYPOINTS = PATH_WAYPOINTS_XZ.map(lift);
  SPAWN_POINT = PATH_WAYPOINTS[0]!;
  KEEP_POINT = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]!;
  HAS_FLANK = FLANK_WAYPOINTS_XZ.length >= 2;
  ROUTES = {
    [SPAWN_POINT_KEY]: PATH_WAYPOINTS,
    [FLANK_POINT_KEY]: HAS_FLANK ? FLANK_WAYPOINTS_XZ.map(lift) : PATH_WAYPOINTS,
  };
  ROUTE_LENGTHS = {
    [SPAWN_POINT_KEY]: creepPathLength(PATH_WAYPOINTS_XZ),
    [FLANK_POINT_KEY]: HAS_FLANK ? creepPathLength(FLANK_WAYPOINTS_XZ) : creepPathLength(PATH_WAYPOINTS_XZ),
  };
  BUILD_PLOTS = BUILD_PLOT_XZ.map((plot) => ({ id: plot.id, position: lift(plot.xz) }));
}
rebindPath();

/** How far a raider still has to walk, as a "first on the road" score: nearer the keep is higher. */
export function roadProgress(creep: { route: string; path: { distanceTravelled: number } }): number {
  return creep.path.distanceTravelled - (ROUTE_LENGTHS[creep.route] ?? 0);
}

export function routeOf(entry: string): readonly Waypoint[] {
  return ROUTES[entry] ?? PATH_WAYPOINTS;
}

export function nearestPlot(point: Waypoint, maxDistance: number): BuildPlot | null {
  let best: BuildPlot | null = null;
  let bestDistance = maxDistance;
  for (const plot of BUILD_PLOTS) {
    const dx = plot.position[0] - point[0];
    const dz = plot.position[2] - point[2];
    const distance = Math.hypot(dx, dz);
    if (distance <= bestDistance) {
      best = plot;
      bestDistance = distance;
    }
  }
  return best;
}

/** The nearest point on any road to an XZ spot. */
function nearestRoadPoint(x: number, z: number): [number, number] {
  let best: [number, number] = [x, z + 1];
  let bestGap = Number.POSITIVE_INFINITY;
  for (const route of Object.values(ROUTES)) {
    for (let index = 1; index < route.length; index += 1) {
      const a = route[index - 1]!;
      const b = route[index]!;
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const length = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / length));
      const px = a[0] + dx * t;
      const pz = a[2] + dz * t;
      const gap = Math.hypot(px - x, pz - z);
      if (gap < bestGap) {
        bestGap = gap;
        best = [px, pz];
      }
    }
  }
  return best;
}

/** The yaw that turns something standing at `position` to face the street (models face +Z). */
export function facingStreet(position: readonly [number, number, number]): number {
  const [px, pz] = nearestRoadPoint(position[0], position[2]);
  return Math.atan2(px - position[0], pz - position[2]);
}
