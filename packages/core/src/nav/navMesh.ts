import type { Vec3 } from "../world/geometry";

/** Explicit traversable connection between two navigation polygons. */
export interface NavMeshLink {
  from: number;
  to: number;
  cost?: number;
  /** Where the link leaves `from`; defaults to that polygon's center. */
  start?: Vec3;
  /** Where the link lands in `to`; defaults to that polygon's center. */
  end?: Vec3;
}

/** Serializable polygon navigation mesh data. Treat it as immutable once queried; queries cache derived geometry per object. */
export interface NavMeshData {
  /** Flat xyz vertex coordinates. Polygon indices refer to triples in this array. */
  verts: number[];
  /** Convex polygons as vertex index lists. */
  polys: number[][];
  links: NavMeshLink[];
  /** Area id per polygon, priced by {@link NavMeshQueryOptions.areaCosts}. */
  areas?: number[];
}

/** Neighbor relationship for one navigation polygon. */
export interface NavMeshAdjacency {
  neighbors: number[];
  cost: number;
}

/** Route points and polygons selected through a navigation mesh. */
export interface NavMeshPath {
  points: Vec3[];
  polys: number[];
  /** True when the search budget ran out and the route ends at the polygon nearest the goal. */
  partial?: boolean;
}

/** Tunable pricing and bounds for a {@link NavMeshQuery}. */
export interface NavMeshQueryOptions {
  /** Cost multiplier per area id; unlisted areas cost 1, and a negative or non-finite cost blocks the area. */
  areaCosts?: Readonly<Record<number, number>>;
  /** Most polygons one path search may expand before returning a partial path. Default 2048. */
  maxNodes?: number;
}

/** Serializable tuning of a {@link NavMeshQuery}. */
export interface NavMeshQuerySnapshot {
  areaCosts: Record<number, number>;
  maxNodes: number;
}

/** Cached, allocation-light queries over one {@link NavMeshData}. */
export interface NavMeshQuery {
  readonly mesh: NavMeshData;
  /** Polygon nearest the point in 3D, so stacked floors resolve by height; null for an empty mesh. */
  findPolygon(point: Vec3): number | null;
  /** Closest point on the mesh surface, or null for an empty mesh. */
  closestPoint(point: Vec3): Vec3 | null;
  /** Cheapest polygon corridor by A*, straightened with a portal funnel. */
  findPath(from: Vec3, to: Vec3): NavMeshPath | null;
  /** True when the straight segment stays on walkable, unblocked polygons. */
  raycast(from: Vec3, to: Vec3): boolean;
  retune(patch: NavMeshQueryOptions): void;
  snapshot(): NavMeshQuerySnapshot;
  restore(next: NavMeshQuerySnapshot): void;
}

const DEFAULT_MAX_NODES = 2048;
const EPS = 1e-9;

interface Prepared {
  mesh: NavMeshData;
  polyCount: number;
  edgeStart: Int32Array;
  edgeNeighbor: Int32Array;
  owners: Map<number, number[]>;
  vertexCount: number;
  bounds: Float64Array;
  centers: Float64Array;
  planes: Float64Array;
  linksFrom: number[][];
  gridMinX: number;
  gridMinZ: number;
  cellSize: number;
  cols: number;
  rows: number;
  cells: number[][];
  stamp: Uint32Array;
  stampId: number;
  g: Float64Array;
  parent: Int32Array;
  viaA: Int32Array;
  viaB: Int32Array;
  viaLink: Int32Array;
  px: Float64Array;
  py: Float64Array;
  pz: Float64Array;
  closed: Uint32Array;
}

const preparedCache = new WeakMap<NavMeshData, Prepared>();

function vx(mesh: NavMeshData, i: number): number { return mesh.verts[i * 3] ?? 0; }
function vy(mesh: NavMeshData, i: number): number { return mesh.verts[i * 3 + 1] ?? 0; }
function vz(mesh: NavMeshData, i: number): number { return mesh.verts[i * 3 + 2] ?? 0; }

function edgeKey(a: number, b: number, vertexCount: number): number {
  return a < b ? a * vertexCount + b : b * vertexCount + a;
}

