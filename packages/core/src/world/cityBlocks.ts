/**
 * Block-first city fabric for the `city` studio: turns the synthesized street network into a
 * planar graph, extracts its faces as CLOSED BLOCK POLYGONS (a curved street yields a curved
 * block edge, a diagonal one a diagonal edge), insets each block by its bordering roads'
 * half-widths into curb and land rings (the sidewalk band lives between them), classifies every
 * block (buildable, park, plaza, field, buffer sliver), subdivides buildable block frontage into
 * POLYGONAL PARCELS with street references and corner status, and computes per-parcel BUILDABLE
 * polygons after setbacks. Buildings then derive from parcel geometry instead of nearest-road
 * guesses. Pure seeded math over `cityGeometry` primitives — no rendering, bounded work.
 *
 * @capability city-district road-derived block polygons, parcel subdivision, buildable footprints
 */
import {
  clipHalfPlane,
  dedupeRing,
  distanceToRing,
  ensureCcw,
  extractSimpleLoop,
  insetRing,
  pointInPolygon,
  polygonArea,
  polygonMeanWidth,
  polygonSignedArea,
  type Vec2,
} from "./cityGeometry";

/** How a block (a face of the road graph) is used. */
export type CityBlockKind = "buildable" | "park" | "plaza" | "field" | "buffer";

/** One closed block: a face of the road network, inset to its curb and land boundaries. */
export interface CityBlockLocal {
  id: string;
  /** Face polygon on road CENTERLINES (CCW) — the raw graph face. */
  face: Vec2[];
  /** Street index bordering each face edge (edge i = face[i]→face[i+1]); -1 = district boundary. */
  faceStreets: number[];
  /** Pavement edge: face inset by each bordering road's half width (+ curb margin). */
  curb: Vec2[];
  /** Land edge: curb inset further by the sidewalk band where the bordering street has one. */
  polygon: Vec2[];
  kind: CityBlockKind;
  area: number;
}

/** One street-frontage reference of a parcel. */
export interface CityParcelFrontage {
  /** Index into the resolved city's street list. */
  street: number;
  /** Frontage chord endpoints on the parcel boundary. */
  edgeStart: Vec2;
  edgeEnd: Vec2;
  /** Unit tangent along the frontage chord. */
  tangent: Vec2;
}

/** How a parcel is used after occupancy/fitting rolls. */
export type CityParcelKind = "built" | "vacant" | "yard";

/** One polygonal parcel subdivided out of a block's street frontage. */
export interface CityParcelLocal {
  id: string;
  block: number;
  polygon: Vec2[];
  /** Buildable polygon after front/side/rear setbacks; [] when setbacks consume the parcel. */
  buildable: Vec2[];
  frontage: CityParcelFrontage[];
  area: number;
  /** Usable depth from the frontage chord to the parcel rear. */
  depth: number;
  isCorner: boolean;
  kind: CityParcelKind;
}

/** Minimal street shape the fabric needs (matches cityKind's LocalStreet). */
export interface FabricStreet {
  points: readonly (readonly [number, number])[];
  width: number;
  level: "boulevard" | "avenue" | "street" | "lane";
  sidewalk: boolean;
}

const MAX_BLOCKS = 420;
const WELD_RADIUS = 1.4;
const RIM_SNAP = 6;

interface GraphNode {
  x: number;
  z: number;
  /** Outgoing half-edge ids. */
  out: number[];
}

interface HalfEdge {
  from: number;
  to: number;
  /** Polyline from `from` to `to` inclusive. */
  pts: Vec2[];
  street: number;
  /** Id of the opposite half-edge. */
  twin: number;
  /** Departure angle at `from`. */
  angle: number;
  visited: boolean;
}

/** Sidewalk band width by street hierarchy (base = the district's street-level width). */
export function sidewalkWidthFor(level: FabricStreet["level"], base: number): number {
  switch (level) {
    case "boulevard":
      return base * 1.6;
    case "avenue":
      return base * 1.25;
    case "street":
      return base;
    case "lane":
      return base * 0.75;
  }
}

function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): { t: number; u: number; x: number; z: number } | null {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / denom;
  const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)), x: a[0] + rx * t, z: a[1] + rz * t };
}

interface SplitPoint {
  seg: number;
  t: number;
  x: number;
  z: number;
}

/**
 * Build the planar road graph: split every street polyline at its crossings with other streets,
 * weld endpoints into shared nodes, extend near-rim ends onto the district boundary, close the
 * boundary as edges, and prune dangling chains (dead ends can't border a closed face). Returns
 * the half-edge structure plus the pruned dead-end chains (cul-de-sacs) for corridor carving.
 */
