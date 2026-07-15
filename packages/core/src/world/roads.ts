/** A road centerline vertex in world XZ. */
export type RoadPoint = readonly [number, number];

/** Renderer-ready triangle ribbon: flat position triples plus triangle indices. */
export interface RoadRibbon {
  /** Interleaved xyz vertex positions. */
  positions: Float32Array;
  /** Triangle indices into `positions`. */
  indices: Uint32Array;
}

/**
 * Fillets sharp corners of a centerline into short arcs so a ribbon built from it reads as a smooth
 * road instead of overlapping/notching rectangles at each bend. Each interior vertex is replaced by a
 * quadratic-bezier arc of `radius` (clamped to half the shorter adjacent segment) sampled at
 * `cornerSegments` steps; endpoints and near-straight vertices pass through unchanged.
 * @internal — the corner-smoothing behind `<AuthoredPaths>`; games get it for free through the render.
 */
export function roundPathCorners(
  points: readonly RoadPoint[],
  radius: number,
  cornerSegments = 5,
): RoadPoint[] {
  if (points.length < 3 || radius <= 0) return points.map((point) => [point[0], point[1]] as RoadPoint);
  const out: RoadPoint[] = [[points[0]![0], points[0]![1]]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1]!;
    const v = points[i]!;
    const b = points[i + 1]!;
    const ax = a[0] - v[0];
    const az = a[1] - v[1];
    const bx = b[0] - v[0];
    const bz = b[1] - v[1];
    const la = Math.hypot(ax, az) || 1;
    const lb = Math.hypot(bx, bz) || 1;
    const r = Math.min(radius, la / 2, lb / 2);
    const p0: RoadPoint = [v[0] + (ax / la) * r, v[1] + (az / la) * r];
    const p1: RoadPoint = [v[0] + (bx / lb) * r, v[1] + (bz / lb) * r];
    out.push(p0);
    for (let s = 1; s < cornerSegments; s += 1) {
      const t = s / cornerSegments;
      const u = 1 - t;
      out.push([
        u * u * p0[0] + 2 * u * t * v[0] + t * t * p1[0],
        u * u * p0[1] + 2 * u * t * v[1] + t * t * p1[1],
      ]);
    }
    out.push(p1);
  }
  out.push([points[points.length - 1]![0], points[points.length - 1]![1]]);
  return out;
}

/** Options for {@link buildRoadRibbon}. */
export interface RoadRibbonOptions {
  /** Lift above the sampled ground so the ribbon never z-fights the terrain. Default 0.08. */
  elevation?: number;
  /** Longest centerline step before the polyline is subdivided to drape over relief. Default 4. */
  maxSegmentLength?: number;
}

function subdividePath(path: readonly RoadPoint[], maxLength: number): RoadPoint[] {
  const out: RoadPoint[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(length / maxLength));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  const last = path[path.length - 1];
  if (last !== undefined) out.push(last);
  return out;
}

function normalAt(points: readonly RoadPoint[], index: number): readonly [number, number] {
  const prev = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const dx = next[0] - prev[0];
  const dz = next[1] - prev[1];
  const length = Math.hypot(dx, dz) || 1;
  return [-dz / length, dx / length];
}

/**
 * Triangulate a road centerline into a ground-draped ribbon mesh: the polyline is subdivided,
 * each vertex is offset half a `width` along the local perpendicular, and every vertex sits at
 * `sampleHeight(x, z) + elevation`. Pure geometry — the shell (or any renderer) turns the result
 * into a mesh, and tests can assert on it directly.
 */