function prepare(mesh: NavMeshData): Prepared {
  const cached = preparedCache.get(mesh);
  if (cached !== undefined) return cached;
  const polyCount = mesh.polys.length;
  const vertexCount = Math.max(1, Math.floor(mesh.verts.length / 3));
  const edgeStart = new Int32Array(polyCount + 1);
  for (let p = 0; p < polyCount; p += 1) edgeStart[p + 1] = edgeStart[p]! + mesh.polys[p]!.length;
  const owners = new Map<number, number[]>();
  for (let p = 0; p < polyCount; p += 1) {
    const poly = mesh.polys[p]!;
    for (let i = 0; i < poly.length; i += 1) {
      const key = edgeKey(poly[i]!, poly[(i + 1) % poly.length]!, vertexCount);
      const list = owners.get(key);
      if (list === undefined) owners.set(key, [p]);
      else if (!list.includes(p)) list.push(p);
    }
  }
  const edgeNeighbor = new Int32Array(edgeStart[polyCount]!).fill(-1);
  for (let p = 0; p < polyCount; p += 1) {
    const poly = mesh.polys[p]!;
    for (let i = 0; i < poly.length; i += 1) {
      const list = owners.get(edgeKey(poly[i]!, poly[(i + 1) % poly.length]!, vertexCount))!;
      for (const other of list) if (other !== p) { edgeNeighbor[edgeStart[p]! + i] = other; break; }
    }
  }
  const bounds = new Float64Array(polyCount * 4);
  const centers = new Float64Array(polyCount * 3);
  const planes = new Float64Array(polyCount * 3);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let p = 0; p < polyCount; p += 1) {
    const poly = mesh.polys[p]!;
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity, cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const ax = vx(mesh, a), ay = vy(mesh, a), az = vz(mesh, a);
      const bx = vx(mesh, b), by = vy(mesh, b), bz = vz(mesh, b);
      bx0 = Math.min(bx0, ax); bx1 = Math.max(bx1, ax); bz0 = Math.min(bz0, az); bz1 = Math.max(bz1, az);
      cx += ax; cy += ay; cz += az;
      nx += (ay - by) * (az + bz); ny += (az - bz) * (ax + bx); nz += (ax - bx) * (ay + by);
    }
    const scale = poly.length > 0 ? 1 / poly.length : 0;
    centers[p * 3] = cx * scale; centers[p * 3 + 1] = cy * scale; centers[p * 3 + 2] = cz * scale;
    // Height over XZ from the Newell normal: y = cy + sx*(x-cx) + sz*(z-cz); vertical polygons fall back to their mean height.
    planes[p * 3] = cy * scale;
    planes[p * 3 + 1] = Math.abs(ny) > EPS ? -nx / ny : 0;
    planes[p * 3 + 2] = Math.abs(ny) > EPS ? -nz / ny : 0;
    bounds[p * 4] = bx0; bounds[p * 4 + 1] = bz0; bounds[p * 4 + 2] = bx1; bounds[p * 4 + 3] = bz1;
    if (poly.length > 0) { minX = Math.min(minX, bx0); minZ = Math.min(minZ, bz0); maxX = Math.max(maxX, bx1); maxZ = Math.max(maxZ, bz1); }
  }
  if (!Number.isFinite(minX)) { minX = 0; minZ = 0; maxX = 0; maxZ = 0; }
  const width = Math.max(maxX - minX, EPS), depth = Math.max(maxZ - minZ, EPS);
  const cellSize = Math.max(Math.sqrt((width * depth) / Math.max(1, polyCount)), Math.max(width, depth) / 1024, 1e-6);
  const cols = Math.max(1, Math.ceil(width / cellSize)), rows = Math.max(1, Math.ceil(depth / cellSize));
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  for (let p = 0; p < polyCount; p += 1) {
    if (mesh.polys[p]!.length === 0) continue;
    const c0 = clampInt(Math.floor((bounds[p * 4]! - minX) / cellSize), cols), c1 = clampInt(Math.floor((bounds[p * 4 + 2]! - minX) / cellSize), cols);
    const r0 = clampInt(Math.floor((bounds[p * 4 + 1]! - minZ) / cellSize), rows), r1 = clampInt(Math.floor((bounds[p * 4 + 3]! - minZ) / cellSize), rows);
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) cells[r * cols + c]!.push(p);
  }
  const linksFrom: number[][] = Array.from({ length: polyCount }, () => []);
  (mesh.links ?? []).forEach((link, index) => {
    if (link.from >= 0 && link.from < polyCount && link.to >= 0 && link.to < polyCount) linksFrom[link.from]!.push(index);
  });
  const prepared: Prepared = {
    mesh, polyCount, edgeStart, edgeNeighbor, owners, vertexCount, bounds, centers, planes, linksFrom,
    gridMinX: minX, gridMinZ: minZ, cellSize, cols, rows, cells,
    stamp: new Uint32Array(polyCount), stampId: 0,
    g: new Float64Array(polyCount), parent: new Int32Array(polyCount), viaA: new Int32Array(polyCount), viaB: new Int32Array(polyCount), viaLink: new Int32Array(polyCount),
    px: new Float64Array(polyCount), py: new Float64Array(polyCount), pz: new Float64Array(polyCount), closed: new Uint32Array(polyCount),
  };
  preparedCache.set(mesh, prepared);
  return prepared;
}

