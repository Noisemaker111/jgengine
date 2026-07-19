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

/**
 * The single owning table of ground-decal Y offsets, in world units above the sampled terrain.
 *
 * Contract — the vertical stacking order is `terrain < road < junction < marking < glow`, and every
 * ground overlay must draw from THIS table rather than picking a local magic epsilon (the old
 * scatter of `0.08` ribbons, `+0.02` discs, `0.05` markings, `0.055–0.1` playground fudge factors
 * is exactly the z-fighting this removes).
 *
 * - `road` and `junction` deliberately share one layer: {@link buildJunctionSurface} welds its
 *   boundary vertices onto the exact corner vertices where the trimmed ribbon ends
 *   ({@link trimPathAtJunctions}), so the two surfaces meet at a shared seam and never stack — they
 *   must sit at the same height or the seam would tear. Do NOT bump `junction` above `road`.
 * - `marking` is the ONLY permitted coplanar overlay (lane paint sits on top of asphalt at the same
 *   XZ). Its Y separation alone is not enough to beat depth precision on sloped ground: consumers
 *   rendering markings MUST ALSO set a negative `polygonOffset` and/or a higher `renderOrder` on the
 *   marking material (renderer-side — this table only owns the Y term).
 * - `glow` sits above markings for emissive decals (crosswalk glow, selection halos).
 *
 * Values are chosen with real separation so a small terrain slope can't invert the order.
 */
export const GROUND_DECAL_LAYERS = {
  /** Road ribbons. */
  road: 0.06,
  /** Junction surfaces — SAME layer as `road` because they are seam-welded, never stacked. */
  junction: 0.06,
  /** Lane markings / crosswalks — the only coplanar overlay; also set polygonOffset/renderOrder. */
  marking: 0.11,
  /** Emissive decals above markings (glow, halos). */
  glow: 0.14,
} as const;

/** Options for {@link buildRoadRibbon}. */
export interface RoadRibbonOptions {
  /** Lift above the sampled ground so the ribbon never z-fights the terrain. Default {@link GROUND_DECAL_LAYERS}.road. */
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
  const elevation = options.elevation ?? GROUND_DECAL_LAYERS.road;
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

/** A circular exclusion zone: dashes whose midpoint falls inside are dropped (e.g. junction patches). */
export interface DashExclusion {
  center: RoadPoint;
  radius: number;
}

/**
 * Build a flat, ground-draped disc patch centered on `center` — a triangle fan of `segments` sides
 * (default 16), every vertex draped at `sampleHeight + elevation`.
 *
 * @deprecated This floats a disc slightly above the crossing ribbons, which still overlaps and
 * z-fights them. Prefer {@link buildJunctionSurface} (with {@link trimPathAtJunctions}, or the
 * all-in-one {@link buildTrimmedIntersections}): it trims the ribbons back to the junction boundary
 * and welds one seam-shared surface, with no overlap and no floating disc. Kept so existing callers
 * don't break this round.
 */
export function buildJunctionPatch(
  center: RoadPoint,
  radius: number,
  sampleHeight: (x: number, z: number) => number,
  options: { elevation?: number; segments?: number } = {},
): RoadRibbon {
  const elevation = options.elevation ?? GROUND_DECAL_LAYERS.junction;
  const segments = Math.max(3, Math.floor(options.segments ?? 16));
  if (radius <= 0) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const [cx, cz] = center;
  // Center vertex + one ring vertex per segment.
  const positions = new Float32Array((segments + 1) * 3);
  positions[0] = cx;
  positions[1] = sampleHeight(cx, cz) + elevation;
  positions[2] = cz;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;
    const base = (i + 1) * 3;
    positions[base] = x;
    positions[base + 1] = sampleHeight(x, z) + elevation;
    positions[base + 2] = z;
  }
  const indices = new Uint32Array(segments * 3);
  for (let i = 0; i < segments; i += 1) {
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = ((i + 1) % segments) + 1;
  }
  return { positions, indices };
}

/**
 * Split a centerline into dash sub-polylines for lane markings: `dashLength` of painted line,
 * `gapLength` of asphalt, repeated along the path's arc length. Feed each returned sub-path back
 * through {@link buildRoadRibbon} with a thin width to mesh the dashes. Pass `exclude` circles
 * (junction patches) to interrupt the center line through intersections — any dash whose midpoint
 * lands inside an exclusion is dropped.
 */
