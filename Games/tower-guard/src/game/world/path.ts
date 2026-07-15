import { groundFieldFor } from "@jgengine/core/world/terrain";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";

import { world } from "../../world";
import {
  BUILD_PLOT_SPECS,
  PATH_WAYPOINTS_XZ,
  perpendicularPoint,
  type BuildPlotSpec,
  type Vec2,
} from "./layout";

export type { Vec2, BuildPlotSpec };
export { PATH_WAYPOINTS_XZ, BUILD_PLOT_SPECS, perpendicularPoint, pathLength } from "./layout";

const terrainField = groundFieldFor(world);

export function groundHeightAt(x: number, z: number): number {
  return terrainField.sampleHeight(x, z);
}

function lift(point: Vec2): Waypoint {
  return [point[0], groundHeightAt(point[0], point[1]), point[1]];
}

export const PATH_WAYPOINTS: readonly Waypoint[] = PATH_WAYPOINTS_XZ.map(lift);

export const SPAWN_POINT: Waypoint = PATH_WAYPOINTS[0]!;
export const KEEP_POINT: Waypoint = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]!;

export interface BuildPlot {
  id: string;
  position: Waypoint;
}

export const BUILD_PLOTS: readonly BuildPlot[] = BUILD_PLOT_SPECS.map((spec) => {
  const a = PATH_WAYPOINTS_XZ[spec.segment]!;
  const b = PATH_WAYPOINTS_XZ[spec.segment + 1]!;
  const flat = perpendicularPoint(a, b, spec.t, spec.side, spec.distance);
  return { id: spec.id, position: lift(flat) };
});

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
