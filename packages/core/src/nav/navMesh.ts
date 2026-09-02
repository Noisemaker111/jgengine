import type { Vec3 } from "../world/geometry";

/** Explicit traversable connection between two navigation polygons. */
export interface NavMeshLink {
  from: number;
  to: number;
  cost?: number;
}

/** Serializable polygon navigation mesh data. */
export interface NavMeshData {
  /** Flat xyz vertex coordinates. Polygon indices refer to triples in this array. */
  verts: number[];
  polys: number[][];
  links: NavMeshLink[];
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
}

function vertex(mesh: NavMeshData, index: number): Vec3 {
  return [mesh.verts[index * 3] ?? 0, mesh.verts[index * 3 + 1] ?? 0, mesh.verts[index * 3 + 2] ?? 0];
}

function center(mesh: NavMeshData, poly: readonly number[]): Vec3 {
  const result: [number, number, number] = [0, 0, 0];
  for (const index of poly) {
    const point = vertex(mesh, index);
    result[0] += point[0]; result[1] += point[1]; result[2] += point[2];
  }
  const scale = poly.length > 0 ? 1 / poly.length : 0;
  return [result[0] * scale, result[1] * scale, result[2] * scale];
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Build polygon adjacency from shared edges and explicit off-mesh links. */
export function buildNavAdjacency(mesh: NavMeshData): NavMeshAdjacency[] {
  const edges = new Map<string, number[]>();
  mesh.polys.forEach((poly, polyIndex) => {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const owners = edges.get(key) ?? [];
      owners.push(polyIndex);
      edges.set(key, owners);
    }
  });
  const result: NavMeshAdjacency[] = mesh.polys.map(() => ({ neighbors: [], cost: 1 }));
  for (const owners of edges.values()) {
    for (const a of owners) for (const b of owners) {
      if (a !== b && !result[a]!.neighbors.includes(b)) result[a]!.neighbors.push(b);
    }
  }
  for (const link of mesh.links ?? []) {
    if (!result[link.from] || !result[link.to]) continue;
    if (!result[link.from]!.neighbors.includes(link.to)) result[link.from]!.neighbors.push(link.to);
  }
  return result;
}

function pointInPoly(mesh: NavMeshData, poly: readonly number[], point: Vec3): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = vertex(mesh, poly[i]!); const b = vertex(mesh, poly[j]!);
    const cross = (point[0] - a[0]) * (b[2] - a[2]) - (point[2] - a[2]) * (b[0] - a[0]);
    const dot = (point[0] - a[0]) * (point[0] - b[0]) + (point[2] - a[2]) * (point[2] - b[2]);
    if (Math.abs(cross) < 1e-8 && dot <= 1e-8) return true;
    if ((a[2] > point[2]) !== (b[2] > point[2]) && point[0] < (b[0] - a[0]) * (point[2] - a[2]) / (b[2] - a[2]) + a[0]) inside = !inside;
  }
  return inside;
}

function closestOnSegment(point: Vec3, a: Vec3, b: Vec3): Vec3 {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = dx * dx + dy * dy + dz * dz;
  const t = len > 0 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy + (point[2] - a[2]) * dz) / len)) : 0;
  return [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t];
}

/** Return the closest point on the mesh surface, or null for an empty mesh. */
export function closestPoint(mesh: NavMeshData, point: Vec3): Vec3 | null {
  let best: Vec3 | null = null; let bestDistance = Number.POSITIVE_INFINITY;
  for (const poly of mesh.polys) {
    if (pointInPoly(mesh, poly, point)) return [point[0], center(mesh, poly)[1], point[2]];
    for (let i = 0; i < poly.length; i += 1) {
      const candidate = closestOnSegment(point, vertex(mesh, poly[i]!), vertex(mesh, poly[(i + 1) % poly.length]!));
      const d = distance(point, candidate);
      if (d < bestDistance) { bestDistance = d; best = candidate; }
    }
  }
  return best;
}

function polyAt(mesh: NavMeshData, point: Vec3): number | null {
  for (let i = 0; i < mesh.polys.length; i += 1) if (pointInPoly(mesh, mesh.polys[i]!, point)) return i;
  const nearest = closestPoint(mesh, point);
  if (!nearest) return null;
  let best = 0; let score = Number.POSITIVE_INFINITY;
  mesh.polys.forEach((poly, i) => { const d = distance(nearest, center(mesh, poly)); if (d < score) { score = d; best = i; } });
  return best;
}

/** A* over polygon centers, followed by deterministic visibility string-pulling. */
export function findPath(mesh: NavMeshData, from: Vec3, to: Vec3): NavMeshPath | null {
  if (mesh.polys.length === 0) return null;
  const start = polyAt(mesh, from), goal = polyAt(mesh, to);
  if (start === null || goal === null) return null;
  const adjacency = buildNavAdjacency(mesh);
  const g = new Map<number, number>([[start, 0]]); const came = new Map<number, number>(); const open = [start];
  while (open.length) {
    open.sort((a, b) => (g.get(a)! + distance(center(mesh, mesh.polys[a]!), center(mesh, mesh.polys[goal]!))) - (g.get(b)! + distance(center(mesh, mesh.polys[b]!), center(mesh, mesh.polys[goal]!))));
    const current = open.shift()!;
    if (current === goal) break;
    for (const next of adjacency[current]!.neighbors) {
      const link = mesh.links.find((candidate) => candidate.from === current && candidate.to === next);
      const cost = link?.cost ?? distance(center(mesh, mesh.polys[current]!), center(mesh, mesh.polys[next]!));
      const nextG = g.get(current)! + Math.max(0, cost);
      if (nextG < (g.get(next) ?? Number.POSITIVE_INFINITY)) { g.set(next, nextG); came.set(next, current); if (!open.includes(next)) open.push(next); }
    }
  }
  if (start !== goal && !came.has(goal)) return null;
  const polys = [goal]; while (polys[0] !== start) polys.unshift(came.get(polys[0]!)!);
  const anchors = [from, ...polys.slice(1, -1).map((i) => center(mesh, mesh.polys[i]!)), to];
  const points: Vec3[] = [anchors[0]!]; let anchor = 0;
  for (let i = 2; i < anchors.length; i += 1) {
    const steps = 24; let visible = true;
    for (let step = 1; step < steps; step += 1) { const t = step / steps; const p: Vec3 = [anchors[anchor]![0] + (anchors[i]![0] - anchors[anchor]![0]) * t, anchors[anchor]![1] + (anchors[i]![1] - anchors[anchor]![1]) * t, anchors[anchor]![2] + (anchors[i]![2] - anchors[anchor]![2]) * t]; if (!mesh.polys.some((poly) => pointInPoly(mesh, poly, p))) { visible = false; break; } }
    if (!visible) { points.push(anchors[i - 1]!); anchor = i - 1; }
  }
  points.push(anchors[anchors.length - 1]!);
  return { points, polys };
}

/** True when the segment remains over walkable polygons. */
export function raycastNav(mesh: NavMeshData, from: Vec3, to: Vec3): boolean {
  for (let i = 0; i <= 32; i += 1) { const t = i / 32; const point: Vec3 = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]; if (!mesh.polys.some((poly) => pointInPoly(mesh, poly, point))) return false; }
  return true;
}
