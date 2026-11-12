/**
 * The street-race lap search: find a FUN lap (or point-to-point sprint) through the streets a city
 * already has, and shape the line a car drives on it.
 *
 * A lap is not just "a cycle of about the right length". Candidates are routed between waypoints with
 * a turn-penalised shortest path over the street graph (so legs run along through-streets and
 * boulevards instead of staircasing), then scored the way a track designer would: long straights that
 * end in heavy braking (overtaking spots), corner-type variety instead of a box of right angles, a
 * sane corner density, arterial use, landmarks passed and no trombone of near-parallel stretches. The
 * best few are shaped into a racing line and re-scored on that line before one is kept.
 *
 * The racing line is the minimum-curvature line inside the asphalt: it may stray from the street
 * centerline by a share of the half-width, measured against EVERY nearby street segment, so through a
 * junction it can use the plaza where two carriageways overlap — a 90° turn is taken on the widest arc
 * the junction allows instead of a kink. Long straights that are not the lap's main straight get a
 * barrier chicane: two event-scoped barrier runs that force a flick across the road.
 *
 * Model code: no rendering, browser or backend dependencies. Deterministic: integer path costs, scores
 * quantised before comparison, ties broken by candidate order.
 */
import { seededRng } from "../random/rng";
import type { StreetEdge, StreetLevel, StreetNetwork, StreetVec2 } from "./streetGenerator";

/** Road hierarchy rank — higher is wider/more arterial. */
const LEVEL_RANK: Record<StreetLevel, number> = { lane: 0, street: 1, avenue: 2, boulevard: 3 };

/** Sharpest turn a lap takes at a junction (radians). Beyond this it doubles back on itself. */
export const MAX_LAP_TURN = (120 * Math.PI) / 180;

/** Corner turn band (degrees) counted as a plain "right angle" by the variety score. */
const SQUARE_MIN = 75;
const SQUARE_MAX = 105;

/** A straight at least this long, ending in a slow corner, is an overtaking spot (m). */
export const OVERTAKE_STRAIGHT = 250;
/** Radius (m) under which the line counts as a slow corner for overtaking and braking. */
export const SLOW_CORNER_RADIUS = 40;
/** Radius (m) over which the line counts as straight. */
export const STRAIGHT_RADIUS = 250;
/** Bridged straight-run gaps: shorter than this (m)… */
const BLIP_LENGTH = 15;
/** …and never tighter than this radius (m). */
const BLIP_RADIUS = 100;
/** Chord span (m) the line metrics measure curvature across. */
export const METRIC_CHORD = 10;

