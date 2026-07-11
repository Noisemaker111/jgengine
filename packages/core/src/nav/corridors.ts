export type CorridorPoint = readonly [number, number];

export interface CorridorEdge {
  /** Centerline polyline in XZ; at least two points. */
  points: readonly CorridorPoint[];
  /** Full corridor width around the centerline. */
  width: number;
}

export interface CorridorSample {
  /** Distance from the query point to the nearest centerline. */
  distance: number;
  /** Nearest point on that centerline. */
  closest: CorridorPoint;
  /** Index of the edge owning the nearest centerline point. */
  edgeIndex: number;
}

/**
 * Organic corridor/path collision (#284.9): a distance-to-polyline width clamp over an edge graph —
 * cave tunnels, river channels, winding roads. Grid/navmesh/voxel collision can't express a smooth
 * ribbon; this can. Pure math over authored centerlines.
 */
export interface CorridorField {
  contains(x: number, z: number): boolean;
  /** Nearest-centerline sample, or `null` for an empty field. */
  nearest(x: number, z: number): CorridorSample | null;
  /** The input point when inside; otherwise the nearest point on the corridor boundary — the movement clamp. */
  clamp(x: number, z: number): CorridorPoint;
  /** Signed distance to the corridor edge: negative inside, positive outside. */
  distanceToBoundary(x: number, z: number): number;
}

function closestOnSegment(px: number, pz: number, a: CorridorPoint, b: CorridorPoint): CorridorPoint {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= 1e-12) return a;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / lengthSq));
  return [a[0] + abx * t, a[1] + abz * t];
}

export function createCorridorField(edges: readonly CorridorEdge[]): CorridorField {
  for (const edge of edges) {
    if (edge.points.length < 2) throw new Error("corridor edge needs at least two centerline points");
    if (!(edge.width > 0)) throw new Error(`corridor width must be positive, got ${edge.width}`);
  }

  function nearest(x: number, z: number): CorridorSample | null {
    let best: CorridorSample | null = null;
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
      const edge = edges[edgeIndex]!;
      for (let i = 0; i < edge.points.length - 1; i += 1) {
        const closest = closestOnSegment(x, z, edge.points[i]!, edge.points[i + 1]!);
        const distance = Math.hypot(x - closest[0], z - closest[1]);
        if (best === null || distance < best.distance) best = { distance, closest, edgeIndex };
      }
    }
    return best;
  }

  function distanceToBoundary(x: number, z: number): number {
    let signed = Number.POSITIVE_INFINITY;
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
      const edge = edges[edgeIndex]!;
      for (let i = 0; i < edge.points.length - 1; i += 1) {
        const closest = closestOnSegment(x, z, edge.points[i]!, edge.points[i + 1]!);
        const toBoundary = Math.hypot(x - closest[0], z - closest[1]) - edge.width / 2;
        if (toBoundary < signed) signed = toBoundary;
      }
    }
    return signed;
  }

  return {
    contains: (x, z) => distanceToBoundary(x, z) <= 0,
    nearest,
    clamp(x, z) {
      let best: { point: CorridorPoint; overshoot: number } | null = null;
      for (const edge of edges) {
        for (let i = 0; i < edge.points.length - 1; i += 1) {
          const closest = closestOnSegment(x, z, edge.points[i]!, edge.points[i + 1]!);
          const distance = Math.hypot(x - closest[0], z - closest[1]);
          const half = edge.width / 2;
          if (distance <= half) return [x, z];
          const overshoot = distance - half;
          if (best === null || overshoot < best.overshoot) {
            const scale = half / distance;
            best = {
              point: [closest[0] + (x - closest[0]) * scale, closest[1] + (z - closest[1]) * scale],
              overshoot,
            };
          }
        }
      }
      return best === null ? [x, z] : best.point;
    },
    distanceToBoundary,
  };
}