function clampInt(value: number, size: number): number {
  return Math.min(size - 1, Math.max(0, value));
}

function nextStamp(prep: Prepared): number {
  prep.stampId += 1;
  if (prep.stampId === 0xffffffff) { prep.stamp.fill(0); prep.closed.fill(0); prep.stampId = 1; }
  return prep.stampId;
}

function heightAt(prep: Prepared, p: number, x: number, z: number): number {
  const c = prep.centers;
  return prep.planes[p * 3]! + prep.planes[p * 3 + 1]! * (x - c[p * 3]!) + prep.planes[p * 3 + 2]! * (z - c[p * 3 + 2]!);
}

function insideXZ(prep: Prepared, p: number, x: number, z: number): boolean {
  const b = prep.bounds;
  if (x < b[p * 4]! - EPS || z < b[p * 4 + 1]! - EPS || x > b[p * 4 + 2]! + EPS || z > b[p * 4 + 3]! + EPS) return false;
  const mesh = prep.mesh, poly = mesh.polys[p]!;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = vx(mesh, poly[i]!), az = vz(mesh, poly[i]!), bx = vx(mesh, poly[j]!), bz = vz(mesh, poly[j]!);
    const cross = (x - ax) * (bz - az) - (z - az) * (bx - ax);
    const dot = (x - ax) * (x - bx) + (z - az) * (z - bz);
    if (Math.abs(cross) < 1e-8 && dot <= 1e-8) return true;
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

function closestOnPoly(prep: Prepared, p: number, point: Vec3, out: [number, number, number]): number {
  if (insideXZ(prep, p, point[0], point[2])) {
    out[0] = point[0]; out[1] = heightAt(prep, p, point[0], point[2]); out[2] = point[2];
    return Math.abs(point[1] - out[1]);
  }
  const mesh = prep.mesh, poly = mesh.polys[p]!;
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const ax = vx(mesh, a), ay = vy(mesh, a), az = vz(mesh, a);
    const dx = vx(mesh, b) - ax, dy = vy(mesh, b) - ay, dz = vz(mesh, b) - az;
    const len = dx * dx + dy * dy + dz * dz;
    const t = len > 0 ? Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy + (point[2] - az) * dz) / len)) : 0;
    const qx = ax + dx * t, qy = ay + dy * t, qz = az + dz * t;
    const d = Math.hypot(point[0] - qx, point[1] - qy, point[2] - qz);
    if (d < best) { best = d; out[0] = qx; out[1] = qy; out[2] = qz; }
  }
  return best;
}

