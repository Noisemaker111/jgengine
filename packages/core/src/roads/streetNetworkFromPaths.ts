/**
 * Authored roads as a {@link StreetNetwork}: the adapter that lets hand-drawn streets (editor `road`
 * paths, a game's own road list) feed everything that reads a generated network — above all the
 * street-race lap search (`extractCircuitRoute` / `extractStreetRaces`), so a city a designer drew can
 * host via-pinned laps and sprints exactly like a generated one.
 *
 * Paths are split wherever they cross or end on one another (a T-junction), the pieces become atomic
 * node-to-node {@link StreetEdge}s, each input path becomes one {@link Street}, and junctions (three or
 * more arms) and dead ends are derived. Coordinates pass through unchanged: hand in world XZ and the
 * network is in world XZ.
 *
 * Model code. Every split and merge decision is plain arithmetic (no transcendental Math), so the
 * graph is identical on every engine; only the reported arm headings use `atan2`. Deterministic in
 * input order.
 *
 * @capability street-network-from-paths turn authored road polylines into a street network the race lap search and city tools read
 */
import type { Street, StreetDeadEnd, StreetEdge, StreetJunction, StreetLevel, StreetNetwork, StreetNode, StreetVec2 } from "./streetGenerator";

/** One authored road: a centerline polyline with its carriageway width and hierarchy level. */
export interface StreetPath {
  /** Optional authored id (for the caller's bookkeeping; {@link StreetNetworkFromPaths.pathStreets} maps by index). */
  id?: string;
  points: readonly StreetVec2[];
  /** Carriageway width (m). Default 9. */
  width?: number;
  /** Hierarchy level. Default `street`. */
  level?: StreetLevel;
  /** The path closes back on its first point (a ring road). */
  closed?: boolean;
}

/** Options for {@link streetNetworkFromPaths}. */
export interface StreetNetworkFromPathsOptions {
  /** Distance (m) within which a path end snaps onto another road, and junction points merge. Default 1.5. */
  snap?: number;
  /** Longest span (m) left between consecutive edge points. Default 12. */
  sampleStep?: number;
}

/** The adapted network, plus which street each input path became. */
export interface StreetNetworkFromPaths extends StreetNetwork {
  /** `streets[pathStreets[i]]` is input path `i`; -1 for a path with fewer than two points. */
  pathStreets: number[];
}

const LEVEL_RANK: Record<StreetLevel, number> = { lane: 0, street: 1, avenue: 2, boulevard: 3 };

interface Segment {
  path: number;
  /** Index of the segment within its path. */
  index: number;
  a: StreetVec2;
  b: StreetVec2;
}

function distance(a: StreetVec2, b: StreetVec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  return Math.sqrt(dx * dx + dz * dz);
}

/** Parameter of the closest point to `p` on segment a→b, clamped to [0, 1]. */
function project(p: StreetVec2, a: StreetVec2, b: StreetVec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq < 1e-12) return 0;
  return Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / lengthSq));
}

function lerp(a: StreetVec2, b: StreetVec2, t: number): StreetVec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Proper crossing of two segments: parameters on each, or null. */
function cross(s: Segment, o: Segment): [number, number] | null {
  const rx = s.b[0] - s.a[0];
  const rz = s.b[1] - s.a[1];
  const qx = o.b[0] - o.a[0];
  const qz = o.b[1] - o.a[1];
  const denom = rx * qz - rz * qx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((o.a[0] - s.a[0]) * qz - (o.a[1] - s.a[1]) * qx) / denom;
  const u = ((o.a[0] - s.a[0]) * rz - (o.a[1] - s.a[1]) * rx) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))];
}

/**
 * Build a street network from authored road polylines. Roads join wherever they cross, wherever one
 * ends within `snap` of another, and wherever two ends meet; every other path vertex stays a shape
 * point inside an edge.
 */
