import { resolveTerrainField } from "@jgengine/core/world/terrain";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";

import { TERRAIN } from "./terrain";

export type Vec2 = readonly [number, number];

export const PATH_WAYPOINTS_XZ: readonly Vec2[] = [
  [-30, -24],
  [-30, -8],
  [-6, -8],
  [-6, 8],
  [18, 8],
  [18, 24],
  [30, 24],
];

export interface BuildPlotSpec {
  id: string;
  segment: number;
  t: number;
  side: 1 | -1;
  distance: number;
}

export const BUILD_PLOT_SPECS: readonly BuildPlotSpec[] = [
  { id: "plot-1", segment: 0, t: 0.55, side: 1, distance: 6 },
  { id: "plot-2", segment: 0, t: 0.55, side: -1, distance: 6 },
  { id: "plot-3", segment: 1, t: 0.5, side: -1, distance: 6 },
  { id: "plot-4", segment: 2, t: 0.3, side: 1, distance: 6 },
  { id: "plot-5", segment: 2, t: 0.75, side: -1, distance: 6 },
  { id: "plot-6", segment: 3, t: 0.5, side: 1, distance: 6 },
  { id: "plot-7", segment: 4, t: 0.5, side: -1, distance: 6 },
  { id: "plot-8", segment: 4, t: 0.5, side: 1, distance: 6 },
  { id: "plot-9", segment: 5, t: 0.5, side: -1, distance: 6 },
];

export function perpendicularPoint(a: Vec2, b: Vec2, t: number, side: 1 | -1, distance: number): Vec2 {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz) || 1;
  const nx = (-dz / length) * side;
  const nz = (dx / length) * side;
  const px = a[0] + dx * t;
  const pz = a[1] + dz * t;
  return [px + nx * distance, pz + nz * distance];
}

export function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  }
  return total;
}

const terrainField = resolveTerrainField(TERRAIN);

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
