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
  const n = points.length;
  const half = width / 2;

  // Offset boundaries as 2-D points, then draped. The offsetting has to survive bends: a naive
  // per-vertex perpendicular offset makes the INNER edge of a corner fold back on itself (a bowtie)
  // whenever the local turn radius drops below the half-width — visible as doubled/overlapping road.
  //
  // Two invariants keep downstream welds and the regression suite intact while fixing the fold:
  //   • Endpoints (i=0, i=n−1) and straight interior vertices use the EXACT naive formula
  //     (`centre ± normalAt·half`). buildTrimmedIntersections reads terminal cross-sections back
  //     bitwise, so those floats must never move; straight ribbons stay byte-identical to before.
  //   • Only genuinely BENT interior vertices change: the inner edge gets a real miter join (the
  //     intersection of the two adjacent inner offset lines) and a forward-progress weld that
  //     collapses any residual fold, while the outer edge keeps the smooth naive offset.
  const left: RoadPoint[] = new Array(n);
  const right: RoadPoint[] = new Array(n);
  const turnSign = new Float64Array(n); // >0 left turn (left edge inner), <0 right turn, 0 straight
  const normX = new Float64Array(n);
  const normZ = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const [x, z] = points[i]!;
    const [nx, nz] = normalAt(points, i);
    normX[i] = nx;
    normZ[i] = nz;
    let lx = x + nx * half;
    let lz = z + nz * half;
    let rx = x - nx * half;
    let rz = z - nz * half;
    if (i > 0 && i < n - 1) {
      const p = points[i - 1]!;
      const q = points[i + 1]!;
      const inx = x - p[0];
      const inz = z - p[1];
      const il = Math.hypot(inx, inz);
      const oux = q[0] - x;
      const ouz = q[1] - z;
      const ol = Math.hypot(oux, ouz);
      if (il > 1e-12 && ol > 1e-12) {
        const dix = inx / il;
        const diz = inz / il;
        const dox = oux / ol;
        const doz = ouz / ol;
        const cross = dix * doz - diz * dox; // >0 left turn (left edge is inner), <0 right turn
        if (Math.abs(cross) > 1e-9) {
          turnSign[i] = cross;
          // Left normals of the incoming/outgoing segments; their offset lines intersect at the miter.
          const nix = -diz;
          const niz = dix;
          const nox = -doz;
          const noz = dox;
          const denom = 1 + (nix * nox + niz * noz); // 1 + cosθ; → 0 only at a ~180° reversal
          if (denom > 1e-6) {
            const mvx = (nix + nox) / denom;
            const mvz = (niz + noz) / denom;
            if (cross > 0) {
              // Left edge is inner → miter it; right (outer) stays naive.
              lx = x + mvx * half;
              lz = z + mvz * half;
            } else {
              // Right edge is inner → miter it; left (outer) stays naive.
              rx = x - mvx * half;
              rz = z - mvz * half;
            }
          }
        }
      }
    }
    left[i] = [lx, lz];
    right[i] = [rx, rz];
  }

  // Collapse any inner-edge fold. At interior vertices only, weld an INNER-side vertex onto its kept
  // predecessor when it either (a) fails to advance along the centreline tangent, or (b) has crossed
  // to the far side of the centreline — both signatures of a fold when the turn radius drops below
  // the half-width (the offset curve otherwise inverts and self-intersects). Straight runs and the
  // outer edge of a bend are never inner, so they — and every straight ribbon — stay byte-identical.
  const weldFolds = (edge: RoadPoint[], sideSign: number): void => {
    let kept = edge[0]!;
    for (let i = 1; i < n - 1; i += 1) {
      const inner = sideSign * turnSign[i]! > 0;
      if (!inner) {
        kept = edge[i]!;
        continue;
      }
      const p = points[i - 1]!;
      const q = points[i + 1]!;
      let tx = q[0] - p[0];
      let tz = q[1] - p[1];
      const tl = Math.hypot(tx, tz);
      if (tl <= 1e-12) {
        kept = edge[i]!;
        continue;
      }
      tx /= tl;
      tz /= tl;
      const cx = points[i]![0];
      const cz = points[i]![1];
      const qx = edge[i]![0];
      const qz = edge[i]![1];
      const forward = (qx - kept[0]) * tx + (qz - kept[1]) * tz;
      // Signed distance onto this edge's own outward normal — negative means it crossed the centreline.
      const sideDist = (qx - cx) * (sideSign * normX[i]!) + (qz - cz) * (sideSign * normZ[i]!);
      if (forward <= 1e-9 || sideDist <= 1e-9) {
        edge[i] = [kept[0], kept[1]]; // fold → collapse onto the kept frontier
      } else {
        kept = edge[i]!;
      }
    }
  };
  weldFolds(left, 1);
  weldFolds(right, -1);

  const positions = new Float32Array(n * 6);
  for (let i = 0; i < n; i += 1) {
    const l = left[i]!;
    const r = right[i]!;
    positions[i * 6] = l[0];
    positions[i * 6 + 1] = sampleHeight(l[0], l[1]) + elevation;
    positions[i * 6 + 2] = l[1];
    positions[i * 6 + 3] = r[0];
    positions[i * 6 + 4] = sampleHeight(r[0], r[1]) + elevation;
    positions[i * 6 + 5] = r[1];
  }
  const indices = new Uint32Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i += 1) {
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
  /**
   * Requested curb-return radius at exterior corners between adjacent approaches. Default 2.
   * Clamped per corner by the two adjacent road widths, the corner chord, and available mouth gap —
   * never inflates the paved conflict area the way an apron pull-back would.
   */
  curbReturnRadius?: number;
  /**
   * Extra clearance beyond the projected crossing half-width so ribbons stop just outside the
   * carriageway union. Default 0.25. Does **not** include the curb-return radius (returns live only
   * on the exterior corner arcs).
   */
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
 * Apron pull-back for one approach: how far the ribbon must retreat so its mouth sits on the
 * carriageway-union boundary of the *crossing* arms.
 *
 * For each arm that is neither this approach (dot ≈ +1) nor its through-continuation (dot ≈ −1),
 * the clearance along this centerline is `(arm.width / 2) / sin(φ)` where φ is the angle between
 * the two directions. Orthogonal equal-width roads therefore trim at half-width; a narrow stub
 * into a wide boulevard trims farther; the wide boulevard only trims by the stub's half-width.
 *
 * The curb-return radius is deliberately **not** part of the apron — returns are exterior corner
 * arcs only. Including them here was the oversized-plaza failure mode (mouths pushed out by R,
 * then filleted again).
 */
function apronDistance(
  junction: RoadJunctionInput,
  outward: readonly [number, number],
  margin: number,
  /** Half-width of the approach being trimmed (for acute-angle mouth clearance). */
  selfHalf = 0,
): number {
  const arms = junction.arms;
  if (arms.length === 0) return margin;
  let crossMax = 0;
  let anyCrosser = false;
  let widestHalf = 0;
  for (let j = 0; j < arms.length; j += 1) {
    const half = arms[j]!.width / 2;
    widestHalf = Math.max(widestHalf, half);
    const [ax, az] = armDirection(arms[j]!.angle);
    const dot = outward[0] * ax + outward[1] * az;
    // Same-direction arm or opposite through-continuation — not a crosser.
    if (dot > 0.85 || dot < -0.85) continue;
    // |sin φ| from the 2-D cross magnitude of unit directions.
    const sinPhi = Math.abs(outward[0] * az - outward[1] * ax);
    if (sinPhi < 1e-6) continue;
    anyCrosser = true;
    // Clear the crossing carriageway projected along this centerline.
    let needed = half / sinPhi;
    // Degree-2 acute turns also need enough pull-back that the two mouth end-caps no longer
    // properly cross (a 90° cross is fine at half-width; a 45° fork is not). Multi-arm nodes
    // keep the pure projection so unequal five-ways stay compact.
    if (arms.length === 2) {
      const phi = Math.atan2(sinPhi, Math.max(-1, Math.min(1, Math.abs(dot))));
      if (phi < Math.PI / 2 - 1e-6) {
        const tanHalf = Math.tan(Math.max(phi / 2, 1e-3));
        needed = Math.max(needed, (selfHalf + half) / (2 * tanHalf));
      }
    }
    crossMax = Math.max(crossMax, needed);
  }
  if (!anyCrosser) crossMax = widestHalf;
  return crossMax + margin;
}

/** Clamp a requested curb-return radius by the two adjacent road widths and the corner chord. */
function clampCurbReturnRadius(
  requested: number,
  widthA: number,
  widthB: number,
  chord: number,
): number {
  if (requested <= 0 || chord <= 1e-9) return 0;
  // Ordinary street corners stay well below half the narrower carriageway.
  const byWidth = 0.35 * Math.min(widthA, widthB);
  // A circular return cannot exceed half the gap chord (degenerate semicircle).
  const byChord = chord * 0.45;
  return Math.max(0, Math.min(requested, byWidth, byChord));
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
  const margin = options.apronMargin ?? 0.25;
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
      startApron = apronDistance(junctions[startJ]!, [dx / l, dz / l], margin, half);
    }
    if (endJ !== -1) {
      const last = sub.length - 1;
      const dx = sub[last - 1]![0] - sub[last]![0];
      const dz = sub[last - 1]![1] - sub[last]![1];
      const l = Math.hypot(dx, dz) || 1;
      endApron = apronDistance(junctions[endJ]!, [dx / l, dz / l], margin, half);
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

/** Options for {@link trimBandAtJunctions} — junction geometry tunables plus a band-specific clearance. */
export interface BandTrimOptions extends JunctionGeometryOptions {
  /** Extra outward clearance added to every junction's apron radius before cutting the band. Default 0. */
  clearance?: number;
}

/**
 * Cut an offset band (a polyline running PARALLEL to a street — e.g. a sidewalk from
 * `Street.sidewalks.{left,right}`) out of every junction's apron, so the band stops at the crossing
 * instead of sailing straight through it. Unlike {@link trimPathAtJunctions} the band never passes
 * through a node, so it is clipped by DISTANCE: each junction contributes a circular apron of radius
 * `max arm half-width + apronMargin + bandWidth/2 + clearance` (plus a small curb-return allowance),
 * and any part of the band inside any apron circle is removed, splitting the band into the sub-paths
 * that survive outside. Entry/exit points land exactly on the apron boundary. A band that never
 * enters an apron passes through as a single untouched copy.
 *
 * Pure geometry, deterministic, bounded by the band-vertex and junction counts.
 *
 * @example
 * ```ts
 * // Same `junctions` you fed the roads; trim both sidewalks of a street around every node.
 * const left = trimBandAtJunctions(street.sidewalks.left, street.sidewalkWidth, junctions);
 * const right = trimBandAtJunctions(street.sidewalks.right, street.sidewalkWidth, junctions);
 * for (const sub of [...left, ...right]) meshes.push(buildRoadRibbon(sub, street.sidewalkWidth, sampleHeight));
 * ```
 *
 * @capability world-intersections trim offset sidewalk/parallel bands around junction aprons
 */
export function trimBandAtJunctions(
  bandPath: readonly RoadPoint[],
  bandWidth: number,
  junctions: readonly RoadJunctionInput[],
  options: BandTrimOptions = {},
): RoadPoint[][] {
  if (bandPath.length < 2) return [];
  const curbReturnRadius = options.curbReturnRadius ?? 2;
  const margin = options.apronMargin ?? 0.25;
  const clearance = options.clearance ?? 0;
  const half = Math.max(0, bandWidth) / 2;

  interface Circle {
    x: number;
    z: number;
    r2: number;
  }
  const circles: Circle[] = [];
  for (let ji = 0; ji < junctions.length; ji += 1) {
    const j = junctions[ji]!;
    let maxHalf = 0;
    let minWidth = Infinity;
    for (let a = 0; a < j.arms.length; a += 1) {
      maxHalf = Math.max(maxHalf, j.arms[a]!.width / 2);
      minWidth = Math.min(minWidth, j.arms[a]!.width);
    }
    // Small curb allowance (not the full return) so parallel bands clear exterior corner arcs.
    const curbAllow = Math.min(curbReturnRadius, 0.35 * (Number.isFinite(minWidth) ? minWidth : 0));
    const r = maxHalf + margin + half + clearance + curbAllow;
    if (r > 0) circles.push({ x: j.x, z: j.z, r2: r * r });
  }
  const copy = (): RoadPoint[] => bandPath.map((p) => [p[0], p[1]] as RoadPoint);
  if (circles.length === 0) return [copy()];

  const insideAny = (x: number, z: number): boolean => {
    for (let c = 0; c < circles.length; c += 1) {
      const dx = x - circles[c]!.x;
      const dz = z - circles[c]!.z;
      if (dx * dx + dz * dz < circles[c]!.r2) return true;
    }
    return false;
  };

  const result: RoadPoint[][] = [];
  let cur: RoadPoint[] = [];
  const eps = 1e-9;
  const pushPoint = (p: RoadPoint): void => {
    const last = cur[cur.length - 1];
    if (last === undefined || Math.hypot(last[0] - p[0], last[1] - p[1]) > eps) cur.push(p);
  };
  const closeSub = (): void => {
    if (cur.length >= 2 && pathLength(cur) > eps) result.push(cur);
    cur = [];
  };

  for (let i = 0; i < bandPath.length - 1; i += 1) {
    const a = bandPath[i]!;
    const b = bandPath[i + 1]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    // Every boundary crossing t in (0,1) where the segment meets a circle edge.
    const ts: number[] = [0, 1];
    for (let c = 0; c < circles.length; c += 1) {
      const circle = circles[c]!;
      const fx = a[0] - circle.x;
      const fz = a[1] - circle.z;
      const A = dx * dx + dz * dz;
      if (A < eps) continue;
      const B = 2 * (fx * dx + fz * dz);
      const C = fx * fx + fz * fz - circle.r2;
      const disc = B * B - 4 * A * C;
      if (disc <= 0) continue;
      const sq = Math.sqrt(disc);
      const t0 = (-B - sq) / (2 * A);
      const t1 = (-B + sq) / (2 * A);
      if (t0 > eps && t0 < 1 - eps) ts.push(t0);
      if (t1 > eps && t1 < 1 - eps) ts.push(t1);
    }
    ts.sort((p, q) => p - q);
    for (let s = 0; s < ts.length - 1; s += 1) {
      const t0 = ts[s]!;
      const t1 = ts[s + 1]!;
      if (t1 - t0 < eps) continue;
      const tm = (t0 + t1) / 2;
      const mx = a[0] + dx * tm;
      const mz = a[1] + dz * tm;
      if (insideAny(mx, mz)) {
        closeSub(); // this piece is inside an apron — drop it and break continuity
        continue;
      }
      const p0: RoadPoint = [a[0] + dx * t0, a[1] + dz * t0];
      const p1: RoadPoint = [a[0] + dx * t1, a[1] + dz * t1];
      pushPoint(p0);
      pushPoint(p1);
    }
  }
  closeSub();
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
  /** Unit direction from the node into this approach. Present on approaches emitted by {@link buildTrimmedIntersections}. */
  direction?: readonly [number, number];
  /** Unit tangent in the source street's authored path order. */
  sourceTangent?: readonly [number, number];
  /** Source street index, so consumers never have to infer identity from rendered vertices. */
  streetIndex?: number;
  /** Source trimmed-ribbon index, parallel to {@link TrimmedIntersections.trimmed}. */
  trimmedIndex?: number;
  /** Which end of the source trimmed path meets this junction. */
  cutAt?: "start" | "end";
  /** Full pavement width at this mouth. */
  width?: number;
  /** Sidewalk widths attached to the source path's left and right pavement edges. */
  sidewalkWidths?: IntersectionSidewalkWidths;
  /** Lane-paint declaration inherited from the source street. */
  markings?: IntersectionMarkingIntent;
}

/**
 * Build a tangent-continuous centerline through a two-arm junction. This is the shared path for
 * paint, medians, curbs, or other linear dressing that should follow a bend but stop at crossings.
 * Returns `null` for anything other than exactly two approaches.
 * @capability world-intersections connect linear road dressing through two-arm bends
 */
export function buildJunctionConnector(
  junction: { x: number; z: number },
  approaches: readonly JunctionApproach[],
  segments = 8,
): RoadPoint[] | null {
  if (approaches.length !== 2) return null;
  const a = approaches[0]!.center;
  const b = approaches[1]!.center;
  const aRadius = Math.hypot(a[0] - junction.x, a[1] - junction.z);
  const bRadius = Math.hypot(b[0] - junction.x, b[1] - junction.z);
  let adx = approaches[0]!.direction?.[0] ?? a[0] - junction.x;
  let adz = approaches[0]!.direction?.[1] ?? a[1] - junction.z;
  let bdx = approaches[1]!.direction?.[0] ?? b[0] - junction.x;
  let bdz = approaches[1]!.direction?.[1] ?? b[1] - junction.z;
  const al = Math.hypot(adx, adz);
  const bl = Math.hypot(bdx, bdz);
  if (al < 1e-6 || bl < 1e-6) return null;
  adx /= al;
  adz /= al;
  bdx /= bl;
  bdz /= bl;
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const handle = Math.min(aRadius, bRadius, chord * 0.45);
  const c1x = a[0] - adx * handle;
  const c1z = a[1] - adz * handle;
  const c2x = b[0] - bdx * handle;
  const c2z = b[1] - bdz * handle;
  const count = Math.max(2, Math.min(64, Math.floor(Number.isFinite(segments) ? segments : 8)));
  const path: RoadPoint[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const u = 1 - t;
    path.push([
      u * u * u * a[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b[0],
      u * u * u * a[1] + 3 * u * u * t * c1z + 3 * u * t * t * c2z + t * t * t * b[1],
    ]);
  }
  return path;
}

/**
 * Weld one triangulated junction surface onto the corner vertices its incident ribbons END at
 * (from {@link trimPathAtJunctions}). Corners are grouped by approach (so unequal widths cannot
 * interleave a neighbour between a mouth pair), ordered around the node, and bridged as follows:
 *
 * - **Road mouth** — the straight end-edge of the approach (shared seam with the ribbon).
 * - **Through edge (~180°)** — straight chord along the continuing curb (T-junction far side).
 * - **Exterior corner** — a compact circular curb-return of radius ≤ `curbReturnRadius`, clamped by
 *   adjacent widths and chord length; bows *outward* only, never a plaza disc.
 * - **Two-arm turn** — both edges get the same compact returns (no diagonal cap, no remote tangent).
 *
 * The boundary is ear-clipped so every triangle faces +Y. Draped height matches
 * {@link buildRoadRibbon}. Mouth corners are the approach corners verbatim.
 */
export function buildJunctionSurface(
  junction: { x: number; z: number },
  approaches: readonly JunctionApproach[],
  sampleHeight: (x: number, z: number) => number,
  options: JunctionGeometryOptions = {},
): RoadRibbon {
  if (approaches.length === 0) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const elevation = options.elevation ?? GROUND_DECAL_LAYERS.junction;
  const curbReturnRadius = options.curbReturnRadius ?? 2;
  const filletSegments = Math.max(1, Math.floor(options.filletSegments ?? 4));
  const cx = junction.x;
  const cz = junction.z;

  // Wrap an angle difference into (−π, π].
  const wrapAngle = (a: number): number => {
    let v = a;
    while (v <= -Math.PI) v += Math.PI * 2;
    while (v > Math.PI) v -= Math.PI * 2;
    return v;
  };

  // Group by approach first (unequal aprons must not interleave a neighbour between a mouth pair).
  interface Ap {
    first: { x: number; y: number; z: number };
    second: { x: number; y: number; z: number };
    firstAngle: number;
    secondAngle: number;
    outAngle: number;
    width: number;
  }
  const ordered: Ap[] = [];
  for (let i = 0; i < approaches.length; i += 1) {
    const ap = approaches[i]!;
    const outAngle = ap.direction === undefined
      ? Math.atan2(ap.center[1] - cz, ap.center[0] - cx)
      : Math.atan2(ap.direction[1], ap.direction[0]);
    const leftC = { x: ap.left[0], y: ap.left[1], z: ap.left[2] };
    const rightC = { x: ap.right[0], y: ap.right[1], z: ap.right[2] };
    const leftOff = wrapAngle(Math.atan2(leftC.z - cz, leftC.x - cx) - outAngle);
    const rightOff = wrapAngle(Math.atan2(rightC.z - cz, rightC.x - cx) - outAngle);
    // `first` is the CW-most corner, `second` the CCW-most for a CCW walk around the node.
    const firstIsLeft = leftOff <= rightOff;
    ordered.push({
      first: firstIsLeft ? leftC : rightC,
      second: firstIsLeft ? rightC : leftC,
      firstAngle: Math.atan2((firstIsLeft ? leftC : rightC).z - cz, (firstIsLeft ? leftC : rightC).x - cx),
      secondAngle: Math.atan2((firstIsLeft ? rightC : leftC).z - cz, (firstIsLeft ? rightC : leftC).x - cx),
      outAngle,
      width: ap.width ?? Math.hypot(ap.left[0] - ap.right[0], ap.left[2] - ap.right[2]),
    });
  }
  ordered.sort((p, q) => p.outAngle - q.outAngle);

  /**
   * Compact cubic curb between two mouth corners. Handles follow each approach's edge direction
   * (parallel to the centerline) and are capped so remote edge intersections cannot recreate the
   * plaza-sized blob. Samples stay on the outward side of the chord.
   */
  const pushCurbCubic = (
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
    outAngleA: number,
    outAngleB: number,
    handle: number,
    into: { x: number; y: number; z: number }[],
  ): void => {
    const L = Math.hypot(to.x - from.x, to.z - from.z);
    if (L < 1e-6 || handle < 1e-6) return;
    const adx = Math.cos(outAngleA);
    const adz = Math.sin(outAngleA);
    const bdx = Math.cos(outAngleB);
    const bdz = Math.sin(outAngleB);
    const den = adx * bdz - adz * bdx;
    let hA = handle;
    let hB = handle;
    // Prefer the edge-tangent intersection when it lies a short, finite distance away; otherwise
    // fall back to equal capped handles along each edge.
    if (Math.abs(den) > 1e-6) {
      const qx = to.x - from.x;
      const qz = to.z - from.z;
      const alongA = (qx * bdz - qz * bdx) / den;
      const alongB = (qx * adz - qz * adx) / den;
      const cap = (v: number): number => Math.max(-handle, Math.min(handle, v));
      hA = cap(alongA);
      hB = cap(alongB);
    }
    const c1x = from.x + adx * hA;
    const c1z = from.z + adz * hA;
    const c2x = to.x + bdx * hB;
    const c2z = to.z + bdz * hB;
    // Reject cubics that dive through the junction interior (would look like a diagonal cut).
    const midT = 0.5;
    const u = 1 - midT;
    const mx = u * u * u * from.x + 3 * u * u * midT * c1x + 3 * u * midT * midT * c2x + midT * midT * midT * to.x;
    const mz = u * u * u * from.z + 3 * u * u * midT * c1z + 3 * u * midT * midT * c2z + midT * midT * midT * to.z;
    const chordMx = (from.x + to.x) / 2;
    const chordMz = (from.z + to.z) / 2;
    // Outward = away from node relative to the chord midpoint.
    const away = (chordMx - cx) * (mx - chordMx) + (chordMz - cz) * (mz - chordMz);
    if (away < -1e-6) {
      // Flip handle signs so the bulge faces outward.
      const f1x = from.x - adx * hA;
      const f1z = from.z - adz * hA;
      const f2x = to.x - bdx * hB;
      const f2z = to.z - bdz * hB;
      for (let s = 1; s < filletSegments; s += 1) {
        const t = s / filletSegments;
        const uu = 1 - t;
        const x = uu * uu * uu * from.x + 3 * uu * uu * t * f1x + 3 * uu * t * t * f2x + t * t * t * to.x;
        const z = uu * uu * uu * from.z + 3 * uu * uu * t * f1z + 3 * uu * t * t * f2z + t * t * t * to.z;
        into.push({ x, y: sampleHeight(x, z) + elevation, z });
      }
      return;
    }
    for (let s = 1; s < filletSegments; s += 1) {
      const t = s / filletSegments;
      const uu = 1 - t;
      const x = uu * uu * uu * from.x + 3 * uu * uu * t * c1x + 3 * uu * t * t * c2x + t * t * t * to.x;
      const z = uu * uu * uu * from.z + 3 * uu * uu * t * c1z + 3 * uu * t * t * c2z + t * t * t * to.z;
      into.push({ x, y: sampleHeight(x, z) + elevation, z });
    }
  };

  const boundary: { x: number; y: number; z: number }[] = [];
  let angularFallback = false;
  for (let k = 0; k < ordered.length; k += 1) {
    const ap = ordered[k]!;
    boundary.push(ap.first);
    boundary.push(ap.second);
    if (ordered.length < 2) continue;
    const nxt = ordered[(k + 1) % ordered.length]!;
    const cur = ap.second;
    const to = nxt.first;
    const L = Math.hypot(to.x - cur.x, to.z - cur.z);
    if (L < 1e-6) continue;

    let armGap = wrapAngle(nxt.outAngle - ap.outAngle);
    if (armGap < 0) armGap += Math.PI * 2;

    // Near-parallel two-arm fork: keep the four mouth corners as a compact star-shaped polygon.
    if (ordered.length === 2 && Math.min(armGap, Math.PI * 2 - armGap) < (35 * Math.PI) / 180) {
      angularFallback = true;
      continue;
    }

    if (ordered.length === 2) {
      // Degree-2 bend: the pavement is the L-union of the two strips. The short gap is the inside
      // curb return; the long gap must pass through the outer edge-intersection so the surface is
      // an L, not a diagonal chord (which under-covers) or an interior cubic (which self-crosses).
      const minW = Math.min(ap.width, nxt.width);
      const isOuter = L > minW * 0.75;
      if (!isOuter) {
        const handle = Math.min(curbReturnRadius * 0.55, L * 0.4, minW * 0.35);
        if (handle > 1e-6) pushCurbCubic(cur, to, ap.outAngle, nxt.outAngle, handle, boundary);
        continue;
      }
      const adx = Math.cos(ap.outAngle);
      const adz = Math.sin(ap.outAngle);
      const bdx = Math.cos(nxt.outAngle);
      const bdz = Math.sin(nxt.outAngle);
      const den = adx * bdz - adz * bdx;
      if (Math.abs(den) <= 1e-6) continue;
      const qx = to.x - cur.x;
      const qz = to.z - cur.z;
      const alongA = (qx * bdz - qz * bdx) / den;
      const alongB = (qx * adz - qz * adx) / den;
      // Finite outer corner of the two edge lines; reject near-parallel runaway intersections.
      const maxReach = Math.max(minW * 3, L * 1.5);
      if (!Number.isFinite(alongA) || !Number.isFinite(alongB)) continue;
      if (Math.abs(alongA) > maxReach || Math.abs(alongB) > maxReach) continue;
      const ix = cur.x + adx * alongA;
      const iz = cur.z + adz * alongA;
      // Must lie on the far side of the chord from the node (true outer corner).
      const chordMx = (cur.x + to.x) / 2;
      const chordMz = (cur.z + to.z) / 2;
      if ((ix - chordMx) * (chordMx - cx) + (iz - chordMz) * (chordMz - cz) > 1e-6) continue;
      // Sharp L corner (optionally softened by a few samples pulled slightly toward the corner from
      // each edge so the outer curb is not a single needle vertex on very acute angles).
      const soft = Math.min(curbReturnRadius, minW * 0.25, Math.abs(alongA) * 0.35, Math.abs(alongB) * 0.35);
      if (soft > 1e-3 && filletSegments > 1) {
        for (let s = 1; s < filletSegments; s += 1) {
          const t = s / filletSegments;
          // Quadratic Bezier cur → outer-corner → to: always simple, always covers the L.
          const u = 1 - t;
          const x = u * u * cur.x + 2 * u * t * ix + t * t * to.x;
          const z = u * u * cur.z + 2 * u * t * iz + t * t * to.z;
          boundary.push({ x, y: sampleHeight(x, z) + elevation, z });
        }
      } else {
        boundary.push({ x: ix, y: sampleHeight(ix, iz) + elevation, z: iz });
      }
      continue;
    }

    // Multi-arm through-road far side (~180°): straight curb along the continuing carriageway.
    if (armGap > (150 * Math.PI) / 180) continue;

    // Skip if the next mouth angularly overlaps (would sweep backward across a corner).
    if (wrapAngle(nxt.firstAngle - ap.secondAngle) <= 1e-9) continue;

    const R = clampCurbReturnRadius(curbReturnRadius, ap.width, nxt.width, L);
    if (R < 1e-6) continue;
    // Cubic quarter-circle uses ~0.55R handles; also never exceed the chord budget.
    pushCurbCubic(cur, to, ap.outAngle, nxt.outAngle, Math.min(R * 0.55228475, L * 0.4), boundary);
  }

  if (angularFallback) {
    boundary.sort((p, q) => Math.atan2(p.z - cz, p.x - cx) - Math.atan2(q.z - cz, q.x - cx));
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
  // Ear-clip the grouped ring. A center fan requires a star-shaped polygon and the old global angle
  // sort made one by separating unequal-width approach corners, destroying the exact mouth seam and
  // leaving visible triangular holes. Ear clipping keeps every grouped boundary edge intact.
  const idx: number[] = [];
  const signedCross = (a: number, b: number, c: number): number => {
    const pa = boundary[a]!;
    const pb = boundary[b]!;
    const pc = boundary[c]!;
    return (pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x);
  };
  let area = 0;
  for (let i = 0; i < m; i += 1) {
    const a = boundary[i]!;
    const b = boundary[(i + 1) % m]!;
    area += a.x * b.z - b.x * a.z;
  }
  const orientation = area >= 0 ? 1 : -1;
  const pointInTriangle = (p: number, a: number, b: number, c: number): boolean => {
    const ab = signedCross(a, b, p) * orientation;
    const bc = signedCross(b, c, p) * orientation;
    const ca = signedCross(c, a, p) * orientation;
    return ab >= -1e-9 && bc >= -1e-9 && ca >= -1e-9;
  };
  const remaining = Array.from({ length: m }, (_, i) => i);
  let guard = 0;
  while (remaining.length > 3 && guard < m * m) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < remaining.length; i += 1) {
      const prev = remaining[(i - 1 + remaining.length) % remaining.length]!;
      const ear = remaining[i]!;
      const next = remaining[(i + 1) % remaining.length]!;
      if (signedCross(prev, ear, next) * orientation <= 1e-9) continue;
      let contains = false;
      for (let j = 0; j < remaining.length; j += 1) {
        const point = remaining[j]!;
        if (point === prev || point === ear || point === next) continue;
        if (pointInTriangle(point, prev, ear, next)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      // Standard XZ CCW points down in Three's X/Y/Z winding, so reverse CCW rings for +Y.
      if (orientation > 0) idx.push(prev + 1, next + 1, ear + 1);
      else idx.push(prev + 1, ear + 1, next + 1);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (remaining.length === 3) {
    if (orientation > 0) idx.push(remaining[0]! + 1, remaining[2]! + 1, remaining[1]! + 1);
    else idx.push(remaining[0]! + 1, remaining[1]! + 1, remaining[2]! + 1);
  }
  return { positions, indices: Uint32Array.from(idx) };
}

/** Widths of renderer-neutral sidewalk bands on each authored side of a street. */
export interface IntersectionSidewalkWidths {
  /** Width beyond the left pavement edge. Omit or use zero for no band. */
  left?: number;
  /** Width beyond the right pavement edge. Omit or use zero for no band. */
  right?: number;
}

/** One longitudinal lane-marking ribbon, offset left (+) or right (-) from the authored centerline. */
export interface IntersectionMarkingLine {
  /** Signed centerline offset in world units. Default 0. */
  offset?: number;
  /** Paint width. Default 0.15. */
  width?: number;
}

/** Paint intent carried through trimming without renderer inference. */
export interface IntersectionMarkingIntent {
  /** Longitudinal marking ribbons. */
  lines?: readonly IntersectionMarkingLine[];
  /** Emit a transverse stop line at this street's multi-arm approaches. Default false. */
  stopLine?: boolean;
}

/** One street to trim + mesh through {@link buildTrimmedIntersections}. */
export interface IntersectionStreet {
  /** Street centerline; endpoints/vertices coincide with junction nodes. */
  path: readonly RoadPoint[];
  /** Full road width. */
  width: number;
  /** Optional, independently-sized bands beyond the authored left/right pavement edges. */
  sidewalks?: IntersectionSidewalkWidths;
  /** Optional lane-paint declaration. Omission preserves the previous pavement-only output. */
  markings?: IntersectionMarkingIntent;
}

/** Renderer-ready output of {@link buildTrimmedIntersections}: trimmed ribbons + welded junction surfaces. */
export interface TrimmedIntersections {
  /** One trimmed ribbon per surviving sub-path (a through-street contributes two). */
  ribbons: RoadRibbon[];
  /** The trimmed sub-paths, parallel to `ribbons`, for lane markings / analysis. */
  trimmed: TrimmedRoad[];
  /** One welded surface per junction that had ≥1 incident approach. */
  junctions: RoadRibbon[];
  /** Index into the input `junctions` for each surface, parallel to `junctions` above. */
  junctionIndices: number[];
  /** Exact ribbon-mouth approaches for each surface, parallel to `junctions`; useful for dressing. */
  junctionApproaches: JunctionApproach[][];
  /** Source street index for each entry in `trimmed`/`ribbons`. */
  trimmedStreetIndices: number[];
  /** Source pavement width for each entry in `trimmed`/`ribbons`. */
  trimmedWidths: number[];
  /** Source paint intent for each entry in `trimmed`/`ribbons`. */
  trimmedMarkings: (IntersectionMarkingIntent | undefined)[];
  /** Road-side sidewalk bands, excluding junction interiors. */
  sidewalks: RoadRibbon[];
  /** Sidewalk curb-return aprons around junction pavement; road-mouth edges and center fill are absent. */
  sidewalkAprons: RoadRibbon[];
  /** Input junction index for each entry in `sidewalkAprons`. */
  sidewalkApronJunctionIndices: number[];
}

function offsetPath(path: readonly RoadPoint[], offset: number): RoadPoint[] {
  const out = new Array<RoadPoint>(path.length);
  for (let i = 0; i < path.length; i += 1) {
    const [nx, nz] = normalAt(path, i);
    out[i] = [path[i]![0] + nx * offset, path[i]![1] + nz * offset];
  }
  return out;
}

function buildRoadSidewalk(
  road: RoadRibbon,
  side: "left" | "right",
  width: number,
  sampleHeight: (x: number, z: number) => number,
  elevation: number,
): RoadRibbon {
  const count = road.positions.length / 6;
  if (count < 2 || width <= 0) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const positions = new Float32Array(count * 6);
  for (let i = 0; i < count; i += 1) {
    const leftX = road.positions[i * 6]!;
    const leftZ = road.positions[i * 6 + 2]!;
    const rightX = road.positions[i * 6 + 3]!;
    const rightZ = road.positions[i * 6 + 5]!;
    const innerX = side === "left" ? leftX : rightX;
    const innerZ = side === "left" ? leftZ : rightZ;
    const otherX = side === "left" ? rightX : leftX;
    const otherZ = side === "left" ? rightZ : leftZ;
    const dx = innerX - otherX;
    const dz = innerZ - otherZ;
    const length = Math.hypot(dx, dz) || 1;
    const outerX = innerX + (dx / length) * width;
    const outerZ = innerZ + (dz / length) * width;
    positions[i * 6] = innerX;
    positions[i * 6 + 1] = sampleHeight(innerX, innerZ) + elevation;
    positions[i * 6 + 2] = innerZ;
    positions[i * 6 + 3] = outerX;
    positions[i * 6 + 4] = sampleHeight(outerX, outerZ) + elevation;
    positions[i * 6 + 5] = outerZ;
  }
  const indices = new Uint32Array((count - 1) * 6);
  const writeUpTriangle = (at: number, i0: number, i1: number, i2: number): void => {
    const ax = positions[i1 * 3]! - positions[i0 * 3]!;
    const az = positions[i1 * 3 + 2]! - positions[i0 * 3 + 2]!;
    const bx = positions[i2 * 3]! - positions[i0 * 3]!;
    const bz = positions[i2 * 3 + 2]! - positions[i0 * 3 + 2]!;
    indices[at] = i0;
    if (az * bx - ax * bz >= 0) {
      indices[at + 1] = i1;
      indices[at + 2] = i2;
    } else {
      indices[at + 1] = i2;
      indices[at + 2] = i1;
    }
  };
  for (let i = 0; i < count - 1; i += 1) {
    const a = i * 2;
    writeUpTriangle(i * 6, a, a + 1, a + 2);
    writeUpTriangle(i * 6 + 3, a + 1, a + 3, a + 2);
  }
  return { positions, indices };
}

function buildSidewalkApron(
  junction: { x: number; z: number },
  surface: RoadRibbon,
  approaches: readonly JunctionApproach[],
  sampleHeight: (x: number, z: number) => number,
  elevation: number,
): RoadRibbon {
  const ring: RoadPoint[] = [];
  for (let v = 1; v * 3 + 2 < surface.positions.length; v += 1) {
    ring.push([surface.positions[v * 3]!, surface.positions[v * 3 + 2]!]);
  }
  if (ring.length < 2) return { positions: new Float32Array(0), indices: new Uint32Array(0) };

  interface Corner {
    point: RoadPoint;
    outer: RoadPoint;
    approach: number;
    width: number;
  }
  const corners: Corner[] = [];
  for (let i = 0; i < approaches.length; i += 1) {
    const ap = approaches[i]!;
    const dx = ap.direction?.[0] ?? ap.center[0] - junction.x;
    const dz = ap.direction?.[1] ?? ap.center[1] - junction.z;
    const length = Math.hypot(dx, dz) || 1;
    const ux = dx / length;
    const uz = dz / length;
    // Left normal of the outward approach direction (matches ribbon left/right).
    const nx = -uz;
    const nz = ux;
    const leftWidth = Math.max(0, ap.sidewalkWidths?.left ?? 0);
    const rightWidth = Math.max(0, ap.sidewalkWidths?.right ?? 0);
    const sourceDot = (ap.sourceTangent?.[0] ?? ux) * ux + (ap.sourceTangent?.[1] ?? uz) * uz;
    const left: RoadPoint = [ap.left[0], ap.left[2]];
    const right: RoadPoint = [ap.right[0], ap.right[2]];
    const sourceSign = sourceDot >= 0 ? 1 : -1;
    corners.push({
      point: left,
      outer: [left[0] + nx * leftWidth * sourceSign, left[1] + nz * leftWidth * sourceSign],
      approach: i,
      width: leftWidth,
    });
    corners.push({
      point: right,
      outer: [right[0] - nx * rightWidth * sourceSign, right[1] - nz * rightWidth * sourceSign],
      approach: i,
      width: rightWidth,
    });
  }
  if (corners.length === 0) return { positions: new Float32Array(0), indices: new Uint32Array(0) };

  const nearestCorner = (p: RoadPoint): { corner: Corner; distance: number } => {
    let corner = corners[0]!;
    let distance = Infinity;
    for (let i = 0; i < corners.length; i += 1) {
      const candidate = corners[i]!;
      const d = Math.hypot(candidate.point[0] - p[0], candidate.point[1] - p[1]);
      if (d < distance) {
        corner = candidate;
        distance = d;
      }
    }
    return { corner, distance };
  };

  /**
   * Offset a pavement-boundary point outward along the local ring normal by the sidewalk width.
   * Using the ring normal (not a radial vector from the junction) keeps the apron a constant-width
   * band around the curb — no giant annular/octagonal pads.
   */
  const outerAt = (p: RoadPoint, index: number): RoadPoint => {
    const nearest = nearestCorner(p);
    if (nearest.distance < 1e-3) return nearest.corner.outer;
    const prev = ring[(index - 1 + ring.length) % ring.length]!;
    const next = ring[(index + 1) % ring.length]!;
    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz);
    if (tl < 1e-9) {
      tx = next[0] - p[0];
      tz = next[1] - p[1];
    }
    const tlen = Math.hypot(tx, tz) || 1;
    tx /= tlen;
    tz /= tlen;
    // Outward normal: perpendicular of the tangent pointing away from the node.
    let nx = -tz;
    let nz = tx;
    if ((p[0] - junction.x) * nx + (p[1] - junction.z) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    // Interpolate width from the two nearest mouth corners so unequal sidewalks blend around the arc.
    let w0 = nearest.corner.width;
    let w1 = w0;
    let d1 = Infinity;
    for (const candidate of corners) {
      if (candidate === nearest.corner) continue;
      const d = Math.hypot(candidate.point[0] - p[0], candidate.point[1] - p[1]);
      if (d < d1) {
        d1 = d;
        w1 = candidate.width;
      }
    }
    const t = nearest.distance + d1 > 1e-9 ? d1 / (nearest.distance + d1) : 0.5;
    const width = Math.max(0, w0 * t + w1 * (1 - t));
    if (width < 1e-9) return p;
    return [p[0] + nx * width, p[1] + nz * width];
  };

  const positions: number[] = [];
  const indices: number[] = [];
  const vertices = new Map<string, number>();
  const vertex = (p: RoadPoint): number => {
    const key = `${p[0]},${p[1]}`;
    const found = vertices.get(key);
    if (found !== undefined) return found;
    const index = positions.length / 3;
    positions.push(p[0], sampleHeight(p[0], p[1]) + elevation, p[1]);
    vertices.set(key, index);
    return index;
  };
  const pushUpTriangle = (i0: number, i1: number, i2: number): void => {
    const ax = positions[i1 * 3]! - positions[i0 * 3]!;
    const az = positions[i1 * 3 + 2]! - positions[i0 * 3 + 2]!;
    const bx = positions[i2 * 3]! - positions[i0 * 3]!;
    const bz = positions[i2 * 3 + 2]! - positions[i0 * 3 + 2]!;
    if (az * bx - ax * bz >= 0) indices.push(i0, i1, i2);
    else indices.push(i0, i2, i1);
  };
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const ca = nearestCorner(a);
    const cb = nearestCorner(b);
    // The paired corners of one approach are a road mouth, not sidewalk: leave it open.
    if (ca.distance < 1e-3 && cb.distance < 1e-3 && ca.corner.approach === cb.corner.approach) continue;
    const ao = outerAt(a, i);
    const bo = outerAt(b, (i + 1) % ring.length);
    if (Math.hypot(ao[0] - a[0], ao[1] - a[1]) < 1e-9 && Math.hypot(bo[0] - b[0], bo[1] - b[1]) < 1e-9) continue;
    const ai = vertex(a);
    const bi = vertex(b);
    const aoi = vertex(ao);
    const boi = vertex(bo);
    pushUpTriangle(ai, bi, aoi);
    pushUpTriangle(bi, boi, aoi);
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

/**
 * Trim a set of streets against a set of junctions and weld the crossing surfaces in one call — the
 * ergonomic entry the shell/playground consume for meshing.
 *
 * Each street is trimmed by {@link trimPathAtJunctions} (through-streets split in two), each surviving
 * sub-path is meshed with {@link buildRoadRibbon}, and every junction that any ribbon actually ends
 * at gets one {@link buildJunctionSurface}. The junction's boundary vertices are read back BITWISE
 * from the ribbons' terminal cross-sections, so ribbon and surface share the exact same floats at
 * the seam — no overlap, no z-fighting, no floating disc. Ribbons and surfaces both live on the
 * seam-shared {@link GROUND_DECAL_LAYERS}.road/.junction layer. Deterministic (junctions emitted in
 * ascending index order) and bounded by the street/junction counts.
 *
 * @capability world-intersections trim streets at junctions and weld curb-return crossing surfaces in one call
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
  const trimmedStreetIndices: number[] = [];
  const trimmedWidths: number[] = [];
  const trimmedMarkings: (IntersectionMarkingIntent | undefined)[] = [];
  const sidewalks: RoadRibbon[] = [];
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
      const trimmedIndex = trimmed.length - 1;
      trimmedStreetIndices.push(s);
      trimmedWidths.push(street.width);
      trimmedMarkings.push(street.markings);
      const leftSidewalk = Math.max(0, street.sidewalks?.left ?? 0);
      const rightSidewalk = Math.max(0, street.sidewalks?.right ?? 0);
      if (leftSidewalk > 0) {
        sidewalks.push(buildRoadSidewalk(ribbon, "left", leftSidewalk, sampleHeight, ribbonElevation));
      }
      if (rightSidewalk > 0) {
        sidewalks.push(buildRoadSidewalk(ribbon, "right", rightSidewalk, sampleHeight, ribbonElevation));
      }
      const numPoints = ribbon.positions.length / 6;
      for (let c = 0; c < tr.cuts.length; c += 1) {
        const cut = tr.cuts[c]!;
        const leftVert = cut.at === "start" ? 0 : (numPoints - 1) * 2;
        const rightVert = leftVert + 1;
        const approach: JunctionApproach = {
          center: cut.center,
          left: [ribbon.positions[leftVert * 3]!, ribbon.positions[leftVert * 3 + 1]!, ribbon.positions[leftVert * 3 + 2]!],
          right: [ribbon.positions[rightVert * 3]!, ribbon.positions[rightVert * 3 + 1]!, ribbon.positions[rightVert * 3 + 2]!],
          direction: cut.direction,
          sourceTangent: cut.at === "start" ? cut.direction : [-cut.direction[0], -cut.direction[1]],
          streetIndex: s,
          trimmedIndex,
          cutAt: cut.at,
          width: street.width,
          sidewalkWidths: street.sidewalks,
          markings: street.markings,
        };
        const list = approachesByJunction.get(cut.junctionIndex);
        if (list) list.push(approach);
        else approachesByJunction.set(cut.junctionIndex, [approach]);
      }
    }
  }

  const junctionSurfaces: RoadRibbon[] = [];
  const junctionIndices: number[] = [];
  const junctionApproaches: JunctionApproach[][] = [];
  const sidewalkAprons: RoadRibbon[] = [];
  const sidewalkApronJunctionIndices: number[] = [];
  const sortedIndices = [...approachesByJunction.keys()].sort((p, q) => p - q);
  for (let i = 0; i < sortedIndices.length; i += 1) {
    const ji = sortedIndices[i]!;
    const j = junctions[ji]!;
    const approaches = approachesByJunction.get(ji)!;
    const surface = buildJunctionSurface(j, approaches, sampleHeight, options);
    junctionSurfaces.push(surface);
    const apron = buildSidewalkApron(j, surface, approaches, sampleHeight, ribbonElevation);
    if (apron.indices.length > 0) {
      sidewalkAprons.push(apron);
      sidewalkApronJunctionIndices.push(ji);
    }
    junctionIndices.push(ji);
    junctionApproaches.push(approaches);
  }

  return {
    ribbons,
    trimmed,
    junctions: junctionSurfaces,
    junctionIndices,
    junctionApproaches,
    trimmedStreetIndices,
    trimmedWidths,
    trimmedMarkings,
    sidewalks,
    sidewalkAprons,
    sidewalkApronJunctionIndices,
  };
}

/** Tunables for {@link buildIntersectionMarkings}. */
export interface IntersectionMarkingOptions {
  /** Clearance between a multi-arm road mouth and longitudinal paint / stop lines. Default 1. */
  mouthClearance?: number;
  /** Default longitudinal paint width. Default 0.15. */
  lineWidth?: number;
  /** Transverse stop-line width along the approach. Default 0.35. */
  stopLineWidth?: number;
  /** Gap left between a stop line and each pavement edge. Default 0.5. */
  stopLineEdgeClearance?: number;
  /** Samples in a degree-2 marking connector. Default 8. */
  connectorSegments?: number;
  /** Painted dash length. Omit or use zero for a solid line. */
  dashLength?: number;
  /** Gap between painted dashes. Default 3 when `dashLength` is positive. */
  dashGap?: number;
  /** Marking lift above terrain. Default {@link GROUND_DECAL_LAYERS}.marking. */
  elevation?: number;
  /** Longest draping step. Default 4. */
  maxSegmentLength?: number;
}

function markingPoint(ap: JunctionApproach, line: IntersectionMarkingLine): RoadPoint {
  const tangent = ap.sourceTangent ?? ap.direction ?? [1, 0];
  const offset = Number.isFinite(line.offset) ? line.offset! : 0;
  return [ap.center[0] - tangent[1] * offset, ap.center[1] + tangent[0] * offset];
}

function buildOffsetConnector(
  a: JunctionApproach,
  b: JunctionApproach,
  aLine: IntersectionMarkingLine,
  bLine: IntersectionMarkingLine,
  segments: number,
): RoadPoint[] | null {
  const start = markingPoint(a, aLine);
  const end = markingPoint(b, bLine);
  const ad = a.direction;
  const bd = b.direction;
  if (ad === undefined || bd === undefined) return null;
  const chord = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const handle = chord * 0.45;
  const c1: RoadPoint = [start[0] - ad[0] * handle, start[1] - ad[1] * handle];
  const c2: RoadPoint = [end[0] - bd[0] * handle, end[1] - bd[1] * handle];
  const count = Math.max(2, Math.min(64, Math.floor(Number.isFinite(segments) ? segments : 8)));
  const path: RoadPoint[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const u = 1 - t;
    path.push([
      u * u * u * start[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
      u * u * u * start[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
    ]);
  }
  return path;
}

/**
 * Mesh the paint declared on streets passed to {@link buildTrimmedIntersections}. Longitudinal
 * ribbons follow the trimmed road paths. At degree-2 nodes corresponding lines are joined by a
 * tangent-continuous cubic (signed offsets are preserved); at multi-arm nodes lines deliberately
 * stop short of the mouth and optional transverse stop lines make that termination readable.
 * @capability world-intersections connect sidewalks and lane guidance through generated intersections
 */
export function buildIntersectionMarkings(
  intersections: TrimmedIntersections,
  sampleHeight: (x: number, z: number) => number,
  options: IntersectionMarkingOptions = {},
): RoadRibbon[] {
  const mouthClearance = Math.max(0, options.mouthClearance ?? 1);
  const lineWidth = options.lineWidth ?? 0.15;
  const stopLineWidth = options.stopLineWidth ?? 0.35;
  const edgeClearance = Math.max(0, options.stopLineEdgeClearance ?? 0.5);
  const elevation = options.elevation ?? GROUND_DECAL_LAYERS.marking;
  const requestedStep = options.maxSegmentLength ?? 4;
  const maxSegmentLength = Number.isFinite(requestedStep)
    ? Math.max(0.25, Math.min(100, requestedStep))
    : 4;
  const ribbons: RoadRibbon[] = [];
  const appendLongitudinal = (path: readonly RoadPoint[], width: number): void => {
    const dashLength = options.dashLength ?? 0;
    const pieces = dashLength > 0 ? dashSegments(path, dashLength, Math.max(0, options.dashGap ?? 3)) : [path];
    for (const piece of pieces) {
      const ribbon = buildRoadRibbon(piece, width, sampleHeight, { elevation, maxSegmentLength });
      if (ribbon.indices.length > 0) ribbons.push(ribbon);
    }
  };
  const approachByTrim = new Map<string, { approach: JunctionApproach; degree: number }>();
  for (let j = 0; j < intersections.junctionApproaches.length; j += 1) {
    const approaches = intersections.junctionApproaches[j]!;
    for (const ap of approaches) {
      if (ap.trimmedIndex !== undefined && ap.cutAt !== undefined) {
        approachByTrim.set(`${ap.trimmedIndex}:${ap.cutAt}`, { approach: ap, degree: approaches.length });
      }
    }
  }

  for (let i = 0; i < intersections.trimmed.length; i += 1) {
    const intent = intersections.trimmedMarkings[i];
    if (intent === undefined) continue;
    const trimmed = intersections.trimmed[i]!;
    for (const line of intent.lines ?? []) {
      let path = offsetPath(trimmed.path, line.offset ?? 0);
      let startClearance = 0;
      let endClearance = 0;
      for (const cut of trimmed.cuts) {
        const match = approachByTrim.get(`${i}:${cut.at}`);
        if (match?.degree !== undefined && match.degree > 2) {
          if (cut.at === "start") startClearance = mouthClearance;
          else endClearance = mouthClearance;
        }
      }
      const length = pathLength(path);
      if (startClearance + endClearance >= length - 1e-6) continue;
      if (startClearance > 0) {
        const cut = pointAtArcLength(path, startClearance);
        path = [cut.point, ...path.slice(cut.segment + 1)];
      }
      if (endClearance > 0) {
        const cut = pointAtArcLength(path, pathLength(path) - endClearance);
        path = [...path.slice(0, cut.segment + 1), cut.point];
      }
      appendLongitudinal(path, line.width ?? lineWidth);
    }
  }

  for (let j = 0; j < intersections.junctionApproaches.length; j += 1) {
    const approaches = intersections.junctionApproaches[j]!;
    if (approaches.length === 2) {
      const aLines = approaches[0]!.markings?.lines ?? [];
      const bLines = approaches[1]!.markings?.lines ?? [];
      const candidates: Array<{ a: number; b: number; distance: number }> = [];
      for (let a = 0; a < Math.min(aLines.length, 16); a += 1) {
        for (let b = 0; b < Math.min(bLines.length, 16); b += 1) {
          const ap = markingPoint(approaches[0]!, aLines[a]!);
          const bp = markingPoint(approaches[1]!, bLines[b]!);
          candidates.push({ a, b, distance: Math.hypot(ap[0] - bp[0], ap[1] - bp[1]) });
        }
      }
      candidates.sort((p, q) => p.distance - q.distance || p.a - q.a || p.b - q.b);
      const usedA = new Set<number>();
      const usedB = new Set<number>();
      for (const pair of candidates) {
        if (usedA.has(pair.a) || usedB.has(pair.b)) continue;
        usedA.add(pair.a);
        usedB.add(pair.b);
        const aLine = aLines[pair.a]!;
        const bLine = bLines[pair.b]!;
        const path = buildOffsetConnector(approaches[0]!, approaches[1]!, aLine, bLine, options.connectorSegments ?? 8);
        if (path !== null) {
          const aWidth = Number.isFinite(aLine.width) ? aLine.width! : lineWidth;
          const bWidth = Number.isFinite(bLine.width) ? bLine.width! : lineWidth;
          const width = Math.max(0.01, Math.min(aWidth, bWidth));
          appendLongitudinal(path, width);
        }
      }
      continue;
    }
    if (approaches.length < 3) continue;
    for (const ap of approaches) {
      if (!ap.markings?.stopLine || ap.direction === undefined || ap.width === undefined) continue;
      const half = Math.max(0, ap.width / 2 - edgeClearance);
      if (half <= 0 || stopLineWidth <= 0) continue;
      const cx = ap.center[0] + ap.direction[0] * mouthClearance;
      const cz = ap.center[1] + ap.direction[1] * mouthClearance;
      const nx = -ap.direction[1];
      const nz = ap.direction[0];
      const path: RoadPoint[] = [[cx - nx * half, cz - nz * half], [cx + nx * half, cz + nz * half]];
      ribbons.push(buildRoadRibbon(path, stopLineWidth, sampleHeight, { elevation, maxSegmentLength }));
    }
  }
  return ribbons;
}