function nearestPolygon(prep: Prepared, point: Vec3, out: [number, number, number]): number {
  if (prep.polyCount === 0) return -1;
  const stamp = nextStamp(prep);
  const cs = prep.cellSize;
  const cx = clampInt(Math.floor((point[0] - prep.gridMinX) / cs), prep.cols);
  const cz = clampInt(Math.floor((point[2] - prep.gridMinZ) / cs), prep.rows);
  const maxRing = Math.max(prep.cols, prep.rows);
  const scratch: [number, number, number] = [0, 0, 0];
  let best = -1, bestDistance = Infinity;
  for (let ring = 0; ring <= maxRing; ring += 1) {
    for (let r = cz - ring; r <= cz + ring; r += 1) {
      if (r < 0 || r >= prep.rows) continue;
      const edgeRow = r === cz - ring || r === cz + ring;
      for (let c = cx - ring; c <= cx + ring; c += edgeRow ? 1 : ring * 2 || 1) {
        if (c < 0 || c >= prep.cols) continue;
        for (const p of prep.cells[r * prep.cols + c]!) {
          if (prep.stamp[p] === stamp) continue;
          prep.stamp[p] = stamp;
          const d = closestOnPoly(prep, p, point, scratch);
          if (d < bestDistance - EPS || (Math.abs(d - bestDistance) <= EPS && p < best)) {
            bestDistance = d; best = p; out[0] = scratch[0]; out[1] = scratch[1]; out[2] = scratch[2];
          }
        }
      }
    }
    const left = prep.gridMinX + (cx - ring) * cs, right = prep.gridMinX + (cx + ring + 1) * cs;
    const top = prep.gridMinZ + (cz - ring) * cs, bottom = prep.gridMinZ + (cz + ring + 1) * cs;
    const covered = Math.min(point[0] - left, right - point[0], point[2] - top, bottom - point[2]);
    if (best >= 0 && bestDistance <= covered) break;
  }
  return best;
}

function areaCost(mesh: NavMeshData, costs: Readonly<Record<number, number>>, p: number): number {
  const area = mesh.areas?.[p];
  if (area === undefined) return 1;
  const cost = costs[area];
  if (cost === undefined) return 1;
  return Number.isFinite(cost) && cost >= 0 ? cost : -1;
}

/** Min-heap on `f`, breaking ties toward larger `g` so equal-cost plateaus expand depth-first. */
class MinHeap {
  f: number[] = [];
  g: number[] = [];
  values: number[] = [];
  private less(fa: number, ga: number, va: number, fb: number, gb: number, vb: number): boolean {
    return fa < fb || (fa === fb && (ga > gb || (ga === gb && va < vb)));
  }
  push(f: number, g: number, value: number): void {
    let i = this.values.length;
    this.f.push(f); this.g.push(g); this.values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(f, g, value, this.f[parent]!, this.g[parent]!, this.values[parent]!)) break;
      this.f[i] = this.f[parent]!; this.g[i] = this.g[parent]!; this.values[i] = this.values[parent]!;
      i = parent;
    }
    this.f[i] = f; this.g[i] = g; this.values[i] = value;
  }
  pop(): number {
    const top = this.values[0]!;
    const lf = this.f.pop()!, lg = this.g.pop()!, lv = this.values.pop()!;
    const n = this.values.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let child = i * 2 + 1;
        if (child >= n) break;
        if (child + 1 < n && this.less(this.f[child + 1]!, this.g[child + 1]!, this.values[child + 1]!, this.f[child]!, this.g[child]!, this.values[child]!)) child += 1;
        if (!this.less(this.f[child]!, this.g[child]!, this.values[child]!, lf, lg, lv)) break;
        this.f[i] = this.f[child]!; this.g[i] = this.g[child]!; this.values[i] = this.values[child]!;
        i = child;
      }
      this.f[i] = lf; this.g[i] = lg; this.values[i] = lv;
    }
    return top;
  }
  get size(): number { return this.values.length; }
}

function linkPoint(prep: Prepared, poly: number, point: Vec3 | undefined): Vec3 {
  if (point !== undefined) return point;
  const c = prep.centers;
  return [c[poly * 3]!, c[poly * 3 + 1]!, c[poly * 3 + 2]!];
}

function cross2(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

function samePoint(a: Vec3, b: Vec3): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9;
}

