import type { WorldXZ } from "./minimap";

/** A world-space segment defining a linear "track" minimap — points are projected onto the `from`→`to` axis. */
export interface TrackAxis {
  from: WorldXZ;
  to: WorldXZ;
}

/**
 * Project a world point onto the `from`→`to` segment of `axis` and return the
 * clamped 0..1 fraction of how far along the track it lies (0 at `from`, 1 at
 * `to`). The linear analogue of `projectToMinimap` — feeds a horizontal
 * corridor/route progress rail. Accepts XZ (`[x, z]`) or XYZ (`[x, y, z]`)
 * points (index 0 = x, index 2 when length 3 else index 1 = z). A zero-length
 * axis returns 0.
 *
 * @capability minimap-track project a world point to a 0..1 fraction along a linear track axis
 */
export function trackFraction(
  point: WorldXZ | readonly [number, number, number],
  axis: TrackAxis,
): number {
  const px = point[0];
  const pz = point.length === 3 ? point[2] : (point as WorldXZ)[1];
  const ax = axis.to[0] - axis.from[0];
  const az = axis.to[1] - axis.from[1];
  const lengthSq = ax * ax + az * az;
  if (lengthSq === 0) return 0;
  const dot = (px - axis.from[0]) * ax + (pz - axis.from[1]) * az;
  const fraction = dot / lengthSq;
  return fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
}
