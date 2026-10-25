import { groundFieldFor } from "@jgengine/core/world/terrain";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";

import { world } from "../../world";
import { BUILD_PLOT_XZ, FLANK_WAYPOINTS_XZ, PATH_WAYPOINTS_XZ, pathLength, type Vec2 } from "./layout";

export type { Vec2 };
export { PATH_WAYPOINTS_XZ, BUILD_PLOT_XZ, perpendicularPoint, pathLength } from "./layout";

const terrainField = groundFieldFor(world);

export function groundHeightAt(x: number, z: number): number {
  return terrainField.sampleHeight(x, z);
}

function lift(point: Vec2): Waypoint {
  return [point[0], groundHeightAt(point[0], point[1]), point[1]];
}

// Read from editor.scene.json (via editorLayers → layout) and grounded on the live field. One source.
export const PATH_WAYPOINTS: readonly Waypoint[] = PATH_WAYPOINTS_XZ.map(lift);

export const SPAWN_POINT: Waypoint = PATH_WAYPOINTS[0]!;
export const KEEP_POINT: Waypoint = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]!;

/** The authored entry an encounter group names: the main road. */
export const SPAWN_POINT_KEY = "approach";
/** The flank track, when the scene authors one; a group that names it walks the main road otherwise. */
export const FLANK_POINT_KEY = "flank";

/** Each approach a wave can send raiders down, grounded on the live field. */
export const ROUTES: Readonly<Record<string, readonly Waypoint[]>> = {
  [SPAWN_POINT_KEY]: PATH_WAYPOINTS,
  [FLANK_POINT_KEY]: FLANK_WAYPOINTS_XZ.length >= 2 ? FLANK_WAYPOINTS_XZ.map(lift) : PATH_WAYPOINTS,
};

/** Road length of each approach, so "first on the road" means nearest the keep whichever road it is on. */
export const ROUTE_LENGTHS: Readonly<Record<string, number>> = {
  [SPAWN_POINT_KEY]: pathLength(PATH_WAYPOINTS_XZ),
  [FLANK_POINT_KEY]: FLANK_WAYPOINTS_XZ.length >= 2 ? pathLength(FLANK_WAYPOINTS_XZ) : pathLength(PATH_WAYPOINTS_XZ),
};

/** Whether the scene authors a second approach. */
export const HAS_FLANK = FLANK_WAYPOINTS_XZ.length >= 2;

/** How far a raider still has to walk, as a "first on the road" score: nearer the keep is higher. */
export function roadProgress(creep: { route: string; path: { distanceTravelled: number } }): number {
  return creep.path.distanceTravelled - (ROUTE_LENGTHS[creep.route] ?? 0);
}

export function routeOf(entry: string): readonly Waypoint[] {
  return ROUTES[entry] ?? PATH_WAYPOINTS;
}

export interface BuildPlot {
  id: string;
  position: Waypoint;
}

export const BUILD_PLOTS: readonly BuildPlot[] = BUILD_PLOT_XZ.map((plot) => ({
  id: plot.id,
  position: lift(plot.xz),
}));

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
