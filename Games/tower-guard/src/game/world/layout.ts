import { BUILD_PLOT_XZ, PATH_WAYPOINTS_XZ } from "../../editorLayers";

export type Vec2 = readonly [number, number];

// The creep path and build-plot centers are authored in editor.scene.json and read from the document
// (editorLayers) — this module just re-exports them so the gameplay code has one import surface.
export { PATH_WAYPOINTS_XZ, BUILD_PLOT_XZ };

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
