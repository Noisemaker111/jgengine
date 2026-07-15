export type Vec2 = readonly [number, number];

/** The creep path, low-left spawn to upper-right keep, as an XZ polyline. Single source of truth. */
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

/** Flat (XZ) build-plot centers, derived from the specs — the authoring footprint before grounding. */
export const BUILD_PLOT_XZ: readonly { id: string; xz: Vec2 }[] = BUILD_PLOT_SPECS.map((spec) => ({
  id: spec.id,
  xz: perpendicularPoint(PATH_WAYPOINTS_XZ[spec.segment]!, PATH_WAYPOINTS_XZ[spec.segment + 1]!, spec.t, spec.side, spec.distance),
}));
