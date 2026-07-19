/**
 * Deterministic 2D polygon math for the `city` studio's block/parcel pipeline: signed areas,
 * point-in-polygon, half-plane clipping, per-edge inward insets (the curb → sidewalk → land and
 * parcel → buildable transforms), simple-loop recovery after aggressive insets, and rotated-rect
 * fitting inside arbitrary polygons. Pure functions over `[x, z]` tuples — no allocation-heavy
 * classes, no rendering, no randomness — so every consumer from the resolver to the tests shares
 * one geometric truth.
 *
 * @capability city-district polygon math for road-derived blocks, parcels, and buildable footprints
 */

/** A 2D point in district-local or world XZ space. */
export type Vec2 = readonly [number, number];

/** Signed area of a polygon ring (positive = counter-clockwise in XZ). */
export function polygonSignedArea(ring: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    sum += ax * bz - bx * az;
  }
  return sum / 2;
}

/** Absolute polygon area. */
export function polygonArea(ring: readonly Vec2[]): number {
  return Math.abs(polygonSignedArea(ring));
}

/** Ring perimeter length. */
export function polygonPerimeter(ring: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    sum += Math.hypot(bx - ax, bz - az);
  }
  return sum;
}

/** Area centroid of a simple polygon (falls back to the vertex mean for degenerate rings). */
export function polygonCentroid(ring: readonly Vec2[]): Vec2 {
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const cross = ax * bz - bx * az;
    area += cross;
    cx += (ax + bx) * cross;
    cz += (az + bz) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    let mx = 0;
    let mz = 0;
    for (const [x, z] of ring) {
      mx += x;
      mz += z;
    }
    const n = Math.max(1, ring.length);
    return [mx / n, mz / n];
  }
  return [cx / (3 * area), cz / (3 * area)];
}

