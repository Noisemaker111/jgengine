import { groundFieldFor } from "@jgengine/core/world/terrain";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";

import { world } from "../../world";
import { BUILD_PLOT_XZ, PATH_WAYPOINTS_XZ, type Vec2 } from "./layout";

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