function funnel(start: Vec3, end: Vec3, lefts: Vec3[], rights: Vec3[], out: Vec3[]): void {
  lefts.push(end); rights.push(end);
  let apex = start, left = start, right = start, apexIndex = 0, leftIndex = 0, rightIndex = 0;
  for (let i = 0; i < lefts.length; i += 1) {
    const l = lefts[i]!, r = rights[i]!;
    if (cross2(apex[0], apex[2], right[0], right[2], r[0], r[2]) >= 0) {
      if (samePoint(apex, right) || cross2(apex[0], apex[2], left[0], left[2], r[0], r[2]) < 0) {
        right = r; rightIndex = i + 1;
      } else {
        if (!samePoint(out[out.length - 1]!, left)) out.push(left);
        apex = left; apexIndex = leftIndex; right = apex; rightIndex = apexIndex;
        i = apexIndex - 1;
        continue;
      }
    }
    if (cross2(apex[0], apex[2], left[0], left[2], l[0], l[2]) <= 0) {
      if (samePoint(apex, left) || cross2(apex[0], apex[2], right[0], right[2], l[0], l[2]) > 0) {
        left = l; leftIndex = i + 1;
      } else {
        if (!samePoint(out[out.length - 1]!, right)) out.push(right);
        apex = right; apexIndex = rightIndex; left = apex; leftIndex = apexIndex;
        i = apexIndex - 1;
        continue;
      }
    }
  }
  if (!samePoint(out[out.length - 1]!, end)) out.push(end);
}

