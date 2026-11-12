/**
 * Street network quality metrics — the numbers urban morphology uses to tell a believable street net
 * from a jittered lattice, measured on any node/edge graph (a generated {@link StreetNetwork} fits the
 * input shape as-is). Model code: plain data in, plain numbers out, no renderer.
 *
 * - Density: intersections per km² and road km per km² (Boeing 2017).
 * - Configuration: node-degree mix (dead ends split into interior and district-rim ends, 3-way, 4-way),
 *   streets per node, connected components.
 * - Orientation order φ (Boeing 2019): 1 for a perfect grid, ~0 for uniformly random bearings, from
 *   the entropy of edge bearings in 36 ten-degree bins.
 * - Circuity: edge circuity (edge length over endpoint chord, OSMnx) and the detour ratio (network
 *   distance over straight-line distance between node pairs, Levinson & El-Geneidy 2009).
 * - Hierarchy: length share per level, arterial share, and the level-flip rate — how often an arterial
 *   that continues straight through a node changes level there (a real avenue keeps its rank).
 * - Blocks: faces of the planar graph (size distribution, share of the district enclosed and the land
 *   left once half of each bounding street's width is taken off).
 * - Kept length: street-chain length over raw edge length, for generators that cap their street list.
 *
 * Degree-2 nodes (mid-street bends) are contracted first, as OSMnx simplifies a graph, so a winding
 * street counts as one edge with its true circuity rather than many straight pieces.
 */
import { coefficientOfVariation, mean, quantile } from "../math/stats";

/** A plan-view point, `[x, z]`. */
export type PlanPoint = readonly [number, number];

/** One graph node in plan view. */
export interface MetricGraphNode {
  readonly id: number;
  readonly x: number;
  readonly z: number;
}

/** One graph edge: endpoint node ids and its centerline polyline from `a` to `b`. */
export interface MetricGraphEdge {
  readonly a: number;
  readonly b: number;
  readonly points: readonly PlanPoint[];
  /** Road hierarchy level ("boulevard", "avenue", "street", "lane", ...). */
  readonly level?: string;
  /** Carriageway width (m), used for the land-in-blocks estimate. */
  readonly width?: number;
}

/** The graph a street metric reads; a `StreetNetwork` is one. */
export interface MetricStreetGraph {
  readonly nodes: readonly MetricGraphNode[];
  readonly edges: readonly MetricGraphEdge[];
  /** Chained streets the generator kept (for {@link StreetNetworkMetrics.keptLengthShare}). */
  readonly streets?: readonly { readonly points: readonly PlanPoint[] }[];
}

/** District bounds: a centered `halfX` × `halfZ` box or explicit extents. */
export type MetricBounds = { readonly halfX: number; readonly halfZ: number } | { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };

export interface StreetMetricsOptions {
  readonly bounds: MetricBounds;
  /** A dead end within this distance (m) of the bounds is a road leaving the district, not a cul-de-sac. Default 3. */
  readonly rimMargin?: number;
  /** Levels counted as arterial. Default boulevard and avenue. */
  readonly arterialLevels?: readonly string[];
  /** Dijkstra sources for the detour ratio, spread evenly over the nodes. Default 32. */
  readonly detourSources?: number;
  /** Only node pairs at least this far apart (m) count toward the detour ratio. Default min(150, ¼ of the shorter side). */
  readonly detourMinDistance?: number;
  /** Two arms within this many degrees of a straight line continue through a node. Default 25. */
  readonly straightThroughDeg?: number;
}

/** Face-of-graph block size distribution. */
export interface BlockMetrics {
  count: number;
  medianHa: number;
  p10Ha: number;
  p90Ha: number;
  /** Coefficient of variation of block area. */
  cv: number;
}