function buildGraph(
  streets: readonly FabricStreet[],
  hx: number,
  hz: number,
): { nodes: GraphNode[]; halves: HalfEdge[]; deadEnds: { pts: Vec2[]; width: number }[] } {
  // --- 1. collect crossings per street segment (spatial hash to bound pair tests) ---
  const cell = 14;
  const buckets = new Map<string, { street: number; seg: number; a: Vec2; b: Vec2 }[]>();
  const segsOf: { a: Vec2; b: Vec2 }[][] = [];
  for (let s = 0; s < streets.length; s += 1) {
    const pts = streets[s]!.points;
    const segs: { a: Vec2; b: Vec2 }[] = [];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a: Vec2 = [pts[i]![0], pts[i]![1]];
      const b: Vec2 = [pts[i + 1]![0], pts[i + 1]![1]];
      segs.push({ a, b });
      const minX = Math.min(a[0], b[0]);
      const maxX = Math.max(a[0], b[0]);
      const minZ = Math.min(a[1], b[1]);
      const maxZ = Math.max(a[1], b[1]);
      for (let cx = Math.floor(minX / cell); cx <= Math.floor(maxX / cell); cx += 1) {
        for (let cz = Math.floor(minZ / cell); cz <= Math.floor(maxZ / cell); cz += 1) {
          const key = `${cx}:${cz}`;
          const bucket = buckets.get(key);
          const entry = { street: s, seg: i, a, b };
          if (bucket === undefined) buckets.set(key, [entry]);
          else bucket.push(entry);
        }
      }
    }
    segsOf.push(segs);
  }
  const splits: SplitPoint[][] = streets.map(() => []);
  const seen = new Set<string>();
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const p = bucket[i]!;
        const q = bucket[j]!;
        if (p.street === q.street) continue;
        const pairKey = `${p.street}:${p.seg}:${q.street}:${q.seg}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const hit = segIntersect(p.a, p.b, q.a, q.b);
        if (hit === null) continue;
        splits[p.street]!.push({ seg: p.seg, t: hit.t, x: hit.x, z: hit.z });
        splits[q.street]!.push({ seg: q.seg, t: hit.u, x: hit.x, z: hit.z });
      }
    }
  }

  // --- 2. weld nodes ---
  const nodes: GraphNode[] = [];
  const nodeGrid = new Map<string, number[]>();
  const nodeAt = (x: number, z: number): number => {
    const gx = Math.floor(x / 4);
    const gz = Math.floor(z / 4);
    for (let i = gx - 1; i <= gx + 1; i += 1) {
      for (let j = gz - 1; j <= gz + 1; j += 1) {
        const bucket = nodeGrid.get(`${i}:${j}`);
        if (bucket === undefined) continue;
        for (const id of bucket) {
          const node = nodes[id]!;
          if (Math.hypot(node.x - x, node.z - z) <= WELD_RADIUS) return id;
        }
      }
    }
    const id = nodes.length;
    nodes.push({ x, z, out: [] });
    const key = `${gx}:${gz}`;
    const bucket = nodeGrid.get(key);
    if (bucket === undefined) nodeGrid.set(key, [id]);
    else bucket.push(id);
    return id;
  };

  // --- 3. split streets into chains between crossing nodes ---
  interface Chain {
    pts: Vec2[];
    street: number;
  }
  const chains: Chain[] = [];
  for (let s = 0; s < streets.length; s += 1) {
    const pts = streets[s]!.points;
    if (pts.length < 2) continue;
    const cuts = splits[s]!;
    cuts.sort((a, b) => (a.seg === b.seg ? a.t - b.t : a.seg - b.seg));
    let current: Vec2[] = [[pts[0]![0], pts[0]![1]]];
    let cutIdx = 0;
    for (let i = 0; i + 1 < pts.length; i += 1) {
      while (cutIdx < cuts.length && cuts[cutIdx]!.seg === i) {
        const cut = cuts[cutIdx]!;
        cutIdx += 1;
        const point: Vec2 = [cut.x, cut.z];
        const last = current[current.length - 1]!;
        if (Math.hypot(last[0] - point[0], last[1] - point[1]) > 0.05) current.push(point);
        if (current.length >= 2) chains.push({ pts: current, street: s });
        current = [point];
      }
      const next: Vec2 = [pts[i + 1]![0], pts[i + 1]![1]];
      const last = current[current.length - 1]!;
      if (Math.hypot(last[0] - next[0], last[1] - next[1]) > 0.05) current.push(next);
    }
    if (current.length >= 2) chains.push({ pts: current, street: s });
  }

  // --- 4. snap near-rim chain ends onto the boundary rectangle ---
  const snapRim = (p: Vec2): Vec2 | null => {
    const dxs = [Math.abs(p[0] + hx), Math.abs(p[0] - hx), Math.abs(p[1] + hz), Math.abs(p[1] - hz)];
    const nearest = Math.min(...dxs);
    if (nearest > RIM_SNAP) return null;
    if (nearest === dxs[0]) return [-hx, Math.max(-hz, Math.min(hz, p[1]))];
    if (nearest === dxs[1]) return [hx, Math.max(-hz, Math.min(hz, p[1]))];
    if (nearest === dxs[2]) return [Math.max(-hx, Math.min(hx, p[0])), -hz];
    return [Math.max(-hx, Math.min(hx, p[0])), hz];
  };

  interface Edge {
    from: number;
    to: number;
    pts: Vec2[];
    street: number;
    width: number;
  }
  const edges: Edge[] = [];
  const rimNodeIds = new Set<number>();
  for (const chain of chains) {
    const first = chain.pts[0]!;
    const last = chain.pts[chain.pts.length - 1]!;
    let start = first;
    let end = last;
    const rimStart = snapRim(first);
    const rimEnd = snapRim(last);
    const pts = chain.pts.map((p) => p);
    if (rimStart !== null) {
      start = rimStart;
      pts[0] = rimStart;
    }
    if (rimEnd !== null) {
      end = rimEnd;
      pts[pts.length - 1] = rimEnd;
    }
    const from = nodeAt(start[0], start[1]);
    const to = nodeAt(end[0], end[1]);
    if (from === to && chain.pts.length < 4) continue;
    pts[0] = [nodes[from]!.x, nodes[from]!.z];
    pts[pts.length - 1] = [nodes[to]!.x, nodes[to]!.z];
    if (rimStart !== null) rimNodeIds.add(from);
    if (rimEnd !== null) rimNodeIds.add(to);
    edges.push({ from, to, pts: dedupePolyline(pts), street: chain.street, width: streets[chain.street]!.width });
  }

  // --- 5. boundary edges: corners + rim nodes, walked around the perimeter ---
  const corners = [nodeAt(-hx, -hz), nodeAt(hx, -hz), nodeAt(hx, hz), nodeAt(-hx, hz)];
  rimNodeIds.add(corners[0]!);
  rimNodeIds.add(corners[1]!);
  rimNodeIds.add(corners[2]!);
  rimNodeIds.add(corners[3]!);
  const perimParam = (id: number): number => {
    const node = nodes[id]!;
    const x = node.x;
    const z = node.z;
    // Walk: bottom (z=-hz, x -hx→hx), right (x=hx, z -hz→hz), top (z=hz, x hx→-hx), left.
    if (Math.abs(z + hz) <= RIM_SNAP + 0.01 && Math.abs(x) <= hx + 0.01) return x + hx;
    if (Math.abs(x - hx) <= RIM_SNAP + 0.01) return 2 * hx + (z + hz);
    if (Math.abs(z - hz) <= RIM_SNAP + 0.01) return 2 * hx + 2 * hz + (hx - x);
    return 4 * hx + 2 * hz + (hz - z);
  };
  const rimSorted = [...rimNodeIds].sort((a, b) => perimParam(a) - perimParam(b));
  for (let i = 0; i < rimSorted.length; i += 1) {
    const from = rimSorted[i]!;
    const to = rimSorted[(i + 1) % rimSorted.length]!;
    if (from === to) continue;
    const a: Vec2 = [nodes[from]!.x, nodes[from]!.z];
    const b: Vec2 = [nodes[to]!.x, nodes[to]!.z];
    // Insert the corner(s) the arc passes so boundary edges stay on the rectangle.
    const pts: Vec2[] = [a];
    const pa = perimParam(from);
    let pb = perimParam(to);
    if (pb <= pa) pb += 4 * hx + 4 * hz;
    const cornerParams: { p: number; at: Vec2 }[] = [
      { p: 2 * hx, at: [hx, -hz] },
      { p: 2 * hx + 2 * hz, at: [hx, hz] },
      { p: 4 * hx + 2 * hz, at: [-hx, hz] },
      { p: 4 * hx + 4 * hz, at: [-hx, -hz] },
      { p: 6 * hx + 4 * hz, at: [hx, -hz] },
    ];
    for (const corner of cornerParams) {
      if (corner.p > pa + 0.01 && corner.p < pb - 0.01) pts.push(corner.at);
    }
    pts.push(b);
    edges.push({ from, to, pts: dedupePolyline(pts), street: -1, width: 0 });
  }

  // --- 6. prune dangling chains (dead ends) so every remaining edge borders two faces ---
  const degree = new Map<number, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const alive = edges.map(() => true);
  let pruned = true;
  const deadEnds: { pts: Vec2[]; width: number }[] = [];
  while (pruned) {
    pruned = false;
    for (let i = 0; i < edges.length; i += 1) {
      if (!alive[i]) continue;
      const edge = edges[i]!;
      if ((degree.get(edge.from) ?? 0) === 1 || (degree.get(edge.to) ?? 0) === 1) {
        alive[i] = false;
        if (edge.street >= 0) deadEnds.push({ pts: edge.pts, width: edge.width });
        degree.set(edge.from, (degree.get(edge.from) ?? 1) - 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 1) - 1);
        pruned = true;
      }
    }
  }

  // --- 7. half-edge structure with angular ordering ---
  const halves: HalfEdge[] = [];
  for (let i = 0; i < edges.length; i += 1) {
    if (!alive[i]) continue;
    const edge = edges[i]!;
    if (edge.pts.length < 2) continue;
    const fwdAngle = Math.atan2(edge.pts[1]![1] - edge.pts[0]![1], edge.pts[1]![0] - edge.pts[0]![0]);
    const n = edge.pts.length;
    const revAngle = Math.atan2(edge.pts[n - 2]![1] - edge.pts[n - 1]![1], edge.pts[n - 2]![0] - edge.pts[n - 1]![0]);
    const a = halves.length;
    const b = a + 1;
    halves.push({ from: edge.from, to: edge.to, pts: edge.pts, street: edge.street, twin: b, angle: fwdAngle, visited: false });
    halves.push({ from: edge.to, to: edge.from, pts: [...edge.pts].reverse(), street: edge.street, twin: a, angle: revAngle, visited: false });
    nodes[edge.from]!.out.push(a);
    nodes[edge.to]!.out.push(b);
  }
  for (const node of nodes) node.out.sort((a, b) => halves[a]!.angle - halves[b]!.angle);
  return { nodes, halves, deadEnds };
}

function dedupePolyline(pts: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev !== undefined && Math.hypot(prev[0] - p[0], prev[1] - p[1]) < 0.05) continue;
    out.push(p);
  }
  return out;
}

/** One extracted face: closed centerline polygon + the street index along each polygon edge. */
export interface GraphFace {
  polygon: Vec2[];
  streets: number[];
}

/** Trace interior (CCW) faces of the half-edge graph. */
function extractFaces(nodes: GraphNode[], halves: HalfEdge[]): GraphFace[] {
  const faces: GraphFace[] = [];
  for (let start = 0; start < halves.length; start += 1) {
    if (halves[start]!.visited) continue;
    const polygon: Vec2[] = [];
    const streets: number[] = [];
    let current = start;
    let guard = 0;
    while (guard < halves.length + 4) {
      guard += 1;
      const half = halves[current]!;
      if (half.visited) break;
      half.visited = true;
      for (let i = 0; i + 1 < half.pts.length; i += 1) {
        polygon.push(half.pts[i]!);
        streets.push(half.street);
      }
      // Next: at the destination node, rotate clockwise from the twin.
      const node = nodes[half.to]!;
      const idx = node.out.indexOf(half.twin);
      if (idx < 0) break;
      current = node.out[(idx - 1 + node.out.length) % node.out.length]!;
      if (current === start) {
        if (polygon.length >= 3 && polygonSignedArea(polygon) > 1) faces.push({ polygon, streets });
        break;
      }
    }
  }
  return faces;
}

/** Everything block extraction needs from the district rules. */
export interface FabricParams {
  streetWidthBase: number;
  /** Base sidewalk band width in meters at "street" hierarchy level. */
  sidewalkBase: number;
  /** Curb strip between pavement edge and sidewalk, meters. */
  curbMargin: number;
}

/** A block's derived rings plus the sidewalk band (outer = curb line, inner = land line). */
export interface BlockRings {
  face: Vec2[];
  faceStreets: number[];
  curb: Vec2[];
  land: Vec2[];
}

/**
 * Extract closed blocks from the street network: planar faces of the graph, each inset to its
 * curb ring (pavement edge) and land ring (behind the sidewalk band). Faces that collapse under
 * the inset come back with an empty `land` and are the caller's slivers/buffers.
 */
export function extractBlocks(
  streets: readonly FabricStreet[],
  hx: number,
  hz: number,
  params: FabricParams,
): { blocks: BlockRings[]; deadEnds: { pts: Vec2[]; width: number }[] } {
  const { nodes, halves, deadEnds } = buildGraph(streets, hx, hz);
  const faces = extractFaces(nodes, halves);
  faces.sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon));
  const blocks: BlockRings[] = [];
  for (const face of faces) {
    if (blocks.length >= MAX_BLOCKS) break;
    const ring = dedupeRing(face.polygon, 0.02);
    if (ring.length < 3) continue;
    // dedupeRing may drop vertices; rebuild the street map by nearest original vertex.
    const streetsPerEdge: number[] = [];
    for (let i = 0; i < ring.length; i += 1) {
      const v = ring[i]!;
      let best = 0;
      let bestDist = Infinity;
      for (let j = 0; j < face.polygon.length; j += 1) {
        const o = face.polygon[j]!;
        const d = Math.hypot(o[0] - v[0], o[1] - v[1]);
        if (d < bestDist) {
          bestDist = d;
          best = j;
        }
      }
      streetsPerEdge.push(face.streets[best] ?? -1);
    }
    const ccw = ensureCcw(ring);
    const flipped = ccw[0] !== ring[0] || ccw[1] !== ring[1];
    const edgeStreets = flipped ? remapReversedEdgeStreets(streetsPerEdge) : streetsPerEdge;
    const curbDist = ccw.map((_, i) => {
      const s = edgeStreets[i] ?? -1;
      return s >= 0 ? streets[s]!.width / 2 + params.curbMargin : 0.8;
    });
    const landDist = ccw.map((_, i) => {
      const s = edgeStreets[i] ?? -1;
      if (s < 0) return 0.8;
      const street = streets[s]!;
      const walk = street.sidewalk ? sidewalkWidthFor(street.level, params.sidewalkBase) : 0;
      return street.width / 2 + params.curbMargin + walk;
    });
    const curb = insetRing(ccw, curbDist);
    const land = curb.length >= 3 ? insetRing(ccw, landDist) : [];
    blocks.push({ face: ccw, faceStreets: edgeStreets, curb, land });
  }
  return { blocks, deadEnds };
}

/** Reverse per-edge street labels when a ring got rewound to CCW. */
function remapReversedEdgeStreets(streetsPerEdge: readonly number[]): number[] {
  const n = streetsPerEdge.length;
  const out: number[] = new Array(n).fill(-1);
  // Edge i of the reversed ring (v'_i = v_{n-1-i}) runs v_{n-1-i} → v_{n-2-i}: original edge n-2-i.
  for (let i = 0; i < n; i += 1) out[i] = streetsPerEdge[(2 * n - 2 - i) % n]!;
  return out;
}

/** Minimal node/edge shapes {@link extractGraphBlocks} needs (matches `StreetNetwork.nodes`/`edges`). */
export interface GraphBlockNode {
  x: number;
  z: number;
}

/** One street-graph edge {@link extractGraphBlocks} traces block faces through. */
export interface GraphBlockEdge {
  /** Endpoint node indices. `points[0]` sits exactly on node `a`, the last on node `b`. */
  a: number;
  b: number;
  points: readonly (readonly [number, number])[];
  width: number;
  level: FabricStreet["level"];
}

/** One block from {@link extractGraphBlocks}: the face polygon and its inset land ring. */
export interface GraphBlockRings {
  /** Face polygon on road CENTERLINES (as traced, interior faces CCW). */
  face: Vec2[];
  /** Land ring: face inset by each bordering edge's half width + curb margin + sidewalk band. */
  land: Vec2[];
}

/**
 * Extract closed blocks from an EXACT street graph — the `nodes`/`edges` a street network already
 * carries — instead of re-deriving topology from welded polylines. Half-edges are ordered by true
 * departure angle at each node, dangling chains are pruned first (returned as `deadEnds` for
 * corridor carving), interior faces are traced through the rotation system, and each face is inset
 * to its land ring by the bordering edges' half-widths (+ curb + sidewalk). Robust against wandered
 * and arc-filleted centerlines, which defeat proximity welding. Pure bounded geometry.
 *
 * @capability city-district extract block polygons directly from a street network's exact graph
 */
export function extractGraphBlocks(
  nodes: readonly GraphBlockNode[],
  edges: readonly GraphBlockEdge[],
  params: { sidewalkBase: number; curbMargin: number },
): { blocks: GraphBlockRings[]; deadEnds: { pts: Vec2[]; width: number }[] } {
  // --- prune dangling chains: an edge touching a degree-1 node can't border a closed face ---
  const degree = new Array<number>(nodes.length).fill(0);
  const alive = edges.map((e) => e.a !== e.b && e.points.length >= 2);
  edges.forEach((e, i) => {
    if (!alive[i]) return;
    degree[e.a] += 1;
    degree[e.b] += 1;
  });
  const deadEnds: { pts: Vec2[]; width: number }[] = [];
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (let i = 0; i < edges.length; i += 1) {
      if (!alive[i]) continue;
      const e = edges[i]!;
      if (degree[e.a] === 1 || degree[e.b] === 1) {
        alive[i] = false;
        deadEnds.push({ pts: e.points.map((p) => [p[0], p[1]] as Vec2), width: e.width });
        degree[e.a] -= 1;
        degree[e.b] -= 1;
        pruned = true;
      }
    }
  }

  // --- half-edge rotation system on the surviving 2-core ---
  interface Half {
    to: number;
    pts: Vec2[];
    twin: number;
    edge: number;
    visited: boolean;
  }
  const halves: Half[] = [];
  const out: number[][] = nodes.map(() => []);
  const departAngle = (pts: readonly Vec2[]): number => {
    // First non-degenerate segment sets the true departure direction.
    for (let i = 1; i < pts.length; i += 1) {
      const dx = pts[i]![0] - pts[0]![0];
      const dz = pts[i]![1] - pts[0]![1];
      if (dx * dx + dz * dz > 1e-12) return Math.atan2(dz, dx);
    }
    return 0;
  };
  const angles: number[] = [];
  edges.forEach((e, ei) => {
    if (!alive[ei]) return;
    const fwd = e.points.map((p) => [p[0], p[1]] as Vec2);
    const rev = [...fwd].reverse();
    const h0 = halves.length;
    halves.push({ to: e.b, pts: fwd, twin: h0 + 1, edge: ei, visited: false });
    halves.push({ to: e.a, pts: rev, twin: h0, edge: ei, visited: false });
    angles.push(departAngle(fwd), departAngle(rev));
    out[e.a]!.push(h0);
    out[e.b]!.push(h0 + 1);
  });
  for (const list of out) list.sort((a, b) => angles[a]! - angles[b]!);

  // --- trace interior faces: at each destination, rotate clockwise from the twin ---
  const blocks: GraphBlockRings[] = [];
  for (let start = 0; start < halves.length && blocks.length < MAX_BLOCKS; start += 1) {
    if (halves[start]!.visited) continue;
    const polygon: Vec2[] = [];
    const segEdge: number[] = [];
    let current = start;
    let guard = 0;
    let closed = false;
    while (guard < halves.length + 4) {
      guard += 1;
      const half = halves[current]!;
      if (half.visited) break;
      half.visited = true;
      for (let i = 0; i + 1 < half.pts.length; i += 1) {
        polygon.push(half.pts[i]!);
        segEdge.push(half.edge);
      }
      const list = out[half.to]!;
      const idx = list.indexOf(half.twin);
      if (idx < 0) break;
      current = list[(idx - 1 + list.length) % list.length]!;
      if (current === start) {
        closed = true;
        break;
      }
    }
    if (!closed || polygon.length < 3) continue;
    if (polygonSignedArea(polygon) <= 1) continue; // outer face (CW) or degenerate sliver

    // Dedupe near-coincident vertices while keeping each surviving segment's source edge.
    const ring: Vec2[] = [];
    const ringEdge: number[] = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const p = polygon[i]!;
      const prev = ring[ring.length - 1];
      if (prev !== undefined && Math.hypot(prev[0] - p[0], prev[1] - p[1]) < 0.02) continue;
      ring.push(p);
      ringEdge.push(segEdge[i]!);
    }
    while (ring.length > 1 && Math.hypot(ring[0]![0] - ring[ring.length - 1]![0], ring[0]![1] - ring[ring.length - 1]![1]) < 0.02) {
      ring.pop();
      ringEdge.pop();
    }
    if (ring.length < 3) continue;

    const dist = ring.map((_, i) => {
      const e = edges[ringEdge[i]!]!;
      const walk = e.level === "lane" ? 0 : sidewalkWidthFor(e.level, params.sidewalkBase);
      return e.width / 2 + params.curbMargin + walk;
    });
    const land = insetRing(ring, dist);
    blocks.push({ face: ring, land });
  }
  blocks.sort((a, b) => polygonArea(b.land) - polygonArea(a.land));
  return { blocks, deadEnds };
}

/** Arc-length station lookup along a closed ring. */
export class RingWalker {
  readonly ring: readonly Vec2[];
  readonly cum: number[];
  readonly total: number;

  constructor(ring: readonly Vec2[]) {
    this.ring = ring;
    this.cum = [0];
    let sum = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.cum.push(sum);
    }
    this.total = sum;
  }

  /** Point, unit tangent, and inward normal (CCW ring: interior on the left) at arc length `s`. */
  at(s: number): { p: Vec2; tangent: Vec2; normal: Vec2; edge: number } {
    const wrapped = ((s % this.total) + this.total) % this.total;
    let lo = 0;
    let hi = this.ring.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid]! <= wrapped) lo = mid;
      else hi = mid;
    }
    const a = this.ring[lo % this.ring.length]!;
    const b = this.ring[(lo + 1) % this.ring.length]!;
    const len = this.cum[lo + 1]! - this.cum[lo]! || 1;
    const t = (wrapped - this.cum[lo]!) / len;
    const tx = (b[0] - a[0]) / len;
    const tz = (b[1] - a[1]) / len;
    return {
      p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      tangent: [tx, tz],
      normal: [-tz, tx],
      edge: lo % this.ring.length,
    };
  }

  /** Ring vertex indices whose arc position lies strictly inside (s0, s1) (wrapping). */
  verticesBetween(s0: number, s1: number): number[] {
    const out: number[] = [];
    const span = s1 - s0;
    for (let i = 0; i < this.ring.length; i += 1) {
      let d = this.cum[i]! - s0;
      d = ((d % this.total) + this.total) % this.total;
      if (d > 0.01 && d < span - 0.01) out.push(i);
    }
    out.sort((a, b) => {
      const da = (((this.cum[a]! - s0) % this.total) + this.total) % this.total;
      const db = (((this.cum[b]! - s0) % this.total) + this.total) % this.total;
      return da - db;
    });
    return out;
  }

  /** Interior angle (radians) at ring vertex i — π on straight runs, < π at convex corners. */
  interiorAngle(i: number): number {
    const prev = this.ring[(i + this.ring.length - 1) % this.ring.length]!;
    const cur = this.ring[i]!;
    const next = this.ring[(i + 1) % this.ring.length]!;
    const a = Math.atan2(prev[1] - cur[1], prev[0] - cur[0]);
    const b = Math.atan2(next[1] - cur[1], next[0] - cur[0]);
    let diff = a - b;
    while (diff < 0) diff += Math.PI * 2;
    while (diff >= Math.PI * 2) diff -= Math.PI * 2;
    return diff;
  }
}

/** Inputs for one parcel strip cut from a block ring. */
export interface ParcelCut {
  /** Arc-length start/end stations along the block's land ring. */
  s0: number;
  s1: number;
  /** Strip depth from the frontage inward. */
  depth: number;
}

/**
 * Cut one polygonal parcel out of a block land ring: the frontage arc between two stations,
 * extruded inward along the station normals, clipped back to the block. Returns null when the
 * strip collapses (over-tight corner, sliver arc).
 */
export function cutParcel(walker: RingWalker, blockRing: readonly Vec2[], cut: ParcelCut): Vec2[] | null {
  const a = walker.at(cut.s0);
  const b = walker.at(cut.s1);
  const outer: Vec2[] = [a.p];
  const inner: Vec2[] = [[a.p[0] + a.normal[0] * cut.depth, a.p[1] + a.normal[1] * cut.depth]];
  for (const vi of walker.verticesBetween(cut.s0, cut.s1)) {
    const v = walker.ring[vi]!;
    outer.push(v);
    // Vertex normal: bisector of adjacent edge normals.
    const prev = walker.ring[(vi + walker.ring.length - 1) % walker.ring.length]!;
    const next = walker.ring[(vi + 1) % walker.ring.length]!;
    const l0 = Math.hypot(v[0] - prev[0], v[1] - prev[1]) || 1;
    const l1 = Math.hypot(next[0] - v[0], next[1] - v[1]) || 1;
    const n0: Vec2 = [-(v[1] - prev[1]) / l0, (v[0] - prev[0]) / l0];
    const n1: Vec2 = [-(next[1] - v[1]) / l1, (next[0] - v[0]) / l1];
    let nx = n0[0] + n1[0];
    let nz = n0[1] + n1[1];
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    inner.push([v[0] + nx * cut.depth, v[1] + nz * cut.depth]);
  }
  outer.push(b.p);
  inner.push([b.p[0] + b.normal[0] * cut.depth, b.p[1] + b.normal[1] * cut.depth]);
  inner.reverse();
  const raw = extractSimpleLoop([...outer, ...inner]);
  if (raw.length < 3) return null;
  // Conform to the block: deep cuts on thin or concave blocks can push vertices — or whole edge
  // spans between two near-boundary vertices — across a notch to the outside.
  const clipped = conformPolygonToRing(raw, blockRing);
  if (clipped.length < 3 || polygonArea(clipped) < 4) return null;
  return clipped;
}

/**
 * Conform a polygon to a containing ring: sample every edge (a straight edge can bulge across a
 * concave notch even when its endpoints hug the boundary), then pull each escaping point to its
 * nearest boundary point. Callers re-run this after any operation that adds mid-edge vertices.
 */
export function conformPolygonToRing(poly: readonly Vec2[], ring: readonly Vec2[]): Vec2[] {
  const refined: Vec2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    refined.push(a);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.min(24, Math.floor(len / 2.5));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / (steps + 1);
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      if (!pointInPolygon(ring, x, z) && distanceToRing(ring, x, z) > 0.3) refined.push([x, z]);
    }
  }
  const out: Vec2[] = [];
  for (const [x, z] of refined) {
    if (pointInPolygon(ring, x, z) || distanceToRing(ring, x, z) <= 0.4) {
      out.push([x, z]);
      continue;
    }
    // Pull the vertex to the nearest point on the ring boundary.
    let bestX = x;
    let bestZ = z;
    let best = Infinity;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const vx = b[0] - a[0];
      const vz = b[1] - a[1];
      const len2 = vx * vx + vz * vz;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / len2));
      const px = a[0] + vx * t;
      const pz = a[1] + vz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        bestX = px;
        bestZ = pz;
      }
    }
    out.push([bestX, bestZ]);
  }
  return extractSimpleLoop(out);
}

/**
 * Buildable polygon for a parcel: the parcel clipped by the front setback (a half-plane pushed in
 * from the frontage chord), side gaps along both cut lines, and a rear margin. Works on any
 * parcel polygon — no vertex correspondence needed.
 */
export function buildablePolygon(
  parcel: readonly Vec2[],
  frontA: Vec2,
  frontB: Vec2,
  frontSetback: number,
  sideGap: number,
  rearMargin: number,
  depth: number,
): Vec2[] {
  const tx = frontB[0] - frontA[0];
  const tz = frontB[1] - frontA[1];
  const len = Math.hypot(tx, tz) || 1;
  const t: Vec2 = [tx / len, tz / len];
  const n: Vec2 = [-t[1], t[0]]; // inward (CCW ring, interior left of frontage direction)
  let poly: Vec2[] = [...parcel];
  // Front: keep the side of the chord's inward offset. dot(p, n) >= dot(A, n) + setback.
  const dFront = frontA[0] * n[0] + frontA[1] * n[1];
  poly = clipHalfPlane(poly, [-n[0], -n[1]], -(dFront + frontSetback));
  if (poly.length < 3) return [];
  // Rear: dot(p, n) <= dFront + depth - rearMargin.
  poly = clipHalfPlane(poly, n, dFront + Math.max(frontSetback + 1, depth - rearMargin));
  if (poly.length < 3) return [];
  // Sides: keep between the two station cut lines pushed in by sideGap.
  const dA = frontA[0] * t[0] + frontA[1] * t[1];
  const dB = frontB[0] * t[0] + frontB[1] * t[1];
  poly = clipHalfPlane(poly, [-t[0], -t[1]], -(dA + sideGap));
  if (poly.length < 3) return [];
  poly = clipHalfPlane(poly, t, dB - sideGap);
  return poly.length >= 3 ? poly : [];
}

/**
 * Carve dead-end road corridors (cul-de-sac lanes pruned from the face graph) out of a polygon:
 * for every corridor segment crossing it, keep the polygon piece on the side where `keep` lies.
 */
export function carveCorridors(
  poly: Vec2[],
  keep: Vec2,
  corridors: readonly { pts: readonly Vec2[]; width: number }[],
  margin: number,
): Vec2[] {
  let current = poly;
  for (const corridor of corridors) {
    const half = corridor.width / 2 + margin;
    for (let i = 0; i + 1 < corridor.pts.length && current.length >= 3; i += 1) {
      const a = corridor.pts[i]!;
      const b = corridor.pts[i + 1]!;
      const tx = b[0] - a[0];
      const tz = b[1] - a[1];
      const len = Math.hypot(tx, tz);
      if (len < 0.5) continue;
      const n: Vec2 = [-tz / len, tx / len];
      const dKeep = keep[0] * n[0] + keep[1] * n[1];
      const dLine = a[0] * n[0] + a[1] * n[1];
      // Quick reject: does the segment's corridor even touch the polygon bbox region?
      let near = false;
      for (const [x, z] of current) {
        const along = ((x - a[0]) * tx + (z - a[1]) * tz) / len;
        if (along < -half || along > len + half) continue;
        if (Math.abs(x * n[0] + z * n[1] - dLine) <= half + 0.5) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      if (dKeep >= dLine) current = clipHalfPlane(current, [-n[0], -n[1]], -(dLine + half));
      else current = clipHalfPlane(current, n, dLine - half);
    }
  }
  return current.length >= 3 ? current : [];
}

/** Deterministic sliver verdict shared by classification and tests. */
export function isSliverBlock(land: readonly Vec2[], minArea: number, minWidth: number): boolean {
  if (land.length < 3) return true;
  return polygonArea(land) < minArea || polygonMeanWidth(land) < minWidth;
}

/** Sample deterministic points inside a polygon by seeded rejection over its bounds. */
export function pointsInPolygon(ring: readonly Vec2[], count: number, rng: () => number, margin = 1.5): Vec2[] {
  if (ring.length < 3 || count <= 0) return [];
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  const out: Vec2[] = [];
  const maxTries = count * 12;
  for (let i = 0; i < maxTries && out.length < count; i += 1) {
    const x = minX + rng() * (maxX - minX);
    const z = minZ + rng() * (maxZ - minZ);
    if (!pointInPolygon(ring, x, z)) continue;
    if (margin > 0 && distanceToRing(ring, x, z) < margin) continue;
    out.push([x, z]);
  }
  return out;
}