/** Length of (a, b): `sqrt` is correctly rounded on every libm, `Math.hypot` is not (and is slower). */
export function planar(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

export function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------------------------

/**
 * The street graph as directed links (each edge both ways), dense node indices and per-link headings,
 * built once per search. Link `2k` runs edge `k` from `a` to `b`, link `2k + 1` back.
 */
export interface LapGraph {
  nodeIds: number[];
  nodeIndex: Map<number, number>;
  nodeX: Float64Array;
  nodeZ: Float64Array;
  edges: StreetEdge[];
  /** Per directed link: start node index, end node index, edge index into `edges`. */
  from: Int32Array;
  to: Int32Array;
  edge: Int32Array;
  /** Heading leaving `from`, and heading of travel arriving at `to` (radians, atan2(dx, dz)). */
  depart: Float64Array;
  arrive: Float64Array;
  /** Edge length (m) per directed link. */
  length: Float64Array;
  /** Outgoing directed links per node index. */
  outgoing: number[][];
  /** Node indices that sit on at least one cycle (dead-end trees peeled off), ascending. */
  cyclic: number[];
  /** 1 where a node index is in {@link LapGraph.cyclic}. */
  cyclicSet: Uint8Array;
}

function polylineHeading(points: readonly StreetVec2[], reverse: boolean): number {
  // Read the heading a few meters in, not off the first sample: a jittered first span is noise.
  const n = points.length;
  const at = (k: number): StreetVec2 => (reverse ? points[n - 1 - k]! : points[k]!);
  const origin = at(0);
  let total = 0;
  let k = 1;
  for (; k < n; k += 1) {
    const prev = at(k - 1);
    const here = at(k);
    total += planar(here[0] - prev[0], here[1] - prev[1]);
    if (total >= 10) break;
  }
  const target = at(Math.min(k, n - 1));
  return Math.atan2(target[0] - origin[0], target[1] - origin[1]);
}

export function edgeLength(points: readonly StreetVec2[]): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    total += planar(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

export function buildLapGraph(network: StreetNetwork): LapGraph {
  const nodeIds = network.nodes.map((node) => node.id);
  const nodeIndex = new Map<number, number>();
  nodeIds.forEach((id, index) => nodeIndex.set(id, index));
  const nodeX = new Float64Array(nodeIds.length);
  const nodeZ = new Float64Array(nodeIds.length);
  network.nodes.forEach((node, index) => {
    nodeX[index] = node.x;
    nodeZ[index] = node.z;
  });
  const edges = network.edges.filter((edge) => edge.a !== edge.b && edge.points.length >= 2 && nodeIndex.has(edge.a) && nodeIndex.has(edge.b));
  const count = edges.length * 2;
  const from = new Int32Array(count);
  const to = new Int32Array(count);
  const edge = new Int32Array(count);
  const depart = new Float64Array(count);
  const arrive = new Float64Array(count);
  const length = new Float64Array(count);
  const outgoing: number[][] = nodeIds.map(() => []);
  edges.forEach((street, k) => {
    const a = nodeIndex.get(street.a)!;
    const b = nodeIndex.get(street.b)!;
    const span = edgeLength(street.points);
    const forward = polylineHeading(street.points, false);
    const backward = polylineHeading(street.points, true);
    from[2 * k] = a;
    to[2 * k] = b;
    from[2 * k + 1] = b;
    to[2 * k + 1] = a;
    edge[2 * k] = k;
    edge[2 * k + 1] = k;
    depart[2 * k] = forward;
    arrive[2 * k] = backward + Math.PI;
    depart[2 * k + 1] = backward;
    arrive[2 * k + 1] = forward + Math.PI;
    length[2 * k] = span;
    length[2 * k + 1] = span;
    outgoing[a]!.push(2 * k);
    outgoing[b]!.push(2 * k + 1);
  });
  // Peel dead-end trees: only nodes with two or more ways out after peeling can sit on a cycle.
  const degree = outgoing.map((links) => links.length);
  const stack: number[] = [];
  degree.forEach((d, i) => {
    if (d === 1) stack.push(i);
  });
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (degree[node]! !== 1) continue;
    degree[node] = 0;
    for (const link of outgoing[node]!) {
      const other = to[link]!;
      if (degree[other]! > 0) {
        degree[other] = degree[other]! - 1;
        if (degree[other] === 1) stack.push(other);
      }
    }
  }
  const cyclic: number[] = [];
  const cyclicSet = new Uint8Array(nodeIds.length);
  degree.forEach((d, i) => {
    if (d >= 2) {
      cyclic.push(i);
      cyclicSet[i] = 1;
    }
  });
  return { nodeIds, nodeIndex, nodeX, nodeZ, edges, from, to, edge, depart, arrive, length, outgoing, cyclic, cyclicSet };
}

/** Nearest cyclic node index to a point, skipping `exclude`. */
function nearestCyclic(graph: LapGraph, x: number, z: number, exclude?: ReadonlySet<number>): number {
  let best = -1;
  let bestD = Infinity;
  for (const node of graph.cyclic) {
    if (exclude?.has(node)) continue;
    const d = (graph.nodeX[node]! - x) ** 2 + (graph.nodeZ[node]! - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

/**
 * Where a race must pass: a junction (node index), or the middle of a street (edge index into
 * {@link LapGraph.edges}) which the route then drives end to end.
 */
export type LapAnchor = { node: number } | { edge: number };

/** A point anchor this close (m) to a junction snaps to it instead of to the street it lies on. */
const ANCHOR_NODE_REACH = 15;

/**
 * Resolve a via/start/finish anchor. A node id is that junction. A point snaps to the nearest street
 * junction when one is within {@link ANCHOR_NODE_REACH} (or no farther than the nearest street);
 * otherwise to the street it lies on, so a checkpoint authored mid-block pins that block.
 */
export function resolveAnchor(graph: LapGraph, anchor: number | StreetVec2): LapAnchor {
  if (typeof anchor === "number") {
    const index = graph.nodeIndex.get(anchor);
    if (index === undefined) throw new Error(`street race anchor names node ${anchor}, which the network does not have`);
    return { node: index };
  }
  const [x, z] = anchor;
  const node = nearestCyclic(graph, x, z);
  if (node < 0) throw new Error("street race anchor has no street cycle to snap to");
  const nodeDistance = planar(graph.nodeX[node]! - x, graph.nodeZ[node]! - z);
  if (nodeDistance <= ANCHOR_NODE_REACH) return { node };
  let bestEdge = -1;
  let bestDistance = Infinity;
  graph.edges.forEach((edge, k) => {
    if (graph.cyclicSet[graph.from[2 * k]!] !== 1 || graph.cyclicSet[graph.to[2 * k]!] !== 1) return;
    const pts = edge.points;
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const abx = b[0] - a[0];
      const abz = b[1] - a[1];
      const lengthSq = abx * abx + abz * abz;
      const t = lengthSq < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lengthSq));
      const d = planar(a[0] + abx * t - x, a[1] + abz * t - z);
      if (d < bestDistance) {
        bestDistance = d;
        bestEdge = k;
      }
    }
  });
  return bestEdge >= 0 && bestDistance + 1 < nodeDistance ? { edge: bestEdge } : { node };
}

/**
 * Expand anchors into route stops: a street anchor becomes its two junctions, ordered so the route
 * arrives from the side nearer the stop before it (or leaves toward the anchor after it), with the
 * street's own link forced between them.
 */
function anchorStops(graph: LapGraph, anchors: readonly LapAnchor[]): { stops: number[]; forced: Map<string, number> } {
  const stops: number[] = [];
  const forced = new Map<string, number>();
  const position = (anchor: LapAnchor): [number, number] => {
    if ("node" in anchor) return [graph.nodeX[anchor.node]!, graph.nodeZ[anchor.node]!];
    const a = graph.from[2 * anchor.edge]!;
    const b = graph.to[2 * anchor.edge]!;
    return [(graph.nodeX[a]! + graph.nodeX[b]!) * 0.5, (graph.nodeZ[a]! + graph.nodeZ[b]!) * 0.5];
  };
  anchors.forEach((anchor, k) => {
    if ("node" in anchor) {
      stops.push(anchor.node);
      return;
    }
    const a = graph.from[2 * anchor.edge]!;
    const b = graph.to[2 * anchor.edge]!;
    const d2 = (node: number, p: [number, number]): number => (graph.nodeX[node]! - p[0]) ** 2 + (graph.nodeZ[node]! - p[1]) ** 2;
    let first: number;
    if (stops.length > 0) {
      const last = stops[stops.length - 1]!;
      const p: [number, number] = [graph.nodeX[last]!, graph.nodeZ[last]!];
      first = d2(a, p) <= d2(b, p) ? a : b;
    } else {
      const next = anchors[k + 1];
      const p = next === undefined ? null : position(next);
      first = p === null || d2(b, p) <= d2(a, p) ? a : b;
    }
    const second = first === a ? b : a;
    stops.push(first, second);
    forced.set(`${first}>${second}`, first === a ? 2 * anchor.edge : 2 * anchor.edge + 1);
  });
  return { stops, forced };
}

// ---------------------------------------------------------------------------------------------
// Turn-penalised shortest path
// ---------------------------------------------------------------------------------------------

interface LegCosts {
  /** Integer path cost (mm-equivalent) per directed link. */
  linkCost: Float64Array;
  /** Cost (m-equivalent) of a full 90° turn. */
  turnPenalty: number;
  /** Cheapest cost per meter any link charges (×1000): scales the A* distance bound. */
  perMeter: number;
}

function turnCost(turn: number, penalty: number): number {
  const a = Math.abs(turn);
  if (a < 0.2) return 0;
  return Math.round(penalty * Math.min(1.4, (a - 0.2) / 1.2) * 1000);
}

/** Binary min-heap over (cost, id), ties broken by id so the search is deterministic. */
class Heap {
  private costs: number[] = [];
  private ids: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  private less(i: number, j: number): boolean {
    const a = this.costs[i]!;
    const b = this.costs[j]!;
    return a < b || (a === b && this.ids[i]! < this.ids[j]!);
  }
  private swap(i: number, j: number): void {
    const c = this.costs[i]!;
    this.costs[i] = this.costs[j]!;
    this.costs[j] = c;
    const d = this.ids[i]!;
    this.ids[i] = this.ids[j]!;
    this.ids[j] = d;
  }
  push(cost: number, id: number): void {
    this.costs.push(cost);
    this.ids.push(id);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.costs[0]!, this.ids[0]!];
    const lastCost = this.costs.pop()!;
    const lastId = this.ids.pop()!;
    if (this.ids.length > 0) {
      this.costs[0] = lastCost;
      this.ids[0] = lastId;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.less(l, m)) m = l;
        if (r < this.ids.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

/**
 * Cheapest leg from `start` to `goal` that enters no blocked node, never turns sharper than
 * {@link MAX_LAP_TURN}, and — when `arriving` / `leaving` are given — continues smoothly from the
 * previous leg and into the next one. Returns the directed links, or null.
 */
function leg(
  graph: LapGraph,
  costs: LegCosts,
  start: number,
  arriving: number | null,
  goal: number,
  blocked: Uint8Array,
  leaving: number | null,
): number[] | null {
  const count = graph.from.length;
  const dist = new Float64Array(count).fill(Infinity);
  const prev = new Int32Array(count).fill(-1);
  const heap = new Heap();
  // A* bound: straight-line distance to the goal at the cheapest per-meter rate never overestimates
  // (links are at least as long as their chord, turns cost ≥ 0). Integer, so float noise cannot
  // reorder the search.
  const gx = graph.nodeX[goal]!;
  const gz = graph.nodeZ[goal]!;
  const bound = new Float64Array(graph.nodeIds.length).fill(-1);
  const h = (node: number): number => {
    let value = bound[node]!;
    if (value < 0) {
      value = Math.floor(planar(graph.nodeX[node]! - gx, graph.nodeZ[node]! - gz) * costs.perMeter);
      bound[node] = value;
    }
    return value;
  };
  for (const link of graph.outgoing[start]!) {
    const target = graph.to[link]!;
    if (target !== goal && blocked[target]) continue;
    let turn = 0;
    if (arriving !== null) {
      const delta = angleDelta(arriving, graph.depart[link]!);
      if (Math.abs(delta) > MAX_LAP_TURN) continue;
      turn = turnCost(delta, costs.turnPenalty);
    }
    const cost = costs.linkCost[link]! + turn;
    if (cost < dist[link]!) {
      dist[link] = cost;
      heap.push(cost + h(target), link);
    }
  }
  let best = -1;
  let bestCost = Infinity;
  while (heap.size > 0) {
    const [priority, link] = heap.pop();
    const node = graph.to[link]!;
    const cost = dist[link]!;
    if (priority > cost + h(node)) continue;
    if (priority >= bestCost) break;
    if (node === goal) {
      let exit = 0;
      if (leaving !== null) {
        const delta = angleDelta(graph.arrive[link]!, leaving);
        if (Math.abs(delta) > MAX_LAP_TURN) continue;
        exit = turnCost(delta, costs.turnPenalty);
      }
      if (cost + exit < bestCost) {
        bestCost = cost + exit;
        best = link;
      }
      continue;
    }
    for (const next of graph.outgoing[node]!) {
      if (graph.edge[next] === graph.edge[link]) continue;
      const target = graph.to[next]!;
      if (target !== goal && blocked[target]) continue;
      const delta = angleDelta(graph.arrive[link]!, graph.depart[next]!);
      if (Math.abs(delta) > MAX_LAP_TURN) continue;
      const total = cost + costs.linkCost[next]! + turnCost(delta, costs.turnPenalty);
      if (total < dist[next]!) {
        dist[next] = total;
        prev[next] = link;
        heap.push(total + h(target), next);
      }
    }
  }
  if (best < 0) return null;
  const path: number[] = [];
  for (let at = best; at >= 0; at = prev[at]!) path.push(at);
  path.reverse();
  return path;
}

/**
 * Chain legs through `waypoints` in order (closing back to the first for a lap). Every node is
 * visited once: a later leg may not cross an earlier one, nor an anchor it has not reached yet.
 */
function chain(graph: LapGraph, costs: LegCosts, waypoints: readonly number[], closed: boolean, forced: ReadonlyMap<string, number> = new Map()): number[] | null {
  const stops = waypoints.filter((node, i) => i === 0 || node !== waypoints[i - 1]);
  if (closed && stops.length > 1 && stops[stops.length - 1] === stops[0]) stops.pop();
  if (stops.length < 2) return null;
  const blocked = new Uint8Array(graph.nodeIds.length);
  for (const stop of stops) blocked[stop] = 1;
  const links: number[] = [];
  let heading: number | null = null;
  const legs = closed ? stops.length : stops.length - 1;
  for (let k = 0; k < legs; k += 1) {
    const from = stops[k]!;
    const goal = stops[(k + 1) % stops.length]!;
    const closing = closed && k === legs - 1;
    const pinned = forced.get(`${from}>${goal}`);
    let path: number[] | null;
    if (pinned !== undefined) {
      // A street anchor: drive that street end to end, if the turn onto it is takeable.
      path = heading !== null && Math.abs(angleDelta(heading, graph.depart[pinned]!)) > MAX_LAP_TURN ? null : [pinned];
    } else {
      path = leg(graph, costs, from, heading, goal, blocked, closing ? graph.depart[links[0]!]! : null);
    }
    if (path === null) return null;
    for (const link of path) {
      links.push(link);
      blocked[graph.to[link]!] = 1;
    }
    heading = graph.arrive[path[path.length - 1]!]!;
  }
  return links;
}

// ---------------------------------------------------------------------------------------------
// Lap outline + proxy scoring
// ---------------------------------------------------------------------------------------------

/** A corner as the scorer sees it: absolute turn (radians), direction, and arc position (m). */
export interface LapCornerSummary {
  angle: number;
  direction: -1 | 1;
  at: number;
  /** Apex radius (m), when the line has been shaped. */
  radius?: number;
}

/** Everything the lap score reads: measured off the graph outline or off a shaped racing line. */
export interface LapSummary {
  length: number;
  closed: boolean;
  /** Straight lengths (m) in lap order. */
  straights: number[];
  corners: LapCornerSummary[];
  /** Straights ≥ {@link OVERTAKE_STRAIGHT} that end in heavy braking. */
  overtakes: number;
  /** Heavy braking zones (lap simulation), when known. */
  brakingZones?: number;
  arterialShare: number;
  /** Share of lap length running close beside and parallel to another part of the lap. */
  parallelShare: number;
  /** Landmarks passed within reach. */
  landmarks: number;
  /** Share of lap length shared with laps the caller wants this one to differ from. */
  overlap: number;
}

/** One planned barrier chicane: arc distance (m, along the street centerline) of its first barrier. */
export interface PlannedChicane {
  at: number;
  /** Spacing (m) between the two barriers. */
  spacing: number;
  /** Side (-1 left / 1 right of travel) the FIRST barrier blocks. */
  side: -1 | 1;
}

/** Assembled street-centerline outline of a candidate, at the network's own sampling. */
export interface LapOutline {
  links: number[];
  nodes: number[];
  edges: number[];
  points: StreetVec2[];
  widths: number[];
  heights: number[] | null;
  /** Arc distance (m) of each lap node along `points`. */
  nodeAt: number[];
  length: number;
  arterialShare: number;
}

export function outlineOf(graph: LapGraph, links: readonly number[], closed: boolean): LapOutline {
  const points: StreetVec2[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  let anyHeights = false;
  const nodes: number[] = [graph.nodeIds[graph.from[links[0]!]!]!];
  const edges: number[] = [];
  const nodeAt: number[] = [0];
  let length = 0;
  let arterial = 0;
  links.forEach((link, k) => {
    const street = graph.edges[graph.edge[link]!]!;
    const forward = (link & 1) === 0;
    const pts = forward ? street.points : [...street.points].reverse();
    const hts = street.heights === undefined ? null : forward ? street.heights : [...street.heights].reverse();
    if (hts !== null) anyHeights = true;
    const last = k === links.length - 1 && !closed;
    const end = last ? pts.length : pts.length - 1;
    for (let p = 0; p < end; p += 1) {
      points.push(pts[p]!);
      widths.push(street.width);
      heights.push(hts?.[p] ?? 0);
    }
    const span = graph.length[link]!;
    length += span;
    if (LEVEL_RANK[street.level] >= LEVEL_RANK.avenue) arterial += span;
    edges.push(street.id);
    if (k < links.length - 1 || !closed) {
      nodes.push(graph.nodeIds[graph.to[link]!]!);
      nodeAt.push(length);
    }
  });
  return { links: [...links], nodes, edges, points, widths, heights: anyHeights ? heights : null, nodeAt, length, arterialShare: length > 0 ? arterial / length : 0 };
}

/** Douglas–Peucker on an open polyline; returns kept indices. */
function simplify(points: readonly StreetVec2[], tolerance: number): number[] {
  const n = points.length;
  if (n <= 2) return points.map((_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    const a = points[lo]!;
    const b = points[hi]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = planar(dx, dz);
    let worst = -1;
    let at = -1;
    for (let i = lo + 1; i < hi; i += 1) {
      const p = points[i]!;
      const d = len < 1e-9 ? planar(p[0] - a[0], p[1] - a[1]) : Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([lo, at], [at, hi]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => {
    if (k) out.push(i);
  });
  return out;
}

interface OutlineLeg {
  a: StreetVec2;
  b: StreetVec2;
  /** Arc distance (m) where this leg starts. */
  at: number;
  length: number;
}

function outlineLegs(outline: LapOutline, closed: boolean, tolerance: number): OutlineLeg[] {
  const pts = closed ? [...outline.points, outline.points[0]!] : outline.points;
  const arc: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) arc.push(arc[i - 1]! + planar(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const kept = simplify(pts, tolerance);
  const legs: OutlineLeg[] = [];
  for (let k = 0; k + 1 < kept.length; k += 1) {
    const i = kept[k]!;
    const j = kept[k + 1]!;
    legs.push({ a: pts[i]!, b: pts[j]!, at: arc[i]!, length: arc[j]! - arc[i]! });
  }
  return legs;
}

/** Share of lap length running within `reach` of, and parallel to, a non-neighbouring stretch. */
function parallelShareOf(legs: readonly OutlineLeg[], total: number, reach: number): number {
  let shared = 0;
  const n = legs.length;
  for (let i = 0; i < n; i += 1) {
    const li = legs[i]!;
    const ux = (li.b[0] - li.a[0]) / Math.max(1e-6, planar(li.b[0] - li.a[0], li.b[1] - li.a[1]));
    const uz = (li.b[1] - li.a[1]) / Math.max(1e-6, planar(li.b[0] - li.a[0], li.b[1] - li.a[1]));
    const span = planar(li.b[0] - li.a[0], li.b[1] - li.a[1]);
    let covered = 0;
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      const lj = legs[j]!;
      // Arc-adjacent stretches (within one corner) are the same bend, not a trombone.
      const gap = Math.min(Math.abs(lj.at - li.at), total - Math.abs(lj.at - li.at));
      if (gap < reach * 1.5) continue;
      const vx = lj.b[0] - lj.a[0];
      const vz = lj.b[1] - lj.a[1];
      const vlen = planar(vx, vz);
      if (vlen < 1e-6) continue;
      if (Math.abs((ux * vx + uz * vz) / vlen) < 0.94) continue;
      const side = (p: StreetVec2): number => (p[0] - li.a[0]) * uz - (p[1] - li.a[1]) * ux;
      if (Math.abs(side(lj.a) + side(lj.b)) * 0.5 > reach) continue;
      const along = (p: StreetVec2): number => (p[0] - li.a[0]) * ux + (p[1] - li.a[1]) * uz;
      const lo = Math.max(0, Math.min(along(lj.a), along(lj.b)));
      const hi = Math.min(span, Math.max(along(lj.a), along(lj.b)));
      if (hi > lo) covered += hi - lo;
    }
    shared += Math.min(span, covered);
  }
  return total > 0 ? shared / total : 0;
}

/** Arc span (m) a corner of `angle` occupies either side of its vertex on a street of `width`. */
function cornerHalfSpan(angle: number, width: number): number {
  return Math.max(6, width * 1.4 * Math.min(1.6, angle / (Math.PI / 2)));
}

export interface LapScoreRules {
  lapLength: number;
  arterialBias: number;
  /** Landmarks (volume-local XZ) a lap earns credit for passing within `landmarkReach`. */
  landmarks?: readonly StreetVec2[];
  landmarkReach?: number;
  /** Edge ids of laps this one should differ from. */
  avoidEdges?: ReadonlySet<number>;
  /** Plan barrier chicanes on secondary straights. */
  chicanes: boolean;
}

/** Minimum straight (m) that gets a barrier chicane when it is not the lap's main straight. */
const CHICANE_MIN_STRAIGHT = 110;
/** Narrowest street (m) a chicane fits on while leaving a car-width gap at each barrier. */
const CHICANE_MIN_WIDTH = 8.5;

/**
 * The lap as the designer reads it off the street outline, before any line is shaped: corners from
 * the simplified outline (close turns merged into hairpins or straightened into esses), straights
 * between them, and the barrier chicanes the secondary straights will get.
 */
export function summarizeOutline(outline: LapOutline, closed: boolean, rules: LapScoreRules): { summary: LapSummary; chicanes: PlannedChicane[] } {
  const total = outline.length;
  const sortedWidths = [...outline.widths].sort((a, b) => a - b);
  const width = sortedWidths[sortedWidths.length >> 1] ?? 9;
  const legs = outlineLegs(outline, closed, Math.max(1.2, width * 0.5 * 0.55));
  // Turn vertices between legs.
  interface Turn {
    angle: number;
    at: number;
  }
  const turns: Turn[] = [];
  const legCount = legs.length;
  const vertexCount = closed ? legCount : legCount - 1;
  for (let k = 0; k < vertexCount; k += 1) {
    const l0 = legs[k]!;
    const l1 = legs[(k + 1) % legCount]!;
    const h0 = Math.atan2(l0.b[0] - l0.a[0], l0.b[1] - l0.a[1]);
    const h1 = Math.atan2(l1.b[0] - l1.a[0], l1.b[1] - l1.a[1]);
    const turn = angleDelta(h0, h1);
    if (Math.abs(turn) < (12 * Math.PI) / 180) continue;
    turns.push({ angle: turn, at: (l0.at + l0.length) % Math.max(1e-6, total) });
  }
  // Cluster turns closer than a corner's own footprint: same-direction pairs become one bigger
  // corner (a hairpin round a short block), opposite pairs an S the line straightens out.
  const mergeGap = width * 2.2 + 10;
  const corners: LapCornerSummary[] = [];
  let i = 0;
  const used = new Uint8Array(turns.length);
  // Rotate so a cluster never straddles the closed seam.
  let origin = 0;
  if (closed && turns.length > 1) {
    for (let k = 0; k < turns.length; k += 1) {
      const prev = turns[(k - 1 + turns.length) % turns.length]!;
      const gap = (turns[k]!.at - prev.at + total) % total;
      if (gap >= mergeGap) {
        origin = k;
        break;
      }
    }
  }
  while (i < turns.length) {
    const start = (origin + i) % turns.length;
    if (used[start]) {
      i += 1;
      continue;
    }
    const cluster: Turn[] = [turns[start]!];
    used[start] = 1;
    let j = i + 1;
    while (j < turns.length) {
      const idx = (origin + j) % turns.length;
      const last = cluster[cluster.length - 1]!;
      const gap = (turns[idx]!.at - last.at + total) % total;
      if (gap >= mergeGap) break;
      cluster.push(turns[idx]!);
      used[idx] = 1;
      j += 1;
    }
    i = j;
    // Split the cluster into same-direction runs.
    let run: Turn[] = [];
    const runs: Turn[][] = [];
    for (const turn of cluster) {
      if (run.length > 0 && Math.sign(run[0]!.angle) !== Math.sign(turn.angle)) {
        runs.push(run);
        run = [];
      }
      run.push(turn);
    }
    if (run.length > 0) runs.push(run);
    const ess = runs.length > 1;
    for (const r of runs) {
      const sum = r.reduce((s, t) => s + t.angle, 0);
      corners.push({
        // The racing line takes the two halves of a tight S as one flick, not two right angles.
        angle: Math.abs(sum) * (ess ? 0.6 : 1),
        direction: sum >= 0 ? 1 : -1,
        at: r[Math.floor(r.length / 2)]!.at,
      });
    }
  }
  corners.sort((a, b) => a.at - b.at);
  // Straights between corner footprints.
  const straights: { at: number; length: number; next: number }[] = [];
  if (corners.length === 0) {
    straights.push({ at: 0, length: total, next: -1 });
  } else {
    const count = closed ? corners.length : corners.length + 1;
    for (let k = 0; k < count; k += 1) {
      const before = closed ? corners[k]! : k === 0 ? null : corners[k - 1]!;
      const after = closed ? corners[(k + 1) % corners.length]! : k < corners.length ? corners[k]! : null;
      const from = before === null ? 0 : before.at + cornerHalfSpan(before.angle, width);
      const until = after === null ? total : after.at - cornerHalfSpan(after.angle, width);
      let span = until - from;
      if (closed && after !== null && before !== null && after.at <= before.at) span += total;
      if (span > 0) straights.push({ at: from, length: span, next: after === null ? -1 : corners.indexOf(after) });
    }
  }
  // Chicanes on the secondary straights, the main straight left clean for the overtake.
  const chicanes: PlannedChicane[] = [];
  const chicaneCorners: LapCornerSummary[] = [];
  const straightLengths: number[] = straights.map((s) => s.length);
  if (rules.chicanes) {
    const arc = arcProfile(outline.points, closed).at;
    const widthAt = (distance: number): number => {
      const d = closed ? ((distance % total) + total) % total : distance;
      let lo = 0;
      let hi = arc.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (arc[mid]! <= d) lo = mid;
        else hi = mid - 1;
      }
      return outline.widths[lo] ?? width;
    };
    const ranked = straights.map((s, index) => ({ s, index })).sort((a, b) => b.s.length - a.s.length || a.index - b.index);
    const budget = Math.min(4, 1 + Math.floor(total / 900));
    for (const { s, index } of ranked.slice(1)) {
      if (chicanes.length >= budget) break;
      if (s.length < CHICANE_MIN_STRAIGHT) break;
      const local = widthAt(s.at + s.length * 0.6);
      if (local < CHICANE_MIN_WIDTH) continue;
      const spacing = Math.max(16, Math.min(26, local * 1.4 + 6));
      // Late on the straight (a braking zone, not a speed bump halfway), with both barriers clear of
      // every junction mouth: try spots outward from 62% along.
      const clear = (from: number): boolean => {
        for (const nodeAt of outline.nodeAt) {
          const d = (((from - nodeAt) % total) + total) % total;
          if (d < local + 5 || total - d < spacing + local + 5) return false;
        }
        return from - s.at >= 50 && s.at + s.length - (from + spacing) >= 20;
      };
      let at = -1;
      for (let k = 0; k <= 40 && at < 0; k += 1) {
        const offset = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 4;
        const spot = s.at + s.length * 0.62 + offset;
        if (clear(spot)) at = spot;
      }
      if (at < 0) continue;
      const nextCorner = s.next >= 0 ? corners[s.next]! : null;
      // First barrier on the inside of what comes next, so the flick lands the car on the outside line.
      const side: -1 | 1 = nextCorner === null ? 1 : nextCorner.direction;
      chicanes.push({ at: at % total, spacing, side });
      chicaneCorners.push({ angle: 0.5, direction: (-side) as -1 | 1, at: at % total }, { angle: 0.5, direction: side, at: (at + spacing) % total });
      straightLengths[index] = Math.max(at - s.at - 12, s.at + s.length - at - spacing - 12);
    }
  }
  let overtakes = 0;
  straights.forEach((s, index) => {
    if (straightLengths[index]! < OVERTAKE_STRAIGHT) return;
    const next = s.next >= 0 ? corners[s.next]! : null;
    if (next !== null && next.angle >= Math.PI / 3) overtakes += 1;
  });
  const allCorners = [...corners, ...chicaneCorners].sort((a, b) => a.at - b.at);
  return {
    summary: {
      length: total,
      closed,
      straights: straightLengths,
      corners: allCorners,
      overtakes,
      arterialShare: outline.arterialShare,
      parallelShare: parallelShareOf(legs, total, Math.max(60, width * 11)),
      landmarks: landmarksPassed(outline.points, rules.landmarks, rules.landmarkReach ?? 40),
      overlap: overlapShare(outline, rules.avoidEdges),
    },
    chicanes,
  };
}

function landmarksPassed(points: readonly StreetVec2[], landmarks: readonly StreetVec2[] | undefined, reach: number): number {
  if (landmarks === undefined || landmarks.length === 0) return 0;
  let count = 0;
  for (const mark of landmarks) {
    for (const p of points) {
      if (planar(p[0] - mark[0], p[1] - mark[1]) <= reach) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

function overlapShare(outline: LapOutline, avoid: ReadonlySet<number> | undefined): number {
  if (avoid === undefined || avoid.size === 0 || outline.length <= 0) return 0;
  let shared = 0;
  outline.links.forEach((_, k) => {
    if (avoid.has(outline.edges[k]!)) shared += (outline.nodeAt[k + 1] ?? outline.length) - outline.nodeAt[k]!;
  });
  return shared / outline.length;
}

/** Corner class the variety score counts. */
export function cornerClass(corner: Pick<LapCornerSummary, "angle" | "radius">): "hairpin" | "square" | "tight" | "medium" | "sweeper" | "kink" {
  const deg = (corner.angle * 180) / Math.PI;
  if (deg >= 140) return "hairpin";
  if ((corner.radius ?? 0) >= 70) return deg < 45 ? "kink" : "sweeper";
  if (deg < 35) return "kink";
  if (deg >= SQUARE_MIN && deg <= SQUARE_MAX) return "square";
  return deg > SQUARE_MAX ? "tight" : "medium";
}

/** Share of corners that are plain right angles. */
export function squareShare(corners: readonly Pick<LapCornerSummary, "angle" | "radius">[]): number {
  if (corners.length === 0) return 0;
  return corners.filter((corner) => cornerClass(corner) === "square").length / corners.length;
}

/**
 * How good a lap is to race, higher is better. Reads the same {@link LapSummary} whether it came off
 * the graph outline (cheap, for every candidate) or off the shaped racing line (for the finalists).
 */
export function lapScore(summary: LapSummary, rules: LapScoreRules): number {
  const target = rules.lapLength;
  const error = Math.abs(summary.length - target) / target;
  let score = -3 * error - 12 * Math.max(0, error - 0.12);
  const straights = [...summary.straights].sort((a, b) => b - a);
  score += Math.min(straights[0] ?? 0, 450) / 250;
  score += (0.5 * Math.min(straights[1] ?? 0, 300)) / 300;
  score += 0.7 * Math.min(summary.overtakes, 2);
  if (summary.brakingZones !== undefined) score += 0.15 * Math.min(summary.brakingZones, 6);
  const corners = summary.corners;
  score -= 8 * Math.max(0, squareShare(corners) - 0.35);
  score += 0.15 * new Set(corners.map((corner) => cornerClass(corner))).size;
  const perKm = corners.length / Math.max(0.05, summary.length / 1000);
  score -= 0.35 * Math.max(0, perKm - 7) + (summary.closed ? 0.5 * Math.max(0, 2 - perKm) : 0);
  score += 1.2 * summary.arterialShare * rules.arterialBias;
  score -= 5 * Math.max(0, summary.parallelShare - 0.08);
  score += 0.4 * summary.landmarks;
  score -= 2.5 * summary.overlap;
  return score;
}

/** Score quantised for comparison, so 1-ULP float noise never flips which lap wins. */
export function quantizedScore(score: number): number {
  return Math.round(score * 1e5);
}

// ---------------------------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------------------------

export interface LapSearchRequest {
  closed: boolean;
  lapLength: number;
  arterialBias: number;
  /** Anchors the route must pass, in order (the start anchor first when given). */
  anchors: LapAnchor[];
  /** A lap's `anchors` holds only a start hint: route a free lap through it. */
  startOnly?: boolean;
  /** Sprint finish (sprints only). */
  finish: LapAnchor | null;
  seed: string;
  /** Upper bound on routing attempts. */
  attempts?: number;
}

/** Round a polygon target point so 1-ULP noise in sin/cos cannot flip which junction is nearest. */
function quantize(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Generate distinct candidate routes. Free laps chain legs round a random polygon of waypoints sized
 * (adaptively) for the target length; anchored laps and sprints route through their anchors in order,
 * with detour waypoints added — only when the anchors alone fall short of the target — to grow the
 * route toward it.
 */
export function lapCandidates(graph: LapGraph, request: LapSearchRequest): number[][] {
  if (graph.cyclic.length < 3 && request.closed) return [];
  const rng = seededRng(`raceCircuit:${request.seed}`);
  const bias = request.arterialBias;
  const linkCost = new Float64Array(graph.from.length);
  for (let link = 0; link < linkCost.length; link += 1) {
    const level = graph.edges[graph.edge[link]!]!.level;
    linkCost[link] = Math.round(graph.length[link]! * (1 - 0.45 * bias * (LEVEL_RANK[level] / LEVEL_RANK.boulevard)) * 1000);
  }
  // Boulevards are the cheapest per meter; the A* bound must not charge less than they do.
  const perMeter = (1 - 0.45 * bias) * 1000 - 1;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const node of graph.cyclic) {
    minX = Math.min(minX, graph.nodeX[node]!);
    maxX = Math.max(maxX, graph.nodeX[node]!);
    minZ = Math.min(minZ, graph.nodeZ[node]!);
    maxZ = Math.max(maxZ, graph.nodeZ[node]!);
  }
  const anchored = request.anchors.length > 0 && !(request.closed && request.startOnly === true);
  const base = anchorStops(graph, [...request.anchors, ...(request.finish === null ? [] : [request.finish])]);
  const pin = request.closed && request.startOnly === true && request.anchors.length > 0 ? base.stops[0]! : null;
  const attempts = request.attempts ?? (anchored || !request.closed ? 28 : 40);
  const seen = new Set<string>();
  const out: number[][] = [];
  let scale = 0.8;
  const target = request.lapLength;
  // Anchors that already make a route of about the target length are the route: no detours.
  let detoursWanted = true;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const turnPenalty = 25 + rng() * 140;
    const costs: LegCosts = { linkCost, turnPenalty, perMeter };
    let waypoints: number[];
    let forced: ReadonlyMap<string, number> = base.forced;
    if (request.closed && !anchored) {
      const radius = (target / (2 * Math.PI)) * scale;
      const count = 3 + Math.floor(rng() * 3);
      const turn = rng() < 0.5 ? -1 : 1;
      let phase = rng() * Math.PI * 2;
      let cx: number;
      let cz: number;
      if (pin === null) {
        const spanX = Math.max(0, (maxX - minX) * 0.5 - radius);
        const spanZ = Math.max(0, (maxZ - minZ) * 0.5 - radius);
        cx = (minX + maxX) * 0.5 + (rng() * 2 - 1) * spanX;
        cz = (minZ + maxZ) * 0.5 + (rng() * 2 - 1) * spanZ;
      } else {
        // The start hint sits on the polygon: its centre lies one radius away, toward the district.
        const px = graph.nodeX[pin]!;
        const pz = graph.nodeZ[pin]!;
        const toward = Math.atan2((minX + maxX) * 0.5 - px, (minZ + maxZ) * 0.5 - pz) + (rng() - 0.5) * Math.PI;
        cx = px + Math.sin(toward) * radius;
        cz = pz + Math.cos(toward) * radius;
        phase = toward + Math.PI;
      }
      const chosen = new Set<number>(pin === null ? [] : [pin]);
      waypoints = pin === null ? [] : [pin];
      for (let k = pin === null ? 0 : 1; k < count; k += 1) {
        const angle = phase + turn * ((k + (pin !== null && k === 0 ? 0 : (rng() - 0.5) * 0.7)) / count) * Math.PI * 2;
        const r = radius * (0.75 + rng() * 0.5);
        const node = nearestCyclic(graph, quantize(cx + Math.sin(angle) * r), quantize(cz + Math.cos(angle) * r), chosen);
        if (node < 0) break;
        chosen.add(node);
        waypoints.push(node);
      }
      if (waypoints.length < 3) continue;
      forced = new Map();
    } else {
      waypoints = [...base.stops];
      if (!request.closed) {
        if (waypoints.length === 0) waypoints.push(graph.cyclic[Math.floor(rng() * graph.cyclic.length)]!);
        if (request.finish === null) {
          const from = waypoints[waypoints.length - 1]!;
          const angle = rng() * Math.PI * 2;
          const reach = (target / 1.25) * scale;
          waypoints.push(nearestCyclic(graph, quantize(graph.nodeX[from]! + Math.sin(angle) * reach), quantize(graph.nodeZ[from]! + Math.cos(angle) * reach), new Set(waypoints)));
        }
      }
      // Detours: the first attempt routes the anchors as given; later ones push a waypoint off a
      // random leg (never one pinned to an anchored street) to grow the route toward the target.
      const detours = attempt === 0 || !detoursWanted ? 0 : 1 + Math.floor(rng() * 2);
      for (let d = 0; d < detours; d += 1) {
        const legCount = request.closed ? waypoints.length : waypoints.length - 1;
        if (legCount < 1) break;
        const k = Math.floor(rng() * legCount);
        const a = waypoints[k]!;
        const b = waypoints[(k + 1) % waypoints.length]!;
        if (forced.has(`${a}>${b}`)) continue;
        const ax = graph.nodeX[a]!;
        const az = graph.nodeZ[a]!;
        const bx = graph.nodeX[b]!;
        const bz = graph.nodeZ[b]!;
        const len = Math.max(1, planar(bx - ax, bz - az));
        // Push outward, away from the anchors' centroid, so a detour widens the lap instead of folding it.
        let cx = 0;
        let cz = 0;
        for (const w of waypoints) {
          cx += graph.nodeX[w]!;
          cz += graph.nodeZ[w]!;
        }
        cx /= waypoints.length;
        cz /= waypoints.length;
        const mx = (ax + bx) * 0.5;
        const mz = (az + bz) * 0.5;
        let nx = (bz - az) / len;
        let nz = -(bx - ax) / len;
        if ((mx - cx) * nx + (mz - cz) * nz < 0 || (!request.closed && rng() < 0.5)) {
          nx = -nx;
          nz = -nz;
        }
        const deficit = Math.max(target * 0.15, target - estimateLength(graph, waypoints, request.closed));
        const push = (deficit / (2 * detours)) * scale * (0.6 + rng() * 0.8);
        const node = nearestCyclic(graph, quantize(mx + nx * push), quantize(mz + nz * push), new Set(waypoints));
        if (node >= 0) waypoints.splice(k + 1, 0, node);
      }
    }
    const links = chain(graph, costs, waypoints, request.closed, forced);
    if (links === null || links.length < (request.closed ? 3 : 1)) continue;
    let length = 0;
    for (const link of links) length += graph.length[link]!;
    if (attempt === 0 && anchored && length >= target * 0.9) detoursWanted = false;
    if (!anchored || (!request.closed && request.finish === null)) {
      // Steer the next attempts' polygon size toward the target length.
      const ratio = target / Math.max(1, length);
      scale *= Math.min(1.25, Math.max(0.8, Math.pow(ratio, 0.6)));
      scale = Math.min(2.5, Math.max(0.3, scale));
    }
    const key = request.closed ? cycleKey(graph, links) : links.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(links);
  }
  return out;
}

/** Same lap whatever node it starts at or direction it runs: sorted edge set. */
function cycleKey(graph: LapGraph, links: readonly number[]): string {
  return links
    .map((link) => graph.edge[link]!)
    .sort((a, b) => a - b)
    .join(",");
}

function estimateLength(graph: LapGraph, waypoints: readonly number[], closed: boolean): number {
  let total = 0;
  const count = closed ? waypoints.length : waypoints.length - 1;
  for (let k = 0; k < count; k += 1) {
    const a = waypoints[k]!;
    const b = waypoints[(k + 1) % waypoints.length]!;
    // Manhattan-ish streets: a grid path is ~1.25× the straight-line distance.
    total += planar(graph.nodeX[b]! - graph.nodeX[a]!, graph.nodeZ[b]! - graph.nodeZ[a]!) * 1.25;
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// Racing line
// ---------------------------------------------------------------------------------------------

/** A lateral window the line must pass through at one sample (offset along the street's left normal). */
export interface LineGate {
  index: number;
  lo: number;
  hi: number;
}

function normalsOf(points: readonly StreetVec2[], closed: boolean): [number, number][] {
  const n = points.length;
  return points.map((_, i) => {
    const before = closed ? points[(i - 1 + n) % n]! : points[Math.max(0, i - 1)]!;
    const after = closed ? points[(i + 1) % n]! : points[Math.min(n - 1, i + 1)]!;
    const dx = after[0] - before[0];
    const dz = after[1] - before[1];
    const len = planar(dx, dz) || 1;
    // Right of travel for heading atan2(dx, dz), the side convention kerbs and corners use.
    return [dz / len, -dx / len];
  });
}

/**
 * The minimum-curvature line inside the asphalt. `base` is the street centerline sampled evenly;
 * every point may move up to `cut × halfWidth` from the NEAREST street segment around it (so inside a
 * junction it can use the plaza where two carriageways overlap), and `gates` pin lateral windows (the
 * gaps a chicane's barriers leave). Smoothed coarse-to-fine with a bending-energy stencil, so wobbly
 * streets become straights and corners take the widest arc the street allows.
 */
export function shapeRacingLine(base: readonly StreetVec2[], widths: readonly number[], closed: boolean, cut: number, gates: readonly LineGate[] = []): StreetVec2[] {
  const n = base.length;
  if (n < 8 || cut <= 0) return base.map((p) => [p[0], p[1]] as StreetVec2);
  let spacing = 0;
  for (let i = 0; i + 1 < n; i += 1) spacing += planar(base[i + 1]![0] - base[i]![0], base[i + 1]![1] - base[i]![1]);
  spacing /= n - 1;
  const allowed = new Float64Array(n);
  let widest = 0;
  widths.forEach((w, i) => {
    allowed[i] = Math.max(0, w * 0.5 * cut);
    widest = Math.max(widest, w);
  });
  const window = Math.ceil((widest * 0.9) / Math.max(0.5, spacing)) + 2;
  const normals = normalsOf(base, closed);
  const gateLo = new Float64Array(n).fill(-Infinity);
  const gateHi = new Float64Array(n).fill(Infinity);
  const gated = new Uint8Array(n);
  for (const gate of gates) {
    gateLo[gate.index] = gate.lo;
    gateHi[gate.index] = gate.hi;
    gated[gate.index] = 1;
  }
  const segments = closed ? n : n - 1;
  const bx = new Float64Array(n);
  const bz = new Float64Array(n);
  const xs = new Float64Array(n);
  const zs = new Float64Array(n);
  base.forEach((p, i) => {
    bx[i] = p[0];
    bz[i] = p[1];
    xs[i] = p[0];
    zs[i] = p[1];
  });
  const nx = new Float64Array(n);
  const nz = new Float64Array(n);

  /** Pull (x, z) back inside the union of street capsules around sample `i`, then through its gate; writes xs/zs[i]. */
  const constrain = (i: number, x: number, z: number): void => {
    let bestSlack = Infinity;
    let cx = x;
    let cz = z;
    let bestDist = 0;
    let bestAllowed = 0;
    // Own segments first, then outward: a point already on the asphalt stops at the first capsule.
    for (let s = 0; s <= 2 * window; s += 1) {
      const k = s & 1 ? -((s + 1) >> 1) : s >> 1;
      let j = i + k;
      if (closed) j = j < 0 ? j + n : j >= n ? j - n : j;
      else if (j < 0 || j >= segments) continue;
      const j1 = j + 1 === n ? 0 : j + 1;
      const ax = bx[j]!;
      const az = bz[j]!;
      const abx = bx[j1]! - ax;
      const abz = bz[j1]! - az;
      const lengthSq = abx * abx + abz * abz;
      const t = lengthSq < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lengthSq));
      const px = ax + abx * t;
      const pz = az + abz * t;
      const d = planar(x - px, z - pz);
      const r = allowed[j]! + (allowed[j1]! - allowed[j]!) * t;
      const slack = d - r;
      if (slack < bestSlack) {
        bestSlack = slack;
        cx = px;
        cz = pz;
        bestDist = d;
        bestAllowed = r;
        if (slack <= 0) break;
      }
    }
    if (bestSlack > 0 && bestDist > 1e-9) {
      x = cx + ((x - cx) / bestDist) * bestAllowed;
      z = cz + ((z - cz) / bestDist) * bestAllowed;
    }
    if (gated[i]) {
      const [gx, gz] = normals[i]!;
      const lateral = (x - bx[i]!) * gx + (z - bz[i]!) * gz;
      const clamped = Math.max(gateLo[i]!, Math.min(gateHi[i]!, lateral));
      x += gx * (clamped - lateral);
      z += gz * (clamped - lateral);
    }
    xs[i] = x;
    zs[i] = z;
  };

  // Gates first, so the coarse passes already bend toward them.
  for (const gate of gates) constrain(gate.index, xs[gate.index]!, zs[gate.index]!);
  // Coarse to fine, ending on neighbours (h = 1) so odd and even samples never decouple.
  const strideMeters = [40, 20, 10, 5, 0];
  const iterations = [12, 10, 8, 6, 8];
  const relax = 0.6;
  strideMeters.forEach((meters, level) => {
    const h = Math.max(1, Math.round(meters / Math.max(0.5, spacing)));
    if (n < h * 5) return;
    for (let iter = 0; iter < iterations[level]!; iter += 1) {
      for (let i = 0; i < n; i += 1) {
        if (!closed && (i - 2 * h < 0 || i + 2 * h >= n)) {
          nx[i] = xs[i]!;
          nz[i] = zs[i]!;
          continue;
        }
        const a = (i - 2 * h + 2 * n) % n;
        const b = (i - h + n) % n;
        const c = (i + h) % n;
        const d = (i + 2 * h) % n;
        // Bending-energy stencil: exact for cubics, so it kills kinks and spreads turns.
        const tx = (-xs[a]! + 4 * xs[b]! + 4 * xs[c]! - xs[d]!) / 6;
        const tz = (-zs[a]! + 4 * zs[b]! + 4 * zs[c]! - zs[d]!) / 6;
        nx[i] = xs[i]! + (tx - xs[i]!) * relax;
        nz[i] = zs[i]! + (tz - zs[i]!) * relax;
      }
      for (let i = 0; i < n; i += 1) constrain(i, nx[i]!, nz[i]!);
    }
  });
  const out: StreetVec2[] = [];
  for (let i = 0; i < n; i += 1) out.push([xs[i]!, zs[i]!]);
  return out;
}

/**
 * Lateral gates for planned chicanes on the evenly sampled street centerline: at each barrier the
 * line must pass through the gap the barrier leaves on the open side.
 */
export function chicaneGates(chicanes: readonly PlannedChicane[], widths: readonly number[], spacing: number, count: number): { gates: LineGate[]; barriers: { index: number; side: -1 | 1; gap: number }[] } {
  const gates: LineGate[] = [];
  const barriers: { index: number; side: -1 | 1; gap: number }[] = [];
  for (const chicane of chicanes) {
    for (const [offset, side] of [
      [0, chicane.side],
      [chicane.spacing, -chicane.side as -1 | 1],
    ] as const) {
      const index = Math.round((chicane.at + offset) / spacing) % count;
      const width = widths[index] ?? 9;
      const half = width * 0.5;
      const gap = Math.max(3.4, width * 0.4);
      // `side` is where the barrier stands (-1 left, 1 right of travel); the gap is the far side.
      // Normals point RIGHT of travel, so a left barrier leaves the gap at positive offsets.
      const centre = side === -1 ? half - gap * 0.5 : -(half - gap * 0.5);
      const reach = 0.3;
      const spread = 0;
      for (let k = -spread; k <= spread; k += 1) gates.push({ index: (index + k + count) % count, lo: centre - reach, hi: centre + reach });
      barriers.push({ index, side, gap });
    }
  }
  return { gates, barriers };
}

// ---------------------------------------------------------------------------------------------
// Line metrics
// ---------------------------------------------------------------------------------------------

/** Radius of the circle through three points; Infinity when they are collinear. */
export function circumRadius(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const cbx = b[0] - c[0];
  const cbz = b[1] - c[1];
  const cross = abx * cbz - abz * cbx;
  if (Math.abs(cross) < 1e-9) return Infinity;
  const ab = planar(abx, abz);
  const bc = planar(cbx, cbz);
  const ca = planar(c[0] - a[0], c[1] - a[1]);
  return (ab * bc * ca) / (2 * Math.abs(cross));
}

/** Per-point radius over a ~`span` meter chord; an open line reads Infinity where the chord runs off an end. */
export function radiusProfile(points: readonly StreetVec2[], span: number, closed: boolean): number[] {
  const n = points.length;
  const radii = new Array<number>(n).fill(Infinity);
  if (n < 5) return radii;
  let total = 0;
  for (let i = 0; i + 1 < n; i += 1) total += planar(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  const perPoint = total / Math.max(1, n - 1);
  const step = Math.max(1, Math.round(span / Math.max(0.5, perPoint)));
  for (let i = 0; i < n; i += 1) {
    if (!closed && (i - step < 0 || i + step >= n)) continue;
    radii[i] = circumRadius(points[(i - step + n * 2) % n]!, points[i]!, points[(i + step) % n]!);
  }
  return radii;
}

/** Arc length at each point and the total (closed: including the closing span). */
export function arcProfile(points: readonly StreetVec2[], closed: boolean): { at: number[]; total: number } {
  const at = new Array<number>(points.length).fill(0);
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    at[i] = total;
    if (!closed && i === points.length - 1) break;
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += planar(b[0] - a[0], b[1] - a[1]);
  }
  return { at, total };
}

/** Straight runs (arc start, length; m) of the line — radius over {@link STRAIGHT_RADIUS} at a {@link METRIC_CHORD} chord — in lap order. */
export function straightRuns(radii: readonly number[], at: readonly number[], total: number, closed: boolean, bridge = false): { start: number; length: number }[] {
  const n = radii.length;
  const runs: { start: number; length: number }[] = [];
  const straight = radii.map((r) => r > STRAIGHT_RADIUS);
  if (bridge && n > 2) {
    // A flat-out straight is not ended by a blip: a gap under BLIP_LENGTH that never drops below
    // BLIP_RADIUS (a 2-3° kink where the line crosses a junction) is bridged.
    const perPoint = total / (closed ? n : n - 1);
    const maxGap = Math.max(1, Math.floor(BLIP_LENGTH / Math.max(0.1, perPoint)));
    const copy = [...straight];
    for (let i = 0; i < n; i += 1) {
      if (copy[i] || !copy[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]) continue;
      let gap = 0;
      let gentle = true;
      while (gap <= maxGap && (closed || i + gap < n) && !copy[(i + gap) % n]) {
        if (radii[(i + gap) % n]! < BLIP_RADIUS) gentle = false;
        gap += 1;
      }
      if (gentle && gap <= maxGap && (closed || i + gap < n)) for (let k = 0; k < gap; k += 1) straight[(i + k) % n] = true;
    }
  }
  let origin = closed ? straight.findIndex((s) => !s) : 0;
  if (origin < 0) return [{ start: 0, length: total }];
  let run = -1;
  const span = (from: number, to: number): number => {
    const a = at[from % n]!;
    const b = to >= n && !closed ? total : at[to % n]!;
    return b >= a ? b - a : total - a + b;
  };
  for (let k = 0; k <= n; k += 1) {
    const i = origin + k;
    const isStraight = k < n && straight[i % n]!;
    if (isStraight && run < 0) run = i;
    if (!isStraight && run >= 0) {
      runs.push({ start: at[run % n]!, length: span(run, i) });
      run = -1;
    }
  }
  return runs;
}

/**
 * Point-mass lap simulation: corner speed v ≤ √(μgR), then forward (traction) and backward (braking)
 * passes. Returns speeds per point and the heavy braking zones (≥ 50 km/h shed).
 */
export function simulateLap(points: readonly StreetVec2[], radii: readonly number[], closed: boolean): { speeds: number[]; time: number; brakingZones: number } {
  const n = points.length;
  const mu = 1.5;
  const vmax = 75;
  const accel = 7;
  const brake = 16;
  const ds = points.map((p, i) => (closed || i + 1 < n ? planar(points[(i + 1) % n]![0] - p[0], points[(i + 1) % n]![1] - p[1]) : 0));
  const v = radii.map((r) => Math.min(vmax, Math.sqrt(mu * 9.81 * r)));
  if (!closed) v[0] = 0;
  const passes = closed ? 2 : 1;
  for (let pass = 0; pass < passes; pass += 1) {
    for (let k = 0; k < (closed ? 2 * n : n - 1); k += 1) {
      const i = k % n;
      const j = (i + 1) % n;
      v[j] = Math.min(v[j]!, Math.sqrt(v[i]! ** 2 + 2 * accel * ds[i]!));
    }
    for (let k = closed ? 2 * n : n - 1; k > 0; k -= 1) {
      const i = k % n;
      const j = (i - 1 + n) % n;
      v[j] = Math.min(v[j]!, Math.sqrt(v[i]! ** 2 + 2 * brake * ds[j]!));
    }
  }
  let time = 0;
  let zones = 0;
  let peak = -1;
  const limit = closed ? n : n - 1;
  for (let i = 0; i < limit; i += 1) {
    const a = v[i]!;
    const b = v[(i + 1) % n]!;
    time += ds[i]! / Math.max(1, (a + b) / 2);
    if (b < a - 0.05) {
      if (peak < 0) peak = a;
    } else if (peak >= 0) {
      if (peak - a >= 50 / 3.6) zones += 1;
      peak = -1;
    }
  }
  return { speeds: v, time, brakingZones: zones };
}

/** Heading change (radians, signed) across a corner, read just outside its tight span. */
export function cornerTurn(points: readonly StreetVec2[], at: readonly number[], total: number, entry: number, exit: number, closed: boolean, reachBefore: number, reachAfter: number): number {
  // Headings are read off positions interpolated at exact arc distances, so the reading is continuous
  // in its inputs: no sample boundary for float noise to flip it across.
  const n = points.length;
  const position = (distance: number): [number, number] => {
    let target = distance;
    if (closed) target = ((target % total) + total) % total;
    else target = Math.max(0, Math.min(total, target));
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (at[mid]! <= target) lo = mid;
      else hi = mid - 1;
    }
    const a = points[lo]!;
    const nextIndex = closed ? (lo + 1) % n : Math.min(n - 1, lo + 1);
    const b = points[nextIndex]!;
    const span = (nextIndex === 0 ? total : at[nextIndex]!) - at[lo]!;
    const t = span > 1e-9 ? Math.max(0, Math.min(1, (target - at[lo]!) / span)) : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const heading = (distance: number): number => {
    const a = position(distance - 1.5);
    const b = position(distance + 1.5);
    return Math.atan2(b[0] - a[0], b[1] - a[1]);
  };
  return angleDelta(heading(at[entry]! - reachBefore), heading(at[exit]! + reachAfter));
}