export function dashSegments(
  path: readonly RoadPoint[],
  dashLength = 3,
  gapLength = 3,
  exclude: readonly DashExclusion[] = [],
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
    const a = pointAt(start);
    const b = pointAt(end);
    if (exclude.length > 0) {
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      let excluded = false;
      for (let e = 0; e < exclude.length; e += 1) {
        const zone = exclude[e]!;
        const dx = mx - zone.center[0];
        const dz = mz - zone.center[1];
        if (dx * dx + dz * dz <= zone.radius * zone.radius) {
          excluded = true;
          break;
        }
      }
      if (excluded) {
        if (period <= 0) break;
        continue;
      }
    }
    dashes.push([a, b]);
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

// ---------------------------------------------------------------------------------------------
// Junction trimming + welded surfaces
//
// The old model extruded each street into a full-length ribbon and hid the mess where they cross
// under a floating disc ({@link buildJunctionPatch}). That leaves every incident ribbon overlapping
// inside the node and the disc z-fighting them from 0.02 above. The functions below build the real
// thing as pure geometry: ribbons are TRIMMED back to the junction boundary, and one surface is
// WELDED onto the exact corner vertices where they stop — a shared seam, no overlap, no disc.
// ---------------------------------------------------------------------------------------------

/**
 * The minimal junction shape this geometry needs — a node position plus its outgoing arms. Matches
 * the structural subset of `StreetJunction` (streetGenerator) so a network's `junctions` can be fed
 * straight in. Arm `angle` follows the generator convention `atan2(dx, dz)`, i.e. the outward unit
 * direction of an arm is `[sin(angle), cos(angle)]`.
 */
export interface RoadJunctionInput {
  x: number;
  z: number;
  arms: readonly { angle: number; width: number }[];
}

/** Tunables shared by {@link trimPathAtJunctions}, {@link buildJunctionSurface}, and {@link buildTrimmedIntersections}. */
export interface JunctionGeometryOptions {
  /** Curb-return fillet radius blended between adjacent approaches. Default 4. */
  curbReturnRadius?: number;
  /** Extra apron beyond the crossing half-width + curb return, so ribbons clear the node. Default 1. */
  apronMargin?: number;
  /** Samples per curb-return fillet arc between two adjacent approach corners. Default 4. */
  filletSegments?: number;
  /** Lift above sampled ground. Defaults to {@link GROUND_DECAL_LAYERS}.junction (== road: seam-shared). */
  elevation?: number;
  /** Longest step before draping subdivision, matching {@link buildRoadRibbon}. Default 4. */
  maxSegmentLength?: number;
  /** World-space tolerance for matching a path vertex onto a junction node. Default 1e-6. */
  nodeEpsilon?: number;
}

/** One trim of a ribbon end back to a junction boundary — the seam the welded surface attaches to. */
export interface RoadCut {
  /** Index (into the `junctions` array passed to the trimmer) of the junction this cut welds to. */
  junctionIndex: number;
  /** Whether the cut is at the start or the end of the returned sub-path. */
  at: "start" | "end";
  /** Trimmed centerline endpoint — the point on the junction boundary the ribbon now ends at. */
  center: RoadPoint;
  /** Unit direction pointing from the junction center outward into the road. */
  direction: readonly [number, number];
  /** Left edge corner at the cut (`center` + width/2 along the local perpendicular). */
  left: RoadPoint;
  /** Right edge corner at the cut (`center` − width/2 along the local perpendicular). */
  right: RoadPoint;
  /** Arc-length the ribbon was pulled back from the junction center. */
  apron: number;
}

/** A street sub-path after trimming, plus the cuts (0–2) that shortened it. Feed `path` to {@link buildRoadRibbon}. */
export interface TrimmedRoad {
  /** Trimmed centerline (≥2 points) ready for meshing. */
  path: RoadPoint[];
  /** Cuts applied to this sub-path — at most one `start` and one `end`. */
  cuts: RoadCut[];
}

/** Outward unit direction of a junction arm under the `atan2(dx, dz)` convention. */
function armDirection(angle: number): readonly [number, number] {
  return [Math.sin(angle), Math.cos(angle)];
}

/**
 * Apron pull-back for one approach: the widest crossing arm's half-width plus the curb-return radius
 * plus a margin. The approach's own arm is matched to `outward` and excluded, so a narrow street
 * crossing a wide boulevard is pulled back far enough to clear the boulevard, not just itself.
 */
function apronDistance(
  junction: RoadJunctionInput,
  outward: readonly [number, number],
  curbReturnRadius: number,
  margin: number,
): number {
  const arms = junction.arms;
  if (arms.length === 0) return curbReturnRadius + margin;
  let bestK = -1;
  let bestDot = -Infinity;
  for (let k = 0; k < arms.length; k += 1) {
    const [ax, az] = armDirection(arms[k]!.angle);
    const dot = outward[0] * ax + outward[1] * az;
    if (dot > bestDot) {
      bestDot = dot;
      bestK = k;
    }
  }
  let crossMax = 0;
  for (let j = 0; j < arms.length; j += 1) {
    if (j === bestK) continue;
    crossMax = Math.max(crossMax, arms[j]!.width / 2);
  }
  if (crossMax === 0) {
    // Single-arm or unmatched: fall back to the widest arm so we still clear the node.
    for (let j = 0; j < arms.length; j += 1) crossMax = Math.max(crossMax, arms[j]!.width / 2);
  }
  return crossMax + curbReturnRadius + margin;
}

/** Point + forward tangent at arc-length `dist` from the start of `sub`; used to place a cut. */
function pointAtArcLength(sub: readonly RoadPoint[], dist: number): { point: RoadPoint; segment: number; tangent: readonly [number, number] } {
  let acc = 0;
  for (let i = 0; i < sub.length - 1; i += 1) {
    const a = sub[i]!;
    const b = sub[i + 1]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const segLen = Math.hypot(dx, dz);
    if (acc + segLen >= dist || i === sub.length - 2) {
      const t = segLen <= 0 ? 0 : Math.max(0, Math.min(1, (dist - acc) / segLen));
      const len = segLen || 1;
      return { point: [a[0] + dx * t, a[1] + dz * t], segment: i, tangent: [dx / len, dz / len] };
    }
    acc += segLen;
  }
  const last = sub[sub.length - 1]!;
  return { point: [last[0], last[1]], segment: sub.length - 2, tangent: [1, 0] };
}

/** Left/right corners exactly as {@link buildRoadRibbon} would emit them at a cut (center ± half along ⟂tangent). */
function cornerPair(center: RoadPoint, tangent: readonly [number, number], half: number): { left: RoadPoint; right: RoadPoint } {
  // Matches buildRoadRibbon's normalAt: normal = [-tangent.z, tangent.x]; left = +normal, right = −normal.
  const nx = -tangent[1];
  const nz = tangent[0];
  return {
    left: [center[0] + nx * half, center[1] + nz * half],
    right: [center[0] - nx * half, center[1] - nz * half],
  };
}

/**
 * Cut a street centerline back from the junctions it passes through so its ribbon ENDS at the
 * junction boundary instead of ploughing through the node. Junctions are matched to path vertices
 * within `nodeEpsilon` (endpoints and interior vertices alike); a junction sitting on an interior
 * vertex SPLITS the path into two independently-trimmed sub-paths. Each cut records the exact
 * boundary point and the road's left/right edge corners there, so {@link buildJunctionSurface} can
 * weld its polygon onto the identical vertices with no overlap.
 *
 * Pure geometry, allocation-aware, bounded by the vertex and junction counts. Returns one
 * {@link TrimmedRoad} per surviving sub-path (a mid-polyline junction yields two).
 */
export function trimPathAtJunctions(
  path: readonly RoadPoint[],
  width: number,
  junctions: readonly RoadJunctionInput[],
  options: JunctionGeometryOptions = {},
): TrimmedRoad[] {
  if (path.length < 2 || width <= 0) return [];
  const curbReturnRadius = options.curbReturnRadius ?? 4;
  const margin = options.apronMargin ?? 1;
  const eps = options.nodeEpsilon ?? 1e-6;
  const half = width / 2;
  const n = path.length;

  // Map each path vertex to a coincident junction (or -1).
  const vertJunction = new Array<number>(n).fill(-1);
  for (let vi = 0; vi < n; vi += 1) {
    const p = path[vi]!;
    for (let ji = 0; ji < junctions.length; ji += 1) {
      const j = junctions[ji]!;
      if (Math.hypot(p[0] - j.x, p[1] - j.z) <= eps) {
        vertJunction[vi] = ji;
        break;
      }
    }
  }

  // Boundaries split the polyline: start, every interior junction vertex, end.
  const boundaries: number[] = [0];
  for (let vi = 1; vi < n - 1; vi += 1) if (vertJunction[vi] !== -1) boundaries.push(vi);
  boundaries.push(n - 1);

  const result: TrimmedRoad[] = [];
  for (let r = 0; r < boundaries.length - 1; r += 1) {
    const a = boundaries[r]!;
    const b = boundaries[r + 1]!;
    let sub: RoadPoint[] = [];
    for (let i = a; i <= b; i += 1) sub.push([path[i]![0], path[i]![1]]);
    if (sub.length < 2) continue;

    const startJ = vertJunction[a]!;
    const endJ = vertJunction[b]!;
    let startApron = 0;
    let endApron = 0;
    if (startJ !== -1) {
      const dx = sub[1]![0] - sub[0]![0];
      const dz = sub[1]![1] - sub[0]![1];
      const l = Math.hypot(dx, dz) || 1;
      startApron = apronDistance(junctions[startJ]!, [dx / l, dz / l], curbReturnRadius, margin);
    }
    if (endJ !== -1) {
      const last = sub.length - 1;
      const dx = sub[last - 1]![0] - sub[last]![0];
      const dz = sub[last - 1]![1] - sub[last]![1];
      const l = Math.hypot(dx, dz) || 1;
      endApron = apronDistance(junctions[endJ]!, [dx / l, dz / l], curbReturnRadius, margin);
    }

    // Clamp so the two aprons never cross: leave a sliver of ribbon between adjacent junctions.
    const runLen = pathLength(sub);
    const avail = Math.max(0, runLen - 1e-4);
    if (startApron + endApron > avail) {
      const total = startApron + endApron || 1;
      startApron = (startApron / total) * avail;
      endApron = (endApron / total) * avail;
    }

    const cuts: RoadCut[] = [];
    if (startApron > 1e-9) {
      const { point, segment, tangent } = pointAtArcLength(sub, startApron);
      const { left, right } = cornerPair(point, tangent, half);
      cuts.push({ junctionIndex: startJ, at: "start", center: point, direction: tangent, left, right, apron: startApron });
      const kept: RoadPoint[] = [point];
      for (let i = segment + 1; i < sub.length; i += 1) kept.push(sub[i]!);
      sub = kept;
    }
    if (endApron > 1e-9 && sub.length >= 2) {
      const target = pathLength(sub) - endApron;
      const { point, segment, tangent } = pointAtArcLength(sub, target);
      const { left, right } = cornerPair(point, tangent, half);
      cuts.push({
        junctionIndex: endJ,
        at: "end",
        center: point,
        direction: [-tangent[0], -tangent[1]],
        left,
        right,
        apron: endApron,
      });
      const kept: RoadPoint[] = [];
      for (let i = 0; i <= segment; i += 1) kept.push(sub[i]!);
      kept.push(point);
      sub = kept;
    }

    if (sub.length >= 2 && pathLength(sub) > 1e-6) result.push({ path: sub, cuts });
  }
  return result;
}

/** One approach feeding {@link buildJunctionSurface}: the exact draped corner vertices a ribbon ends at. */
export interface JunctionApproach {
  /** Junction-boundary centerline point where the ribbon ends. */
  center: RoadPoint;
  /** Left edge corner (draped `[x, y, z]`) — the ribbon's terminal left vertex. */
  left: readonly [number, number, number];
  /** Right edge corner (draped `[x, y, z]`) — the ribbon's terminal right vertex. */
  right: readonly [number, number, number];
}

/**
 * Weld one triangulated junction surface onto the corner vertices its incident ribbons END at
 * (from {@link trimPathAtJunctions}). Corners are ordered by angle around the node; the two corners
 * of one approach are joined by the ribbon's straight end-edge (the shared seam), and the gap
 * between adjacent approaches is bridged by a sampled curb-return fillet arc of `curbReturnRadius`
 * (clamped so a circle through the two corners exists). The whole boundary is fan-triangulated from
 * the node center, every triangle wound so its normal points +Y. Draped height matches
 * {@link buildRoadRibbon}: `sampleHeight(x, z) + elevation`. Boundary vertices are the approach
 * corners verbatim — no overlap, no floating disc.
 */
export function buildJunctionSurface(
  junction: { x: number; z: number },
  approaches: readonly JunctionApproach[],
  sampleHeight: (x: number, z: number) => number,
  options: JunctionGeometryOptions = {},
): RoadRibbon {
  if (approaches.length === 0) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const elevation = options.elevation ?? GROUND_DECAL_LAYERS.junction;
  const curbReturnRadius = options.curbReturnRadius ?? 4;
  const filletSegments = Math.max(1, Math.floor(options.filletSegments ?? 4));
  const cx = junction.x;
  const cz = junction.z;

  // Collect the 2 corners per approach and order them around the node.
  interface Corner {
    x: number;
    y: number;
    z: number;
    ap: number;
  }
  const corners: Corner[] = [];
  for (let i = 0; i < approaches.length; i += 1) {
    const ap = approaches[i]!;
    corners.push({ x: ap.left[0], y: ap.left[1], z: ap.left[2], ap: i });
    corners.push({ x: ap.right[0], y: ap.right[1], z: ap.right[2], ap: i });
  }
  corners.sort((p, q) => Math.atan2(p.z - cz, p.x - cx) - Math.atan2(q.z - cz, q.x - cx));

  // Boundary ring: each corner, plus a fillet arc across every gap between DIFFERENT approaches.
  const boundary: { x: number; y: number; z: number }[] = [];
  for (let k = 0; k < corners.length; k += 1) {
    const cur = corners[k]!;
    const nxt = corners[(k + 1) % corners.length]!;
    boundary.push({ x: cur.x, y: cur.y, z: cur.z });
    if (cur.ap === nxt.ap) continue; // same approach → the ribbon's straight end-edge (seam)
    const L = Math.hypot(nxt.x - cur.x, nxt.z - cur.z);
    if (L < 1e-6) continue;
    const radius = Math.max(curbReturnRadius, L / 2 + 1e-6);
    const mx = (cur.x + nxt.x) / 2;
    const mz = (cur.z + nxt.z) / 2;
    let ox = mx - cx;
    let oz = mz - cz;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol;
    oz /= ol;
    // Arc center sits on the node side so the arc bulges outward, away from the crossing.
    const h = Math.sqrt(Math.max(0, radius * radius - (L / 2) * (L / 2)));
    const ax = mx - ox * h;
    const az = mz - oz * h;
    const a0 = Math.atan2(cur.z - az, cur.x - ax);
    const a1 = Math.atan2(nxt.z - az, nxt.x - ax);
    let d = a1 - a0;
    while (d <= -Math.PI) d += Math.PI * 2;
    while (d > Math.PI) d -= Math.PI * 2;
    for (let s = 1; s < filletSegments; s += 1) {
      const t = s / filletSegments;
      const ang = a0 + d * t;
      const x = ax + Math.cos(ang) * radius;
      const z = az + Math.sin(ang) * radius;
      boundary.push({ x, y: sampleHeight(x, z) + elevation, z });
    }
  }

  const m = boundary.length;
  const positions = new Float32Array((m + 1) * 3);
  positions[0] = cx;
  positions[1] = sampleHeight(cx, cz) + elevation;
  positions[2] = cz;
  for (let k = 0; k < m; k += 1) {
    const p = boundary[k]!;
    const base = (k + 1) * 3;
    positions[base] = p.x;
    positions[base + 1] = p.y;
    positions[base + 2] = p.z;
  }
  const indices = new Uint32Array(m * 3);
  for (let k = 0; k < m; k += 1) {
    const a = boundary[k]!;
    const b = boundary[(k + 1) % m]!;
    const ai = k + 1;
    const bi = ((k + 1) % m) + 1;
    // Up-normal of triangle (center, a, b): flip the two ring verts if it would face −Y.
    const ny = (a.z - positions[2]!) * (b.x - positions[0]!) - (a.x - positions[0]!) * (b.z - positions[2]!);
    indices[k * 3] = 0;
    if (ny >= 0) {
      indices[k * 3 + 1] = ai;
      indices[k * 3 + 2] = bi;
    } else {
      indices[k * 3 + 1] = bi;
      indices[k * 3 + 2] = ai;
    }
  }
  return { positions, indices };
}

/** One street to trim + mesh through {@link buildTrimmedIntersections}. */
export interface IntersectionStreet {
  /** Street centerline; endpoints/vertices coincide with junction nodes. */
  path: readonly RoadPoint[];
  /** Full road width. */
  width: number;
}

/** Renderer-ready output of {@link buildTrimmedIntersections}: trimmed ribbons + welded junction surfaces. */
export interface TrimmedIntersections {
  /** One trimmed ribbon per surviving sub-path (a through-street contributes two). */
  ribbons: RoadRibbon[];
  /** The trimmed sub-paths, parallel to `ribbons`, for lane markings / analysis. */
  trimmed: TrimmedRoad[];
  /** One welded surface per junction that had ≥1 incident approach. */
  junctions: RoadRibbon[];
}

/**
 * @capability world-intersections Trim a set of streets against a set of junctions and weld the
 * crossing surfaces in one call — the ergonomic entry the shell/playground consume for meshing.
 *
 * Each street is trimmed by {@link trimPathAtJunctions} (through-streets split in two), each surviving
 * sub-path is meshed with {@link buildRoadRibbon}, and every junction that any ribbon actually ends
 * at gets one {@link buildJunctionSurface}. The junction's boundary vertices are read back BITWISE
 * from the ribbons' terminal cross-sections, so ribbon and surface share the exact same floats at
 * the seam — no overlap, no z-fighting, no floating disc. Ribbons and surfaces both live on the
 * seam-shared {@link GROUND_DECAL_LAYERS}.road/.junction layer. Deterministic (junctions emitted in
 * ascending index order) and bounded by the street/junction counts.
 */
export function buildTrimmedIntersections(
  streets: readonly IntersectionStreet[],
  junctions: readonly RoadJunctionInput[],
  sampleHeight: (x: number, z: number) => number,
  options: JunctionGeometryOptions = {},
): TrimmedIntersections {
  const ribbonElevation = options.elevation ?? GROUND_DECAL_LAYERS.road;
  const ribbons: RoadRibbon[] = [];
  const trimmed: TrimmedRoad[] = [];
  const approachesByJunction = new Map<number, JunctionApproach[]>();

  for (let s = 0; s < streets.length; s += 1) {
    const street = streets[s]!;
    const subs = trimPathAtJunctions(street.path, street.width, junctions, options);
    for (let r = 0; r < subs.length; r += 1) {
      const tr = subs[r]!;
      const ribbon = buildRoadRibbon(tr.path, street.width, sampleHeight, {
        elevation: ribbonElevation,
        maxSegmentLength: options.maxSegmentLength,
      });
      if (ribbon.positions.length < 12) continue; // degenerate — no terminal cross-section to weld
      ribbons.push(ribbon);
      trimmed.push(tr);
      const numPoints = ribbon.positions.length / 6;
      for (let c = 0; c < tr.cuts.length; c += 1) {
        const cut = tr.cuts[c]!;
        const leftVert = cut.at === "start" ? 0 : (numPoints - 1) * 2;
        const rightVert = leftVert + 1;
        const approach: JunctionApproach = {
          center: cut.center,
          left: [ribbon.positions[leftVert * 3]!, ribbon.positions[leftVert * 3 + 1]!, ribbon.positions[leftVert * 3 + 2]!],
          right: [ribbon.positions[rightVert * 3]!, ribbon.positions[rightVert * 3 + 1]!, ribbon.positions[rightVert * 3 + 2]!],
        };
        const list = approachesByJunction.get(cut.junctionIndex);
        if (list) list.push(approach);
        else approachesByJunction.set(cut.junctionIndex, [approach]);
      }
    }
  }

  const junctionSurfaces: RoadRibbon[] = [];
  const sortedIndices = [...approachesByJunction.keys()].sort((p, q) => p - q);
  for (let i = 0; i < sortedIndices.length; i += 1) {
    const ji = sortedIndices[i]!;
    const j = junctions[ji]!;
    junctionSurfaces.push(buildJunctionSurface(j, approachesByJunction.get(ji)!, sampleHeight, options));
  }

  return { ribbons, trimmed, junctions: junctionSurfaces };
}