export interface StreetNetworkMetrics {
  areaKm2: number;
  roadKm: number;
  roadKmPerKm2: number;
  /** Nodes of degree ≥ 3. */
  intersections: number;
  intersectionsPerKm2: number;
  /** Node counts by degree after contracting degree-2 nodes. */
  degree: { deadEndInterior: number; deadEndRim: number; threeWay: number; fourWay: number; fivePlus: number };
  /** Shares of non-degree-2 nodes (Boeing's "proportion of dead ends / 3-way / 4-way"). */
  deadEndShare: number;
  deadEndInteriorShare: number;
  threeWayShare: number;
  fourWayShare: number;
  /** Mean degree of the non-degree-2 nodes. */
  streetsPerNode: number;
  components: number;
  /** Shannon entropy of edge bearings (nats, 36 bins). */
  orientationEntropy: number;
  /** Boeing's orientation order φ: 1 = one perfect grid, 0 = uniform bearings. */
  orientationOrder: number;
  /** Total edge length over total endpoint chord length. */
  edgeCircuity: number;
  /** Mean network-over-straight-line distance between sampled node pairs. */
  detourRatio: number;
  detourRatioP90: number;
  /** Length share per level, 0..1. */
  levelShares: Record<string, number>;
  /** Length share on arterial levels, 0..1. */
  arterialShare: number;
  /** Arterial continuations straight through a node. */
  straightThroughArterial: number;
  /** Of those, how many change level at the node. */
  levelFlips: number;
  /** `levelFlips / straightThroughArterial` (0 when there are none). */
  levelFlipRate: number;
  blocks: BlockMetrics;
  /** Share of the district enclosed by graph faces. */
  enclosedShare: number;
  /** Share of the district left as land inside faces once half of each street's width is taken off. */
  landInBlocksShare: number;
  /** Chained street length over raw edge length (1 = nothing dropped); `NaN` without `streets`. */
  keptLengthShare: number;
}

const DEFAULT_ARTERIAL = ["boulevard", "avenue"] as const;

export function boundsBox(bounds: MetricBounds): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return "halfX" in bounds ? { minX: -bounds.halfX, maxX: bounds.halfX, minZ: -bounds.halfZ, maxZ: bounds.halfZ } : bounds;
}

/** Length of an open polyline (closed adds the closing segment). */
export function polylineLength(points: readonly PlanPoint[], closed = false): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i += 1) total += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  if (closed && points.length > 1) total += Math.hypot(points[0]![0] - points.at(-1)![0], points[0]![1] - points.at(-1)![1]);
  return total;
}

/** Heading (radians, atan2(dz, dx)) leaving the start of a polyline, read at least `reach` metres along it. */
function departure(points: readonly PlanPoint[], reach: number): number {
  const p0 = points[0]!;
  let target = points.at(-1)!;
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    walked += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    if (walked >= reach) {
      target = points[i]!;
      break;
    }
  }
  return Math.atan2(target[1] - p0[1], target[0] - p0[0]);
}

interface SimpleEdge {
  a: number;
  b: number;
  points: PlanPoint[];
  /** Widest half-width among the raw edges the chain merged. */
  halfWidth: number;
}

/** Contract degree-2 nodes into their neighbours' edges (a pure ring stays one self-loop edge). */
function contract(nodes: ReadonlyMap<number, MetricGraphNode>, edges: readonly MetricGraphEdge[]): SimpleEdge[] {
  const incident = new Map<number, number[]>();
  edges.forEach((edge, index) => {
    if (!nodes.has(edge.a) || !nodes.has(edge.b)) return;
    (incident.get(edge.a) ?? incident.set(edge.a, []).get(edge.a)!).push(index);
    (incident.get(edge.b) ?? incident.set(edge.b, []).get(edge.b)!).push(index);
  });
  const through = (id: number): boolean => {
    const list = incident.get(id) ?? [];
    return list.length === 2 && list[0] !== list[1];
  };
  const used = new Set<number>();
  const out: SimpleEdge[] = [];
  const walk = (startNode: number, firstEdge: number): SimpleEdge => {
    const points: PlanPoint[] = [];
    let halfWidth = 0;
    let node = startNode;
    let edgeIndex = firstEdge;
    for (;;) {
      used.add(edgeIndex);
      const edge = edges[edgeIndex]!;
      halfWidth = Math.max(halfWidth, (edge.width ?? 0) / 2);
      const forward = edge.a === node;
      const seq = forward ? edge.points : [...edge.points].reverse();
      for (let i = points.length === 0 ? 0 : 1; i < seq.length; i += 1) points.push(seq[i]!);
      node = forward ? edge.b : edge.a;
      if (!through(node) || node === startNode) break;
      const next = incident.get(node)!.find((other) => other !== edgeIndex);
      if (next === undefined || used.has(next)) break;
      edgeIndex = next;
    }
    return { a: startNode, b: node, points, halfWidth };
  };
  // Chains from every non-through node first, then any leftover pure rings.
  const ids = [...incident.keys()].sort((p, q) => p - q);
  for (const id of ids) {
    if (through(id)) continue;
    for (const edgeIndex of incident.get(id)!) if (!used.has(edgeIndex)) out.push(walk(id, edgeIndex));
  }
  for (const id of ids) for (const edgeIndex of incident.get(id)!) if (!used.has(edgeIndex)) out.push(walk(id, edgeIndex));
  return out;
}