/** Ensure counter-clockwise winding (positive signed area) without mutating the input. */
export function ensureCcw(ring: readonly Vec2[]): Vec2[] {
  return polygonSignedArea(ring) >= 0 ? ring.map((p) => p) : ring.map((p) => p).reverse();
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(ring: readonly Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the nearest boundary segment of a ring. */
export function distanceToRing(ring: readonly Vec2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    if (d < best) best = d;
  }
  return best;
}

/**
 * Clip a polygon to the half-plane `dot(p, normal) <= limit` (Sutherland–Hodgman step). Returns
 * the surviving ring, possibly empty. The subject may be concave; the output of a single
 * half-plane clip of a simple ring is always a valid (possibly pinched) ring.
 */
export function clipHalfPlane(ring: readonly Vec2[], normal: Vec2, limit: number): Vec2[] {
  const out: Vec2[] = [];
  const [nx, nz] = normal;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const da = a[0] * nx + a[1] * nz - limit;
    const db = b[0] * nx + b[1] * nz - limit;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return dedupeRing(out);
}

/** Split a polygon by the line `dot(p, normal) = limit` into the `<=` and `>=` sides. */
export function splitByLine(ring: readonly Vec2[], normal: Vec2, limit: number): { below: Vec2[]; above: Vec2[] } {
  return {
    below: clipHalfPlane(ring, normal, limit),
    above: clipHalfPlane(ring, [-normal[0], -normal[1]], -limit),
  };
}

/** Remove consecutive (near-)duplicate vertices; returns [] when fewer than 3 survive. */
export function dedupeRing(ring: readonly Vec2[], epsilon = 1e-6): Vec2[] {
  const out: Vec2[] = [];
  for (const p of ring) {
    const prev = out[out.length - 1];
    if (prev !== undefined && Math.abs(prev[0] - p[0]) < epsilon && Math.abs(prev[1] - p[1]) < epsilon) continue;
    out.push(p);
  }
  while (out.length >= 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.abs(first[0] - last[0]) < epsilon && Math.abs(first[1] - last[1]) < epsilon) out.pop();
    else break;
  }
  return out.length >= 3 ? out : [];
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** True when any two non-adjacent edges of the ring properly cross. O(n²), fine for block-scale n. */
export function ringSelfIntersects(ring: readonly Vec2[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      const c = ring[j]!;
      const d = ring[(j + 1) % n]!;
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

/**
 * Recover the dominant simple loop from a lightly self-intersecting ring: whenever two edges
 * cross, the smaller of the two loops the crossing pinches off is dropped. Bounded passes; rings
 * that stay tangled after that return []. This is the cleanup net under aggressive insets — a
 * concave block inset past a neck pinches into a bow-tie, and the bigger lobe is the block.
 */
export function extractSimpleLoop(ring: readonly Vec2[], maxPasses = 6): Vec2[] {
  let current = dedupeRing(ring);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    if (current.length < 4) return current;
    let crossed = false;
    const n = current.length;
    outer: for (let i = 0; i < n; i += 1) {
      const a = current[i]!;
      const b = current[(i + 1) % n]!;
      for (let j = i + 2; j < n; j += 1) {
        if (i === 0 && j === n - 1) continue;
        const c = current[j]!;
        const d = current[(j + 1) % n]!;
        if (!segmentsCross(a, b, c, d)) continue;
        // Intersection point of ab × cd.
        const denom = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
        if (Math.abs(denom) < 1e-12) continue;
        const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denom;
        const px = a[0] + (b[0] - a[0]) * t;
        const pz = a[1] + (b[1] - a[1]) * t;
        // Two candidate loops: i+1..j (+X), and j+1..i (+X).
        const loopA: Vec2[] = [[px, pz]];
        for (let k = i + 1; k <= j; k += 1) loopA.push(current[k]!);
        const loopB: Vec2[] = [[px, pz]];
        for (let k = j + 1; k < n + i + 1; k += 1) loopB.push(current[k % n]!);
        current = polygonArea(loopA) >= polygonArea(loopB) ? dedupeRing(loopA) : dedupeRing(loopB);
        crossed = true;
        break outer;
      }
    }
    if (!crossed) return current;
  }
  return [];
}

/**
 * Inset a CCW ring inward with a PER-EDGE distance (edge i runs vertex i → i+1). True corners take
 * the intersection of the two adjacent offset lines (so a street corner lands exactly where the
 * two curb lines meet, even with different street widths); near-collinear vertices — polyline
 * samples along a curve — fall back to the averaged-normal offset, which is exact in the limit.
 * Returns [] when the inset collapses (sliver) or stays tangled after loop recovery.
 */
export function insetRing(ring: readonly Vec2[], edgeDistances: readonly number[]): Vec2[] {
  const n = ring.length;
  if (n < 3 || edgeDistances.length !== n) return [];
  const out: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = ring[(i + n - 1) % n]!;
    const cur = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const d0 = edgeDistances[(i + n - 1) % n]!;
    const d1 = edgeDistances[i]!;
    const e0: Vec2 = [cur[0] - prev[0], cur[1] - prev[1]];
    const e1: Vec2 = [next[0] - cur[0], next[1] - cur[1]];
    const l0 = Math.hypot(e0[0], e0[1]) || 1;
    const l1 = Math.hypot(e1[0], e1[1]) || 1;
    const u0: Vec2 = [e0[0] / l0, e0[1] / l0];
    const u1: Vec2 = [e1[0] / l1, e1[1] / l1];
    // Inward normal of a CCW ring edge (dx, dz) is (-dz, dx) rotated... for CCW in XZ with
    // signed area computed as above, the interior lies to the LEFT of each edge: left normal
    // of (dx, dz) is (-dz, dx).
    const n0: Vec2 = [-u0[1], u0[0]];
    const n1: Vec2 = [-u1[1], u1[0]];
    const cross = u0[0] * u1[1] - u0[1] * u1[0];
    if (Math.abs(cross) < 0.17) {
      // Near-collinear (sampled curve): averaged normal, averaged distance.
      const ax = (n0[0] + n1[0]) / 2;
      const az = (n0[1] + n1[1]) / 2;
      const al = Math.hypot(ax, az) || 1;
      const d = (d0 + d1) / 2;
      out.push([cur[0] + (ax / al) * d, cur[1] + (az / al) * d]);
    } else {
      // Offset-line intersection: line0 = prev-edge shifted by n0*d0, line1 = next-edge by n1*d1.
      const p0: Vec2 = [cur[0] + n0[0] * d0, cur[1] + n0[1] * d0];
      const p1: Vec2 = [cur[0] + n1[0] * d1, cur[1] + n1[1] * d1];
      const denom = u0[0] * u1[1] - u0[1] * u1[0];
      const t = ((p1[0] - p0[0]) * u1[1] - (p1[1] - p0[1]) * u1[0]) / denom;
      const mx = p0[0] + u0[0] * t;
      const mz = p0[1] + u0[1] * t;
      // Clamp runaway miters (grazing angles) to a bevel-ish point near the vertex.
      const miterLen = Math.hypot(mx - cur[0], mz - cur[1]);
      const maxMiter = Math.max(d0, d1) * 4 + 0.5;
      if (miterLen > maxMiter) {
        const s = maxMiter / miterLen;
        out.push([cur[0] + (mx - cur[0]) * s, cur[1] + (mz - cur[1]) * s]);
      } else {
        out.push([mx, mz]);
      }
    }
  }
  // Over-inset detection BEFORE loop recovery, while vertices still correspond 1:1: an edge that
  // crossed the medial axis runs backwards relative to its source edge. A little flipped length
  // is a pinched lobe (loop recovery trims it); mostly-flipped means the whole ring inverted —
  // note a symmetric over-inset point-reflects, so winding alone cannot catch it.
  let flipped = 0;
  let totalLen = 0;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const a2 = out[i]!;
    const b2 = out[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    totalLen += len;
    if ((b[0] - a[0]) * (b2[0] - a2[0]) + (b[1] - a[1]) * (b2[1] - a2[1]) < 0) flipped += len;
  }
  if (totalLen > 0 && flipped / totalLen > 0.4) return [];
  const cleaned = extractSimpleLoop(out);
  if (cleaned.length < 3) return [];
  // A valid inset shrinks and keeps its winding: reject results that flipped inside-out or exploded.
  if (polygonSignedArea(cleaned) * polygonSignedArea(ring) <= 0) return [];
  const before = polygonArea(ring);
  const after = polygonArea(cleaned);
  if (after <= 1e-6 || after > before * 1.02) return [];
  // Every surviving vertex must stay inside (or on) the source ring.
  for (const [x, z] of cleaned) {
    if (!pointInPolygon(ring, x, z) && distanceToRing(ring, x, z) > 0.35) return [];
  }
  return cleaned;
}

/** Uniform-distance convenience over {@link insetRing}. */
export function insetRingUniform(ring: readonly Vec2[], distance: number): Vec2[] {
  return insetRing(
    ring,
    ring.map(() => distance),
  );
}

/**
 * Mean "width" proxy for sliver detection: the diameter of the largest inscribed strip is
 * approximated by 2·area / perimeter (exact for long rectangles, conservative elsewhere).
 */
export function polygonMeanWidth(ring: readonly Vec2[]): number {
  const perimeter = polygonPerimeter(ring);
  return perimeter <= 1e-6 ? 0 : (2 * polygonArea(ring)) / perimeter;
}

/** All four corners of a rotated rect (center, half-extents, yaw in engine rotationY convention). */
export function rectCorners(cx: number, cz: number, hw: number, hd: number, rotationY: number): Vec2[] {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const out: Vec2[] = [];
  for (const [dx, dz] of [
    [hw, hd],
    [hw, -hd],
    [-hw, -hd],
    [-hw, hd],
  ] as const) {
    out.push([cx + dx * c + dz * s, cz - dx * s + dz * c]);
  }
  return out;
}

/** A rotated rectangle: center, half-extents, and yaw in the engine rotationY convention. */
export interface OrientedRect {
  x: number;
  z: number;
  hw: number;
  hd: number;
  angle: number;
}

/**
 * Separating-axis test for two rotated rectangles: true when a gap exists (no overlap).
 * @capability city-district exact overlap test between two rotated rectangles (plots, lots, footprints)
 */
export function rectsSeparated(a: OrientedRect, b: OrientedRect): boolean {
  const axes: [number, number][] = [];
  for (const angle of [a.angle, b.angle]) {
    axes.push([Math.cos(angle), -Math.sin(angle)], [Math.sin(angle), Math.cos(angle)]);
  }
  const ca = rectCorners(a.x, a.z, a.hw, a.hd, a.angle);
  const cb = rectCorners(b.x, b.z, b.hw, b.hd, b.angle);
  for (const [ax, az] of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const [x, z] of ca) {
      const p = x * ax + z * az;
      if (p < minA) minA = p;
      if (p > maxA) maxA = p;
    }
    for (const [x, z] of cb) {
      const p = x * ax + z * az;
      if (p < minB) minB = p;
      if (p > maxB) maxB = p;
    }
    if (maxA < minB || maxB < minA) return true; // gap on this axis → no overlap
  }
  return false;
}