export function buildRoadRibbon(
  path: readonly RoadPoint[],
  width: number,
  sampleHeight: (x: number, z: number) => number,
  options: RoadRibbonOptions = {},
): RoadRibbon {
  const elevation = options.elevation ?? 0.08;
  const maxSegmentLength = options.maxSegmentLength ?? 4;
  if (path.length < 2 || width <= 0) {
    return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  }
  const points = subdividePath(path, maxSegmentLength);
  const half = width / 2;
  const positions = new Float32Array(points.length * 6);
  for (let i = 0; i < points.length; i += 1) {
    const [x, z] = points[i]!;
    const [nx, nz] = normalAt(points, i);
    const lx = x + nx * half;
    const lz = z + nz * half;
    const rx = x - nx * half;
    const rz = z - nz * half;
    positions[i * 6] = lx;
    positions[i * 6 + 1] = sampleHeight(lx, lz) + elevation;
    positions[i * 6 + 2] = lz;
    positions[i * 6 + 3] = rx;
    positions[i * 6 + 4] = sampleHeight(rx, rz) + elevation;
    positions[i * 6 + 5] = rz;
  }
  const indices = new Uint32Array((points.length - 1) * 6);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = i * 2;
    indices[i * 6] = a;
    indices[i * 6 + 1] = a + 1;
    indices[i * 6 + 2] = a + 2;
    indices[i * 6 + 3] = a + 1;
    indices[i * 6 + 4] = a + 3;
    indices[i * 6 + 5] = a + 2;
  }
  return { positions, indices };
}

/**
 * Split a centerline into dash sub-polylines for lane markings: `dashLength` of painted line,
 * `gapLength` of asphalt, repeated along the path's arc length. Feed each returned sub-path back
 * through {@link buildRoadRibbon} with a thin width to mesh the dashes.
 */
export function dashSegments(
  path: readonly RoadPoint[],
  dashLength = 3,
  gapLength = 3,
): readonly (readonly RoadPoint[])[] {
  if (path.length < 2 || dashLength <= 0 || gapLength < 0) return [];
  const cumulative: number[] = [0];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    cumulative.push(cumulative[i]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cumulative[cumulative.length - 1]!;
  if (total <= 0) return [];

  const pointAt = (s: number): RoadPoint => {
    const clamped = Math.max(0, Math.min(total, s));
    let index = 0;
    while (index < cumulative.length - 2 && cumulative[index + 1]! < clamped) index += 1;
    const a = path[index]!;
    const b = path[index + 1]!;
    const segLength = cumulative[index + 1]! - cumulative[index]!;
    const t = segLength <= 0 ? 0 : (clamped - cumulative[index]!) / segLength;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };

  const period = dashLength + gapLength;
  const dashes: (readonly RoadPoint[])[] = [];
  for (let start = 0; start < total; start += period) {
    const end = Math.min(total, start + dashLength);
    if (end - start < 1e-6) break;
    dashes.push([pointAt(start), pointAt(end)]);
    if (period <= 0) break;
  }
  return dashes;
}

/** Result of {@link nearestOnPath}: closest point on the centerline plus distance and tangent. */
export interface RoadSample {
  /** Closest point on the centerline. */
  point: RoadPoint;
  /** World distance from the query to `point`. */
  distance: number;
  /** Unit tangent of the centerline at `point`. */
  tangent: readonly [number, number];
}

/**
 * Closest-point query against a road centerline — the seam traffic AI, spawn placement, and
 * "am I on the road" checks share. Returns null for a degenerate path.
 */
export function nearestOnPath(path: readonly RoadPoint[], x: number, z: number): RoadSample | null {
  if (path.length < 2) return null;
  let best: RoadSample | null = null;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const lengthSq = abx * abx + abz * abz;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lengthSq));
    const px = a[0] + abx * t;
    const pz = a[1] + abz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (best === null || distance < best.distance) {
      const length = Math.sqrt(lengthSq) || 1;
      best = { point: [px, pz], distance, tangent: [abx / length, abz / length] };
    }
  }
  return best;
}

/** True when the query point lies within half the road `width` of the centerline. */
export function isOnRoad(path: readonly RoadPoint[], width: number, x: number, z: number): boolean {
  const sample = nearestOnPath(path, x, z);
  return sample !== null && sample.distance <= width / 2;
}

/** Total arc length of a centerline in world units. */
export function pathLength(path: readonly RoadPoint[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}