export function streetNetworkFromPaths(paths: readonly StreetPath[], options: StreetNetworkFromPathsOptions = {}): StreetNetworkFromPaths {
  const snap = options.snap ?? 1.5;
  const sampleStep = Math.max(1, options.sampleStep ?? 12);
  const polylines = paths.map((path) => {
    const points = path.points.map((p) => [p[0], p[1]] as StreetVec2);
    if (path.closed === true && points.length > 2 && distance(points[0]!, points[points.length - 1]!) > 1e-9) points.push(points[0]!);
    return points;
  });
  const segments: Segment[] = [];
  polylines.forEach((points, path) => {
    for (let i = 0; i + 1 < points.length; i += 1) segments.push({ path, index: i, a: points[i]!, b: points[i + 1]! });
  });
  // Cut parameters per path, as (segment index + t), so a path splits in order along its length.
  const cuts: number[][] = polylines.map((points) => (points.length >= 2 ? [0, points.length - 1] : []));
  const addCut = (path: number, at: number): void => {
    cuts[path]!.push(at);
  };
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i]!;
    for (let j = i + 1; j < segments.length; j += 1) {
      const o = segments[j]!;
      // Neighbouring segments of one path share a vertex; that is not a junction.
      if (s.path === o.path && Math.abs(s.index - o.index) <= 1) continue;
      const hit = cross(s, o);
      if (hit !== null) {
        addCut(s.path, s.index + hit[0]);
        addCut(o.path, o.index + hit[1]);
      }
    }
  }
  // A path END within `snap` of another road is a T-junction even when it stops just short.
  polylines.forEach((points, path) => {
    if (points.length < 2 || paths[path]!.closed === true) return;
    for (const end of [points[0]!, points[points.length - 1]!]) {
      for (const o of segments) {
        if (o.path === path) continue;
        const t = project(end, o.a, o.b);
        if (distance(end, lerp(o.a, o.b, t)) <= snap) addCut(o.path, o.index + t);
      }
    }
  });

  // Nodes: cut points merged within `snap`, first come first served.
  const nodes: { x: number; z: number; degree: number }[] = [];
  const nodeAt = (p: StreetVec2): number => {
    for (let k = 0; k < nodes.length; k += 1) {
      const node = nodes[k]!;
      const dx = node.x - p[0];
      const dz = node.z - p[1];
      if (dx * dx + dz * dz <= snap * snap) return k;
    }
    nodes.push({ x: p[0], z: p[1], degree: 0 });
    return nodes.length - 1;
  };
  const pointOn = (points: readonly StreetVec2[], at: number): StreetVec2 => {
    const index = Math.min(points.length - 2, Math.floor(at));
    return lerp(points[index]!, points[index + 1]!, at - index);
  };

  const edges: StreetEdge[] = [];
  const streets: Street[] = [];
  const pathStreets: number[] = [];
  polylines.forEach((points, path) => {
    if (points.length < 2) {
      pathStreets.push(-1);
      return;
    }
    const source = paths[path]!;
    const width = source.width ?? 9;
    const level = source.level ?? "street";
    const sorted = [...cuts[path]!].sort((a, b) => a - b);
    const stops: number[] = [];
    for (const at of sorted) if (stops.length === 0 || at - stops[stops.length - 1]! > 1e-6) stops.push(at);
    const streetNodes: number[] = [];
    const streetPoints: StreetVec2[] = [];
    for (let k = 0; k + 1 < stops.length; k += 1) {
      const from = stops[k]!;
      const to = stops[k + 1]!;
      const a = nodeAt(pointOn(points, from));
      const b = nodeAt(pointOn(points, to));
      // A piece shorter than the snap distance collapses into its junction.
      if (a === b) continue;
      // Shape points: the path vertices strictly between the cuts, ends snapped onto the nodes.
      const shape: StreetVec2[] = [[nodes[a]!.x, nodes[a]!.z]];
      for (let v = Math.floor(from) + 1; v < to; v += 1) shape.push(points[v]!);
      shape.push([nodes[b]!.x, nodes[b]!.z]);
      const dense: StreetVec2[] = [shape[0]!];
      for (let v = 1; v < shape.length; v += 1) {
        const p = shape[v - 1]!;
        const q = shape[v]!;
        const steps = Math.max(1, Math.ceil(distance(p, q) / sampleStep));
        for (let s = 1; s <= steps; s += 1) dense.push(lerp(p, q, s / steps));
      }
      if (streetNodes.length === 0) streetNodes.push(a);
      streetNodes.push(b);
      for (let v = streetPoints.length === 0 ? 0 : 1; v < dense.length; v += 1) streetPoints.push(dense[v]!);
      nodes[a]!.degree += 1;
      nodes[b]!.degree += 1;
      edges.push({ id: edges.length, a, b, points: dense, width, level, loop: false });
    }
    pathStreets.push(streets.length);
    streets.push({ id: streets.length, nodes: streetNodes, points: streetPoints, width, level, loop: source.closed === true, features: [] });
  });

  const outgoing: { edge: StreetEdge; node: number }[][] = nodes.map(() => []);
  for (const edge of edges) {
    outgoing[edge.a]!.push({ edge, node: edge.a });
    outgoing[edge.b]!.push({ edge, node: edge.b });
  }
  const armHeading = (edge: StreetEdge, node: number): number => {
    const forward = edge.a === node;
    const p = forward ? edge.points[0]! : edge.points[edge.points.length - 1]!;
    const q = forward ? edge.points[1]! : edge.points[edge.points.length - 2]!;
    return Math.atan2(q[0] - p[0], q[1] - p[1]);
  };
  const junctions: StreetJunction[] = [];
  const deadEnds: StreetDeadEnd[] = [];
  nodes.forEach((node, id) => {
    const arms = outgoing[id]!;
    if (arms.length >= 3) {
      let widest = arms[0]!.edge;
      for (const arm of arms) if (LEVEL_RANK[arm.edge.level] > LEVEL_RANK[widest.level] || arm.edge.width > widest.width) widest = arm.edge;
      junctions.push({
        x: node.x,
        z: node.z,
        radius: Math.max(...arms.map((arm) => arm.edge.width)) * 0.5 * 1.15,
        level: widest.level,
        arms: arms.map((arm) => ({ angle: armHeading(arm.edge, id), width: arm.edge.width })),
      });
    } else if (arms.length === 1) {
      const arm = arms[0]!.edge;
      deadEnds.push({ node: id, x: node.x, z: node.z, heading: armHeading(arm, id) + Math.PI, width: arm.width });
    }
  });

  // Independent cycles: E − V + components, over nodes that carry an edge.
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (const edge of edges) parent[find(edge.a)] = find(edge.b);
  const used = nodes.map((_, i) => outgoing[i]!.length > 0);
  const roots = new Set<number>();
  used.forEach((u, i) => {
    if (u) roots.add(find(i));
  });
  const vertexCount = used.filter(Boolean).length;
  const streetNodes: StreetNode[] = nodes.map((node, id) => ({ id, x: node.x, z: node.z, degree: node.degree }));
  return {
    mode: "net",
    nodes: streetNodes,
    edges,
    streets,
    junctions,
    deadEnds,
    bridges: [],
    tunnels: [],
    loops: Math.max(0, edges.length - vertexCount + roots.size),
    pathStreets,
  };
}