/** True when a segment touches an axis-aligned box (separating-axis: x, z, and the segment normal). */
function segmentTouchesAabb(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): boolean {
  if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX) return false;
  if (Math.max(az, bz) < minZ || Math.min(az, bz) > maxZ) return false;
  const nx = -(bz - az);
  const nz = bx - ax;
  const d0 = nx * (minX - ax) + nz * (minZ - az);
  const d1 = nx * (maxX - ax) + nz * (minZ - az);
  const d2 = nx * (maxX - ax) + nz * (maxZ - az);
  const d3 = nx * (minX - ax) + nz * (maxZ - az);
  if (d0 > 0 && d1 > 0 && d2 > 0 && d3 > 0) return false;
  if (d0 < 0 && d1 < 0 && d2 < 0 && d3 < 0) return false;
  return true;
}

/**
 * True when a rotated rect stays at least `clearance` away from every segment of a polyline —
 * the plot-contract test that keeps building plots off road corridors (pass the road half-width
 * as the clearance). Exact segment-vs-expanded-rect intersection, not corner sampling.
 * @capability city-district keep a rotated rect (plot/footprint) clear of a road corridor polyline
 */
export function rectClearsPolyline(rect: OrientedRect, path: readonly Vec2[], clearance: number): boolean {
  if (path.length < 2) return true;
  const c = Math.cos(rect.angle);
  const s = Math.sin(rect.angle);
  const ex = rect.hw + clearance;
  const ez = rect.hd + clearance;
  // Cheap world-space bbox reject before transforming segments into the rect frame.
  const reach = Math.hypot(ex, ez);
  const minX = rect.x - reach;
  const maxX = rect.x + reach;
  const minZ = rect.z - reach;
  const maxZ = rect.z + reach;
  let px = path[0]![0];
  let pz = path[0]![1];
  let plx = (px - rect.x) * c - (pz - rect.z) * s;
  let plz = (px - rect.x) * s + (pz - rect.z) * c;
  for (let i = 1; i < path.length; i += 1) {
    const qx = path[i]![0];
    const qz = path[i]![1];
    const inside =
      !(Math.max(px, qx) < minX || Math.min(px, qx) > maxX || Math.max(pz, qz) < minZ || Math.min(pz, qz) > maxZ);
    const qlx = (qx - rect.x) * c - (qz - rect.z) * s;
    const qlz = (qx - rect.x) * s + (qz - rect.z) * c;
    if (inside && segmentTouchesAabb(plx, plz, qlx, qlz, -ex, -ez, ex, ez)) return false;
    px = qx;
    pz = qz;
    plx = qlx;
    plz = qlz;
  }
  return true;
}

