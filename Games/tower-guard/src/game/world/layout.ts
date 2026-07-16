import { add, distance as vecDistance, length, lerp, perp, scale, sub } from "@jgengine/core/world/vec2";
import type { Vec2 } from "@jgengine/core/world/geometry";

import { BUILD_PLOT_XZ, PATH_WAYPOINTS_XZ } from "../../editorLayers";

export type { Vec2 };

// The creep path and build-plot centers are authored in editor.scene.json and read from the document
// (editorLayers) — this module just re-exports them so the gameplay code has one import surface.
export { PATH_WAYPOINTS_XZ, BUILD_PLOT_XZ };

export function perpendicularPoint(a: Vec2, b: Vec2, t: number, side: 1 | -1, distance: number): Vec2 {
  const delta = sub(b, a);
  const len = length(delta) || 1;
  const normal = scale(perp(delta), side / len);
  return add(lerp(a, b, t), scale(normal, distance));
}

export function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += vecDistance(points[i]!, points[i - 1]!);
  return total;
}