function search(prep: Prepared, from: Vec3, to: Vec3, costs: Readonly<Record<number, number>>, maxNodes: number): NavMeshPath | null {
  const mesh = prep.mesh;
  const startPoint: [number, number, number] = [0, 0, 0];
  const goalPoint: [number, number, number] = [0, 0, 0];
  const start = nearestPolygon(prep, from, startPoint);
  const goal = nearestPolygon(prep, to, goalPoint);
  if (start < 0 || goal < 0 || areaCost(mesh, costs, goal) < 0) return null;
  let minCost = 1;
  for (const key in costs) { const c = costs[key]!; if (Number.isFinite(c) && c >= 0) minCost = Math.min(minCost, c); }
  const stamp = nextStamp(prep);
  const { g, parent, viaA, viaB, viaLink, px, py, pz, closed } = prep;
  const heap = new MinHeap();
  const open = (p: number, cost: number, from: number, a: number, b: number, link: number, x: number, y: number, z: number): void => {
    prep.stamp[p] = stamp; g[p] = cost; parent[p] = from; viaA[p] = a; viaB[p] = b; viaLink[p] = link; px[p] = x; py[p] = y; pz[p] = z;
    heap.push(cost + Math.hypot(x - goalPoint[0], y - goalPoint[1], z - goalPoint[2]) * minCost, cost, p);
  };
  open(start, 0, -1, -1, -1, -1, startPoint[0], startPoint[1], startPoint[2]);
  let reached = -1, nearest = start, nearestH = Infinity, expanded = 0;
  while (heap.size > 0) {
    const current = heap.pop();
    if (closed[current] === stamp) continue;
    closed[current] = stamp;
    if (current === goal) { reached = goal; break; }
    const h = Math.hypot(px[current]! - goalPoint[0], py[current]! - goalPoint[1], pz[current]! - goalPoint[2]);
    if (h < nearestH) { nearestH = h; nearest = current; }
    expanded += 1;
    if (expanded > maxNodes) break;
    const here = Math.max(0, areaCost(mesh, costs, current));
    const poly = mesh.polys[current]!;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const list = prep.owners.get(edgeKey(a, b, prep.vertexCount))!;
      if (list.length < 2) continue;
      const mx = (vx(mesh, a) + vx(mesh, b)) / 2, my = (vy(mesh, a) + vy(mesh, b)) / 2, mz = (vz(mesh, a) + vz(mesh, b)) / 2;
      for (const next of list) {
        if (next === current || closed[next] === stamp || areaCost(mesh, costs, next) < 0) continue;
        const cost = g[current]! + Math.hypot(mx - px[current]!, my - py[current]!, mz - pz[current]!) * here;
        if (prep.stamp[next] !== stamp || cost < g[next]!) open(next, cost, current, a, b, -1, mx, my, mz);
      }
    }
    for (const linkIndex of prep.linksFrom[current]!) {
      const link = mesh.links[linkIndex]!;
      const next = link.to;
      if (next === current || closed[next] === stamp || areaCost(mesh, costs, next) < 0) continue;
      const s = linkPoint(prep, current, link.start), e = linkPoint(prep, next, link.end);
      const cost = g[current]! + Math.hypot(s[0] - px[current]!, s[1] - py[current]!, s[2] - pz[current]!) * here
        + Math.max(0, link.cost ?? Math.hypot(e[0] - s[0], e[1] - s[1], e[2] - s[2]));
      if (prep.stamp[next] !== stamp || cost < g[next]!) open(next, cost, current, -1, -1, linkIndex, e[0], e[1], e[2]);
    }
  }
  const partial = reached < 0;
  const last = partial ? nearest : reached;
  const polys: number[] = [];
  for (let p = last; p >= 0; p = parent[p]!) polys.push(p);
  polys.reverse();
  let end: Vec3 = [goalPoint[0], goalPoint[1], goalPoint[2]];
  if (partial) {
    const snapped: [number, number, number] = [0, 0, 0];
    closestOnPoly(prep, last, to, snapped);
    end = snapped;
  }
  const points: Vec3[] = [[startPoint[0], startPoint[1], startPoint[2]]];
  let segmentStart: Vec3 = points[0]!;
  let lefts: Vec3[] = [], rights: Vec3[] = [];
  for (let k = 1; k < polys.length; k += 1) {
    const p = polys[k]!, prev = polys[k - 1]!;
    if (viaLink[p]! >= 0) {
      const link = mesh.links[viaLink[p]!]!;
      funnel(segmentStart, linkPoint(prep, prev, link.start), lefts, rights, points);
      segmentStart = linkPoint(prep, p, link.end);
      if (!samePoint(points[points.length - 1]!, segmentStart)) points.push(segmentStart);
      lefts = []; rights = [];
      continue;
    }
    const a = viaA[p]!, b = viaB[p]!;
    const ax = vx(mesh, a), az = vz(mesh, a), bx = vx(mesh, b), bz = vz(mesh, b);
    const c = prep.centers;
    const dx = c[p * 3]! - c[prev * 3]!, dz = c[p * 3 + 2]! - c[prev * 3 + 2]!;
    const pa: Vec3 = [ax, vy(mesh, a), az], pb: Vec3 = [bx, vy(mesh, b), bz];
    const aIsLeft = dx * (az - bz) - dz * (ax - bx) > 0;
    lefts.push(aIsLeft ? pa : pb); rights.push(aIsLeft ? pb : pa);
  }
  funnel(segmentStart, end, lefts, rights, points);
  return partial ? { points, polys, partial: true } : { points, polys };
}

function raycastPrepared(prep: Prepared, from: Vec3, to: Vec3, costs: Readonly<Record<number, number>>): boolean {
  const mesh = prep.mesh;
  const scratch: [number, number, number] = [0, 0, 0];
  let current = nearestPolygon(prep, from, scratch);
  if (current < 0 || !insideXZ(prep, current, from[0], from[2]) || areaCost(mesh, costs, current) < 0) return false;
  const dx = to[0] - from[0], dz = to[2] - from[2];
  for (let steps = 0; steps <= prep.polyCount; steps += 1) {
    if (insideXZ(prep, current, to[0], to[2])) return true;
    const poly = mesh.polys[current]!;
    let exitEdge = -1, exitT = -Infinity;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const ax = vx(mesh, a), az = vz(mesh, a), ex = vx(mesh, b) - ax, ez = vz(mesh, b) - az;
      const denom = dx * ez - dz * ex;
      if (Math.abs(denom) < EPS) continue;
      const t = ((ax - from[0]) * ez - (az - from[2]) * ex) / denom;
      const s = ((ax - from[0]) * dz - (az - from[2]) * dx) / denom;
      if (s < -1e-7 || s > 1 + 1e-7 || t < -1e-7 || t > 1 + 1e-7) continue;
      if (t > exitT) { exitT = t; exitEdge = i; }
    }
    if (exitEdge < 0) return false;
    const next = prep.edgeNeighbor[prep.edgeStart[current]! + exitEdge]!;
    if (next < 0 || areaCost(mesh, costs, next) < 0) return false;
    current = next;
  }
  return false;
}