/** True when the whole rotated rect (corners + edge midpoints) sits inside the ring. */
export function rectInsidePolygon(ring: readonly Vec2[], cx: number, cz: number, hw: number, hd: number, rotationY: number): boolean {
  const corners = rectCorners(cx, cz, hw, hd, rotationY);
  for (const [x, z] of corners) {
    if (!pointInPolygon(ring, x, z)) return false;
  }
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    if (!pointInPolygon(ring, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) return false;
  }
  return true;
}

/**
 * Fit the largest rect (up to `maxW`×`maxD`, oriented to `rotationY`, centered near `[cx, cz]`)
 * inside a polygon by bounded bisection on a single scale factor. Deterministic; returns null
 * when even `minScale` of the request does not fit after nudging the center inward.
 */
export function fitRectInPolygon(
  ring: readonly Vec2[],
  cx: number,
  cz: number,
  maxW: number,
  maxD: number,
  rotationY: number,
  minScale = 0.55,
): { w: number; d: number; cx: number; cz: number } | null {
  const centers: Vec2[] = [[cx, cz]];
  // Nudge candidates toward the polygon centroid when the raw center fails.
  const [gx, gz] = polygonCentroid(ring);
  centers.push([cx + (gx - cx) * 0.35, cz + (gz - cz) * 0.35], [cx + (gx - cx) * 0.7, cz + (gz - cz) * 0.7]);
  for (const [ux, uz] of centers) {
    if (!pointInPolygon(ring, ux, uz)) continue;
    if (rectInsidePolygon(ring, ux, uz, maxW / 2, maxD / 2, rotationY)) return { w: maxW, d: maxD, cx: ux, cz: uz };
    let lo = 0;
    let hi = 1;
    for (let iter = 0; iter < 9; iter += 1) {
      const mid = (lo + hi) / 2;
      if (rectInsidePolygon(ring, ux, uz, (maxW * mid) / 2, (maxD * mid) / 2, rotationY)) lo = mid;
      else hi = mid;
    }
    if (lo >= minScale) return { w: maxW * lo, d: maxD * lo, cx: ux, cz: uz };
  }
  return null;
}