/** Signed shoelace area of a ring of plan points. */
function signedArea(ring: readonly PlanPoint[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    twice += p[0] * q[1] - q[0] * p[1];
  }
  return twice / 2;
}

interface Face {
  area: number;
  /** Σ perimeter length × half the bounding street's width. */
  edgeBand: number;
}

/** Faces of a plane graph by half-edge traversal; areas carry the traversal sign. */
function faces(edges: readonly SimpleEdge[]): Face[] {
  type Half = { edge: number; from: number; to: number; angle: number; points: readonly PlanPoint[] };
  const halves: Half[] = [];
  const out = new Map<number, number[]>();
  edges.forEach((edge, index) => {
    if (edge.points.length < 2) return;
    const reversed = [...edge.points].reverse();
    for (const [from, to, points] of [
      [edge.a, edge.b, edge.points],
      [edge.b, edge.a, reversed],
    ] as const) {
      halves.push({ edge: index, from, to, angle: departure(points, 1), points });
      (out.get(from) ?? out.set(from, []).get(from)!).push(halves.length - 1);
    }
  });
  for (const list of out.values()) list.sort((p, q) => halves[p]!.angle - halves[q]!.angle || p - q);
  const twin = (h: number): number => (h % 2 === 0 ? h + 1 : h - 1);
  const seen = new Uint8Array(halves.length);
  const result: Face[] = [];
  for (let start = 0; start < halves.length; start += 1) {
    if (seen[start]) continue;
    const ring: PlanPoint[] = [];
    let band = 0;
    let h = start;
    let guard = 0;
    while (!seen[h] && guard < halves.length + 1) {
      guard += 1;
      seen[h] = 1;
      const half = halves[h]!;
      for (let i = 0; i + 1 < half.points.length; i += 1) ring.push(half.points[i]!);
      band += polylineLength(half.points) * edges[half.edge]!.halfWidth;
      // Next half-edge: at the far node, the one just clockwise of the way back.
      const around = out.get(half.to)!;
      const back = around.indexOf(twin(h));
      h = around[(back - 1 + around.length) % around.length]!;
    }
    result.push({ area: signedArea(ring), edgeBand: band });
  }
  return result;
}

class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, value: number): void {
    this.keys.push(key);
    this.values.push(value);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.keys[0]!, this.values[0]!];
    const lastKey = this.keys.pop()!;
    const lastValue = this.values.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.values[0] = lastValue;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.keys.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(i: number, j: number): void {
    [this.keys[i], this.keys[j]] = [this.keys[j]!, this.keys[i]!];
    [this.values[i], this.values[j]] = [this.values[j]!, this.values[i]!];
  }
}

/**
 * Measure a street graph inside its district bounds. See the module comment for each figure.
 * @capability generator-metrics measure generated street nets, city districts and race laps against cited reference bands; `bun run gen-audit` renders and tables them
 */