/** Build polygon adjacency from shared edges and explicit off-mesh links. */
export function buildNavAdjacency(mesh: NavMeshData): NavMeshAdjacency[] {
  const prep = prepare(mesh);
  const result: NavMeshAdjacency[] = mesh.polys.map(() => ({ neighbors: [], cost: 1 }));
  for (let p = 0; p < prep.polyCount; p += 1) {
    const poly = mesh.polys[p]!;
    for (let i = 0; i < poly.length; i += 1) {
      for (const other of prep.owners.get(edgeKey(poly[i]!, poly[(i + 1) % poly.length]!, prep.vertexCount))!) {
        if (other !== p && !result[p]!.neighbors.includes(other)) result[p]!.neighbors.push(other);
      }
    }
    for (const linkIndex of prep.linksFrom[p]!) {
      const to = mesh.links[linkIndex]!.to;
      if (!result[p]!.neighbors.includes(to)) result[p]!.neighbors.push(to);
    }
  }
  return result;
}

/**
 * Create a cached query over a nav mesh: height-aware polygon lookup through a uniform grid, binary-heap A*
 * priced by area costs and bounded by `maxNodes`, portal-funnel path straightening, and edge-walking raycasts.
 * @capability navmesh-query route, snap, and raycast on a polygon navmesh with retunable area costs and a bounded search
 */
export function createNavMeshQuery(mesh: NavMeshData, options: NavMeshQueryOptions = {}): NavMeshQuery {
  const prep = prepare(mesh);
  let areaCosts: Record<number, number> = { ...(options.areaCosts ?? {}) };
  let maxNodes = Math.max(1, Math.floor(options.maxNodes ?? DEFAULT_MAX_NODES));
  return {
    mesh,
    findPolygon(point) {
      const p = nearestPolygon(prep, point, [0, 0, 0]);
      return p < 0 ? null : p;
    },
    closestPoint(point) {
      const out: [number, number, number] = [0, 0, 0];
      return nearestPolygon(prep, point, out) < 0 ? null : out;
    },
    findPath(from, to) {
      return search(prep, from, to, areaCosts, maxNodes);
    },
    raycast(from, to) {
      return raycastPrepared(prep, from, to, areaCosts);
    },
    retune(patch) {
      if (patch.areaCosts !== undefined) areaCosts = { ...patch.areaCosts };
      if (patch.maxNodes !== undefined) maxNodes = Math.max(1, Math.floor(patch.maxNodes));
    },
    snapshot() {
      return { areaCosts: { ...areaCosts }, maxNodes };
    },
    restore(next) {
      areaCosts = { ...next.areaCosts };
      maxNodes = Math.max(1, Math.floor(next.maxNodes));
    },
  };
}

/** Return the closest point on the mesh surface, or null for an empty mesh. */
export function closestPoint(mesh: NavMeshData, point: Vec3): Vec3 | null {
  const out: [number, number, number] = [0, 0, 0];
  return nearestPolygon(prepare(mesh), point, out) < 0 ? null : out;
}

/** A* over polygon portals with default area costs, straightened by a portal funnel. Use {@link createNavMeshQuery} to price areas. */
export function findPath(mesh: NavMeshData, from: Vec3, to: Vec3): NavMeshPath | null {
  return search(prepare(mesh), from, to, {}, DEFAULT_MAX_NODES);
}

/** True when the segment remains over walkable polygons. */
export function raycastNav(mesh: NavMeshData, from: Vec3, to: Vec3): boolean {
  return raycastPrepared(prepare(mesh), from, to, {});
}