/**
 * Distance from `origin` along `dir` to the first ring-boundary crossing (ignoring hits closer
 * than `minT`, e.g. the edge the origin sits on). Infinity when the ray never leaves — degenerate.
 */
export function rayDistanceToRing(ring: readonly Vec2[], origin: Vec2, dir: Vec2, minT = 0.6): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const sx = b[0] - a[0];
    const sz = b[1] - a[1];
    const denom = dir[0] * sz - dir[1] * sx;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((a[0] - origin[0]) * sz - (a[1] - origin[1]) * sx) / denom;
    const u = ((a[0] - origin[0]) * dir[1] - (a[1] - origin[1]) * dir[0]) / denom;
    if (t > minT && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  return best;
}

/** Axis-aligned bounding box of a ring. */
export function ringBounds(ring: readonly Vec2[]): { minX: number; minZ: number; maxX: number; maxZ: number } {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

/**
 * Ear-clip a simple polygon into triangles. Returns the cleaned/CCW-oriented vertex ring plus flat
 * index triples into it (so a draping consumer can sample a height per returned vertex). O(n²) —
 * fine for block/park rings. A polygon that stays un-clippable (self-touching after dedupe) yields
 * whatever ears were found before the guard trips; degenerate input returns no triangles.
 */
export function triangulatePolygon(ring: readonly Vec2[]): { positions: Vec2[]; indices: number[] } {
  const positions = ensureCcw(dedupeRing(ring));
  const n = positions.length;
  const indices: number[] = [];
  if (n < 3) return { positions, indices };
  const V: number[] = [];
  for (let i = 0; i < n; i += 1) V.push(i);
  let count = 2 * n;
  let v = n - 1;
  let remaining = n;
  while (remaining > 2) {
    if (count <= 0) break; // Non-simple ring — bail with the ears found so far.
    count -= 1;
    const u = v % remaining;
    v = (u + 1) % remaining;
    const w = (v + 1) % remaining;
    if (isEar(positions, V[u]!, V[v]!, V[w]!, V, remaining)) {
      indices.push(V[u]!, V[v]!, V[w]!);
      for (let s = v; s + 1 < remaining; s += 1) V[s] = V[s + 1]!;
      remaining -= 1;
      count = 2 * remaining;
    }
  }
  return { positions, indices };
}

/** True when triangle (a,b,c) is a valid ear of the CCW polygon: convex and empty of other verts. */
function isEar(poly: readonly Vec2[], ia: number, ib: number, ic: number, V: readonly number[], remaining: number): boolean {
  const a = poly[ia]!;
  const b = poly[ib]!;
  const c = poly[ic]!;
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (cross <= 1e-9) return false; // Reflex or collinear.
  for (let i = 0; i < remaining; i += 1) {
    const p = V[i]!;
    if (p === ia || p === ib || p === ic) continue;
    if (pointInTriangle(poly[p]!, a, b, c)) return false;
  }
  return true;
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * Triangulate the band between two nested rings (an outer ring with an inner hole, e.g. a curb ring
 * around a land ring — the sidewalk). Pairs the loops by cumulative arc-length fraction, aligning
 * the inner start to the outer's first vertex, so it is robust to differing vertex counts and to a
 * rotational offset between the rings. Returns the merged vertex list (outer, then the rotated
 * inner) and index triples into it. Zero-area triangles — where the two rings coincide (a street
 * edge with no sidewalk) — are dropped so `computeVertexNormals` never sees a degenerate face.
 */
export function triangulateRingBand(outer: readonly Vec2[], inner: readonly Vec2[]): { positions: Vec2[]; indices: number[] } {
  const o = dedupeRing(outer);
  const raw = dedupeRing(inner);
  const n = o.length;
  const m = raw.length;
  if (n < 3 || m < 3) return { positions: [], indices: [] };
  // Rotate the inner ring so its first vertex is the one nearest outer[0]: keeps the fraction-based
  // pairing local rather than shearing the band diagonally.
  let start = 0;
  let bestDist = Infinity;
  for (let k = 0; k < m; k += 1) {
    const d = (raw[k]![0] - o[0]![0]) ** 2 + (raw[k]![1] - o[0]![1]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      start = k;
    }
  }
  const i2: Vec2[] = [];
  for (let k = 0; k < m; k += 1) i2.push(raw[(start + k) % m]!);
  const positions: Vec2[] = [...o, ...i2];
  const off = n;
  const ot = ringFractions(o);
  const it = ringFractions(i2);
  const indices: number[] = [];
  const emit = (a: number, b: number, c: number): void => {
    const pa = positions[a]!;
    const pb = positions[b]!;
    const pc = positions[c]!;
    const area2 = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    if (Math.abs(area2) < 1e-6) return; // Coincident rings here (no sidewalk width): skip.
    indices.push(a, b, c);
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const advanceOuter = j >= m || (i < n && ot[i + 1]! <= it[j + 1]!);
    if (advanceOuter) {
      emit(i % n, off + (j % m), (i + 1) % n);
      i += 1;
    } else {
      emit(i % n, off + (j % m), off + ((j + 1) % m));
      j += 1;
    }
  }
  return { positions, indices };
}

/** Cumulative arc-length fractions for a closed ring: length n+1, [0]=0 … [n]=1 (the wrap). */
function ringFractions(ring: readonly Vec2[]): number[] {
  const n = ring.length;
  const cum = [0];
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cum.push(total);
  }
  const scale = total > 1e-9 ? 1 / total : 0;
  for (let i = 0; i < cum.length; i += 1) cum[i]! *= scale;
  return cum;
}

/** Conservative polygon-overlap test: any vertex of one strictly inside the other, or any edges crossing. */
export function polygonsOverlap(a: readonly Vec2[], b: readonly Vec2[], shrink = 0.05): boolean {
  const inset = (ring: readonly Vec2[]): readonly Vec2[] => {
    if (shrink <= 0) return ring;
    const small = insetRingUniform(ring, shrink);
    return small.length >= 3 ? small : ring;
  };
  const sa = inset(a);
  const sb = inset(b);
  for (const [x, z] of sa) if (pointInPolygon(sb, x, z)) return true;
  for (const [x, z] of sb) if (pointInPolygon(sa, x, z)) return true;
  for (let i = 0; i < sa.length; i += 1) {
    const p1 = sa[i]!;
    const p2 = sa[(i + 1) % sa.length]!;
    for (let j = 0; j < sb.length; j += 1) {
      if (segmentsCross(p1, p2, sb[j]!, sb[(j + 1) % sb.length]!)) return true;
    }
  }
  return false;
}