export function streetNetworkMetrics(graph: MetricStreetGraph, options: StreetMetricsOptions): StreetNetworkMetrics {
  const box = boundsBox(options.bounds);
  const spanX = box.maxX - box.minX;
  const spanZ = box.maxZ - box.minZ;
  const areaM2 = Math.max(1e-9, spanX * spanZ);
  const areaKm2 = areaM2 / 1e6;
  const rim = options.rimMargin ?? 3;
  const arterial = new Set(options.arterialLevels ?? DEFAULT_ARTERIAL);
  const straightTol = ((options.straightThroughDeg ?? 25) * Math.PI) / 180;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const edges = graph.edges.filter((edge) => nodeById.has(edge.a) && nodeById.has(edge.b) && edge.points.length >= 2);

  // Length and hierarchy.
  const lengths = edges.map((edge) => polylineLength(edge.points));
  const roadM = lengths.reduce((sum, value) => sum + value, 0);
  const byLevel: Record<string, number> = {};
  edges.forEach((edge, i) => {
    const level = edge.level ?? "street";
    byLevel[level] = (byLevel[level] ?? 0) + lengths[i]!;
  });
  const levelShares: Record<string, number> = {};
  let arterialM = 0;
  for (const [level, metres] of Object.entries(byLevel)) {
    levelShares[level] = roadM > 0 ? metres / roadM : 0;
    if (arterial.has(level)) arterialM += metres;
  }

  // Degree mix on the contracted graph.
  const simple = contract(nodeById, edges);
  const degree = new Map<number, number>();
  for (const edge of simple) {
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
  }
  const counts = { deadEndInterior: 0, deadEndRim: 0, threeWay: 0, fourWay: 0, fivePlus: 0 };
  let degreeSum = 0;
  let nonThrough = 0;
  for (const [id, d] of degree) {
    if (d === 2) continue;
    nonThrough += 1;
    degreeSum += d;
    const node = nodeById.get(id)!;
    if (d === 1) {
      const onRim = node.x <= box.minX + rim || node.x >= box.maxX - rim || node.z <= box.minZ + rim || node.z >= box.maxZ - rim;
      if (onRim) counts.deadEndRim += 1;
      else counts.deadEndInterior += 1;
    } else if (d === 3) counts.threeWay += 1;
    else if (d === 4) counts.fourWay += 1;
    else counts.fivePlus += 1;
  }
  const share = (n: number): number => (nonThrough > 0 ? n / nonThrough : 0);
  const intersections = counts.threeWay + counts.fourWay + counts.fivePlus;

  // Components (union-find over the raw edges).
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (const edge of edges) {
    if (!parent.has(edge.a)) parent.set(edge.a, edge.a);
    if (!parent.has(edge.b)) parent.set(edge.b, edge.b);
    const ra = find(edge.a);
    const rb = find(edge.b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
  const components = new Set([...parent.keys()].map(find)).size;

  // Orientation entropy (Boeing 2019): chord bearing of each contracted edge, both directions.
  const bins = new Array<number>(36).fill(0);
  let chordTotal = 0;
  let simpleTotal = 0;
  for (const edge of simple) {
    const p = edge.points[0]!;
    const q = edge.points.at(-1)!;
    const chord = Math.hypot(q[0] - p[0], q[1] - p[1]);
    simpleTotal += polylineLength(edge.points);
    chordTotal += chord;
    if (chord < 1e-6) continue;
    const bearing = (((Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI) % 360 + 360) % 360;
    for (const b of [bearing, (bearing + 180) % 360]) bins[Math.floor(((b + 5) % 360) / 10) % 36]! += 1;
  }
  const binTotal = bins.reduce((sum, value) => sum + value, 0);
  let entropy = 0;
  for (const count of bins) if (count > 0) entropy -= (count / binTotal) * Math.log(count / binTotal);
  const hMax = Math.log(36);
  const hGrid = Math.log(4);
  const orientationOrder = binTotal > 0 ? 1 - ((entropy - hGrid) / (hMax - hGrid)) ** 2 : Number.NaN;

  // Detour ratio: Dijkstra from evenly spread sources over the raw graph.
  const adjacency = new Map<number, { to: number; w: number }[]>();
  edges.forEach((edge, i) => {
    if (edge.a === edge.b) return;
    (adjacency.get(edge.a) ?? adjacency.set(edge.a, []).get(edge.a)!).push({ to: edge.b, w: lengths[i]! });
    (adjacency.get(edge.b) ?? adjacency.set(edge.b, []).get(edge.b)!).push({ to: edge.a, w: lengths[i]! });
  });
  const ids = [...adjacency.keys()].sort((p, q) => p - q);
  const minDistance = options.detourMinDistance ?? Math.min(150, Math.min(spanX, spanZ) / 4);
  const sources = Math.min(ids.length, Math.max(1, options.detourSources ?? 32));
  const ratios: number[] = [];
  for (let s = 0; s < sources && ids.length > 1; s += 1) {
    const src = ids[Math.floor(((s + 0.5) * ids.length) / sources)]!;
    const dist = new Map<number, number>([[src, 0]]);
    const heap = new MinHeap();
    heap.push(0, src);
    while (heap.size > 0) {
      const [d, node] = heap.pop();
      if (d > dist.get(node)!) continue;
      for (const { to, w } of adjacency.get(node)!) {
        const nd = d + w;
        if (nd < (dist.get(to) ?? Infinity)) {
          dist.set(to, nd);
          heap.push(nd, to);
        }
      }
    }
    const ps = nodeById.get(src)!;
    for (const [id, d] of dist) {
      const pn = nodeById.get(id)!;
      const straight = Math.hypot(pn.x - ps.x, pn.z - ps.z);
      if (straight >= minDistance) ratios.push(d / straight);
    }
  }

  // Level flips: arterial arms continuing straight through a node.
  const arms = new Map<number, { heading: number; level: string }[]>();
  for (const edge of edges) {
    if (edge.a === edge.b) continue;
    const level = edge.level ?? "street";
    (arms.get(edge.a) ?? arms.set(edge.a, []).get(edge.a)!).push({ heading: departure(edge.points, 8), level });
    (arms.get(edge.b) ?? arms.set(edge.b, []).get(edge.b)!).push({ heading: departure([...edge.points].reverse(), 8), level });
  }
  let straightThrough = 0;
  let flips = 0;
  for (const list of arms.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        let turn = Math.abs(list[i]!.heading - list[j]!.heading) % (Math.PI * 2);
        if (turn > Math.PI) turn = Math.PI * 2 - turn;
        if (Math.PI - turn > straightTol) continue;
        if (!arterial.has(list[i]!.level) && !arterial.has(list[j]!.level)) continue;
        straightThrough += 1;
        if (list[i]!.level !== list[j]!.level) flips += 1;
      }
    }
  }

  // Blocks: interior faces of the contracted plane graph (the outer face of each component has the
  // opposite traversal sign to every bounded face).
  const all = faces(simple);
  let outerSign = 0;
  let biggest = -1;
  for (const face of all) {
    if (Math.abs(face.area) > biggest) {
      biggest = Math.abs(face.area);
      outerSign = Math.sign(face.area);
    }
  }
  const blockFaces = all.filter((face) => Math.sign(face.area) === -outerSign && Math.abs(face.area) > 1);
  const blockAreas = blockFaces.map((face) => Math.abs(face.area));
  const enclosed = blockAreas.reduce((sum, value) => sum + value, 0);
  const land = blockFaces.reduce((sum, face) => sum + Math.max(0, Math.abs(face.area) - face.edgeBand), 0);

  const keptM = graph.streets?.reduce((sum, street) => sum + polylineLength(street.points), 0);

  return {
    areaKm2,
    roadKm: roadM / 1000,
    roadKmPerKm2: roadM / 1000 / areaKm2,
    intersections,
    intersectionsPerKm2: intersections / areaKm2,
    degree: counts,
    deadEndShare: share(counts.deadEndInterior + counts.deadEndRim),
    deadEndInteriorShare: share(counts.deadEndInterior),
    threeWayShare: share(counts.threeWay),
    fourWayShare: share(counts.fourWay + counts.fivePlus),
    streetsPerNode: nonThrough > 0 ? degreeSum / nonThrough : 0,
    components,
    orientationEntropy: entropy,
    orientationOrder,
    edgeCircuity: chordTotal > 0 ? simpleTotal / chordTotal : Number.NaN,
    detourRatio: mean(ratios),
    detourRatioP90: quantile(ratios, 0.9),
    levelShares,
    arterialShare: roadM > 0 ? arterialM / roadM : 0,
    straightThroughArterial: straightThrough,
    levelFlips: flips,
    levelFlipRate: straightThrough > 0 ? flips / straightThrough : 0,
    blocks: {
      count: blockAreas.length,
      medianHa: quantile(blockAreas, 0.5) / 1e4,
      p10Ha: quantile(blockAreas, 0.1) / 1e4,
      p90Ha: quantile(blockAreas, 0.9) / 1e4,
      cv: coefficientOfVariation(blockAreas),
    },
    enclosedShare: enclosed / areaM2,
    landInBlocksShare: land / areaM2,
    keptLengthShare: keptM === undefined || roadM === 0 ? Number.NaN : keptM / roadM,
  };
}

/** One street as the elevation metric reads it: centerline, per-point road heights and bridge/tunnel spans. */
export interface ElevatedStreet {
  readonly points: readonly PlanPoint[];
  readonly heights?: readonly number[];
  /** Index windows (into `points`) that are bridge decks or tunnel bores, skipped for road-vs-ground. */
  readonly features?: readonly { readonly from: number; readonly to: number }[];
}

export interface RoadElevationMetrics {
  /** Steepest grade (rise over run, 0..1) over any stretch of at least `gradeBaseline` metres. */
  maxGrade: number;
  /** Largest height difference where one street's end meets another street (m). */
  junctionStepMax: number;
  /** Mean |road surface − ground| over sampled points, off bridge/tunnel spans (m); `NaN` without `heightAt`. */
  roadVsGroundMean: number;
  roadVsGroundMax: number;
  /** Road surface relief: highest minus lowest point (m). */
  reliefM: number;
}

/**
 * Road-surface elevation quality: grades, steps where streets meet, and how far the road surface sits
 * from the ground it should follow. Streets without `heights` are skipped.
 */
export function roadElevationMetrics(
  streets: readonly ElevatedStreet[],
  options: { readonly heightAt?: (x: number, z: number) => number; readonly gradeBaseline?: number; readonly junctionTolerance?: number } = {},
): RoadElevationMetrics {
  const baseline = options.gradeBaseline ?? 5;
  const tolerance = options.junctionTolerance ?? 0.3;
  let maxGrade = 0;
  let lo = Infinity;
  let hi = -Infinity;
  const cell = 1;
  const grid = new Map<string, { street: number; h: number; x: number; z: number }[]>();
  const key = (x: number, z: number): string => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  streets.forEach((street, s) => {
    const h = street.heights;
    if (h === undefined || h.length !== street.points.length) return;
    street.points.forEach((p, i) => {
      lo = Math.min(lo, h[i]!);
      hi = Math.max(hi, h[i]!);
      const k = key(p[0], p[1]);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push({ street: s, h: h[i]!, x: p[0], z: p[1] });
    });
    for (let i = 0; i < street.points.length; i += 1) {
      let run = 0;
      for (let j = i + 1; j < street.points.length; j += 1) {
        run += Math.hypot(street.points[j]![0] - street.points[j - 1]![0], street.points[j]![1] - street.points[j - 1]![1]);
        if (run >= baseline) {
          maxGrade = Math.max(maxGrade, Math.abs(h[j]! - h[i]!) / run);
          break;
        }
      }
    }
  });
  let junctionStepMax = 0;
  streets.forEach((street, s) => {
    const h = street.heights;
    if (h === undefined || h.length !== street.points.length) return;
    for (const i of [0, street.points.length - 1]) {
      const p = street.points[i]!;
      const cx = Math.floor(p[0] / cell);
      const cz = Math.floor(p[1] / cell);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const other of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
            if (other.street === s || Math.hypot(other.x - p[0], other.z - p[1]) > tolerance) continue;
            junctionStepMax = Math.max(junctionStepMax, Math.abs(other.h - h[i]!));
          }
        }
      }
    }
  });
  const offsets: number[] = [];
  if (options.heightAt !== undefined) {
    for (const street of streets) {
      const h = street.heights;
      street.points.forEach((p, i) => {
        if (street.features?.some((span) => i >= span.from && i <= span.to)) return;
        offsets.push(Math.abs((h?.[i] ?? 0) - options.heightAt!(p[0], p[1])));
      });
    }
  }
  return {
    maxGrade,
    junctionStepMax,
    roadVsGroundMean: offsets.length > 0 ? mean(offsets) : Number.NaN,
    roadVsGroundMax: offsets.length > 0 ? Math.max(...offsets) : Number.NaN,
    reliefM: Number.isFinite(lo) ? hi - lo : 0,
  };
}
