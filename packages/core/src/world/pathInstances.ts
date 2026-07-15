/**
 * Generic instances-along-path sampler: evenly spaces transforms down an authored polyline, grounded
 * on an optional height sampler, each yawed along the run. Genre-agnostic — fence posts, streetlights,
 * pylons, zipline anchors, bollards, or a studio's poles all read the same primitive. Deterministic
 * for a given path + spacing.
 *
 * @capability path-instances evenly spaced transforms along a polyline
 */
import type { Vec2 } from "./geometry";
import { pointAtDistance, polyline, tangentAtDistance } from "./polyline";

/** One placed transform along a path: grounded position, facing yaw, and its ordinal + arc distance. */
export interface PathInstance {
  index: number;
  /** Arc-length distance from the path start, meters. */
  distance: number;
  position: readonly [number, number, number];
  /** Yaw (radians) facing along the direction of travel. */
  yaw: number;
}

/** Options for {@link placeAlongPath}. */
export interface PlaceAlongPathOptions {
  /** Target meters between instances. The run is divided into equal spans nearest this spacing. */
  spacing: number;
  /** Ground each instance to this height sampler (else y = 0). */
  sampleHeight?: (x: number, z: number) => number;
  /** Force at least this many instances regardless of length. Default 1 (endpoints only when short). */
  minCount?: number;
}

/**
 * Evenly place transforms along `points` (XZ polyline). The run length is divided into the whole
 * number of equal spans closest to `spacing`, so instances always land on both endpoints and stay
 * evenly distributed. Returns `spans + 1` instances. Empty for fewer than 2 points.
 */
export function placeAlongPath(
  points: readonly { x: number; z: number }[],
  options: PlaceAlongPathOptions,
): PathInstance[] {
  if (points.length < 2) return [];
  const line = polyline(points.map((point) => [point.x, point.z] as Vec2));
  const total = line.length;
  if (total <= 0) return [];
  const spacing = Math.max(0.01, options.spacing);
  const minSpans = Math.max(1, (options.minCount ?? 1) - 1);
  const spans = Math.max(minSpans, Math.round(total / spacing), 1);
  const step = total / spans;
  const out: PathInstance[] = [];
  for (let i = 0; i <= spans; i += 1) {
    const distance = i * step;
    const [x, z] = pointAtDistance(line, distance);
    const [tx, tz] = tangentAtDistance(line, Math.min(distance, total - 1e-4));
    const y = options.sampleHeight?.(x, z) ?? 0;
    out.push({ index: i, distance, position: [x, y, z], yaw: Math.atan2(tx, tz) });
  }
  return out;
}
