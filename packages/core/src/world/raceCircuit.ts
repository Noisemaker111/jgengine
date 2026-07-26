/**
 * A race circuit is a SECTION OF A CITY, blocked off — not a separate shape. This module lifts a
 * closed lap out of an existing {@link StreetNetwork}: pick a cycle through the streets that are
 * already there, then SEAL every side street leaving it. That is how a street race works in an open
 * world (drive the city freely, then an instanced event fences a few blocks into a lap) and how a
 * real street circuit works (Monaco, Detroit, Baku are public roads with barriers dropped in).
 *
 * The route is derived, never invented: `centerline`, `widths`, and `heights` are read off the same
 * {@link StreetEdge}s the open world drives on, so the lap and the city are byte-for-byte the same
 * asphalt. Everything a race needs comes with it — {@link CircuitSeal}s (the barriers that make it an
 * instance), ordered {@link CircuitGate}s that hand straight to `raceTrack({ checkpoints })`,
 * start/finish, a staggered grid, corner analysis, kerbs, and timing sectors.
 *
 * Works on either topology family the generator produces. On a `net` (a city) it searches the graph
 * for the cycle that best matches the requested lap length and arterial bias. On a `circuit` (the
 * generator's closed-loop mode) the loop edges ARE the cycle, so the same call returns the whole lap
 * — one API, both slider extremes, no second code path.
 *
 * Volume-local XZ coords throughout, matching {@link StreetNetwork}; the caller rotates/translates
 * into world space. Deterministic: same network + rules ⇒ identical route, with bounded search work.
 *
 * @capability race-circuit lift a closed, sealed-off race lap out of an existing city street network
 */
import { seededRng } from "../random/rng";
import type { StreetEdge, StreetLevel, StreetNetwork, StreetVec2 } from "./streetGenerator";

/** Road hierarchy rank — higher is wider/more arterial. Shared with the fabric's ordering. */
const LEVEL_RANK: Record<StreetLevel, number> = { lane: 0, street: 1, avenue: 2, boulevard: 3 };

/** How a sealed-off side street is closed: hard barriers, a cone line, or temporary fencing. */
export type CircuitSealKind = "barrier" | "cones" | "fence";

/** Fully-defaulted sliders the route search answers to. */
export interface CircuitRouteRules {
  seed: string;
  /** Target lap length in meters — the search keeps the cycle closest to this. */
  lapLength: number;
  /** 0 races any street; 1 keeps the lap on avenues and boulevards only. */
  arterialBias: number;
  /** Reject a lap that kinks tighter than this radius (m) — an undrivable hairpin. */
  minCornerRadius: number;
  /** Ordered checkpoint gates placed around the lap. */
  checkpoints: number;
  /** Laps the produced race runs. */
  laps: number;
  /** Half-height of a checkpoint gate volume (m) — how tall the trigger box reaches. */
  gateHeight: number;
  /** Starting grid slots behind the line (0 = no grid). */
  gridSlots: number;
  /** How the side streets leaving the lap are closed off. */
  sealKind: CircuitSealKind;
  /** Timing sectors the lap splits into. */
  sectors: number;
  /**
   * Arc-length spacing (m) the lap is resampled to. City streets are sampled coarsely enough for a
   * road ribbon but far too coarsely for a racing surface, corner analysis, or kerbs.
   */
  sampleStep: number;
  /**
   * How far the racing line may be pulled off the street centerline while rounding a junction, as a
   * fraction of the local half-width. 0 keeps the hard kink; ~0.5 uses the full lane either side.
   */
  cornerCut: number;
}

/** Defaults: a ~2.4 km arterial street lap with 12 gates, 3 laps, and barriered side streets. */
export const CIRCUIT_ROUTE_DEFAULTS: CircuitRouteRules = {
  seed: "circuit",
  lapLength: 2400,
  arterialBias: 0.7,
  minCornerRadius: 9,
  checkpoints: 12,
  laps: 3,
  gateHeight: 6,
  gridSlots: 12,
  sealKind: "barrier",
  sectors: 3,
  sampleStep: 2.5,
  cornerCut: 0.42,
};

/**
 * One street closed off where it leaves the lap — the thing that turns public roads into an
 * instanced event. Stands just off the junction, spanning the sealed street's full width.
 */
export interface CircuitSeal {
  /** Volume-local XZ of the barrier run's center. */
  x: number;
  z: number;
  /** Yaw (radians) pointing down the sealed street, away from the lap. */
  heading: number;
  /** Width of the street being closed — the run spans it plus a shoulder. */
  width: number;
  kind: CircuitSealKind;
  /** Graph node the seal stands at. */
  node: number;
}

/** One analyzed corner: where the lap turns, how hard, and which way. */
export interface CircuitCorner {
  /** `centerline` index at the apex (tightest point). */
  apex: number;
  /** Radius of curvature at the apex, meters. */
  radius: number;
  /** Total turn through the corner, radians. */
  angle: number;
  /** -1 = left-hand, 1 = right-hand. */
  direction: -1 | 1;
  /** `centerline` index where the corner starts. */
  entry: number;
  /** `centerline` index where it ends. */
  exit: number;
}

/** One checkpoint trigger volume, shaped to hand straight to `raceTrack({ checkpoints })`. */
export interface CircuitGate {
  id: string;
  center: readonly [number, number, number];
  half: readonly [number, number, number];
}

/** The start/finish line: where it is, which way cars face, and the painted line across the road. */
export interface CircuitStart {
  x: number;
  z: number;
  /** Yaw cars face on the grid (direction of travel). */
  heading: number;
  /** The two road-edge ends of the painted line. */
  line: readonly [StreetVec2, StreetVec2];
  /** Arc-length position of the line along the lap, meters. */
  distance: number;
  /** Road width at the line. */
  width: number;
}

/** One grid slot: a staggered spawn behind the start line. */
export interface CircuitGridSlot {
  x: number;
  z: number;
  /** Yaw facing down the start straight. */
  heading: number;
}

/** One kerb strip on the outside or inside of a corner, as an offset polyline to stripe. */
export interface CircuitKerb {
  /** Polyline along the road edge the kerb hugs. */
  points: StreetVec2[];
  /** Strip width across, meters. */
  width: number;
  /** Which side of travel the strip sits on: -1 left, 1 right. */
  side: -1 | 1;
  /** Alternating stripe length along the run, meters. */
  stripe: number;
  /** Corner this kerb belongs to (index into {@link CircuitRoute.corners}). */
  corner: number;
}

/** A closed race lap lifted out of a street network, with everything a race needs hung off it. */
export interface CircuitRoute {
  /** Closed lap centerline in volume-local XZ. Implicitly closed: the last point joins the first. */
  centerline: StreetVec2[];
  /** Road width at each centerline point, inherited from the streets the lap follows. */
  widths: number[];
  /** Road-surface height per point, present only when the network carries elevation. */
  heights?: number[];
  /** Lap length, meters. */
  length: number;
  /** Graph edge ids the lap runs on — style exactly these streets as track surface. */
  edges: number[];
  /** Graph node ids the lap visits in order (no repeat of the closing node). */
  nodes: number[];
  /** Every street leaving the lap that is not part of it, closed off. */
  seals: CircuitSeal[];
  corners: CircuitCorner[];
  /** Ordered gates, finish line last — ready for `raceTrack({ checkpoints, laps })`. */
  checkpoints: CircuitGate[];
  laps: number;
  start: CircuitStart;
  grid: CircuitGridSlot[];
  /** Arc-length fractions (0..1) where each timing sector begins; `sectors[0]` is always 0. */
  sectors: number[];
  /** Share of lap length running on avenue-or-wider streets, 0..1. */
  arterialShare: number;
}

interface Adjacency {
  /** node id → incident edges. */
  links: Map<number, { edge: number; other: number }[]>;
  edgeById: Map<number, StreetEdge>;
  nodeAt: Map<number, { x: number; z: number }>;
}

function edgeLength(points: readonly StreetVec2[]): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

function buildAdjacency(network: StreetNetwork): Adjacency {
  const links = new Map<number, { edge: number; other: number }[]>();
  const edgeById = new Map<number, StreetEdge>();
  const nodeAt = new Map<number, { x: number; z: number }>();
  for (const node of network.nodes) nodeAt.set(node.id, { x: node.x, z: node.z });
  for (const edge of network.edges) {
    if (edge.a === edge.b) continue;
    edgeById.set(edge.id, edge);
    const forward = links.get(edge.a) ?? [];
    forward.push({ edge: edge.id, other: edge.b });
    links.set(edge.a, forward);
    const back = links.get(edge.b) ?? [];
    back.push({ edge: edge.id, other: edge.a });
    links.set(edge.b, back);
  }
  return { links, edgeById, nodeAt };
}

/** Direction (radians) leaving `node` along `edge`, read off the edge's first sampled span. */
function departureHeading(edge: StreetEdge, node: number): number {
  const points = edge.points;
  if (points.length < 2) return 0;
  const forward = edge.a === node;
  const from = forward ? points[0]! : points[points.length - 1]!;
  const to = forward ? points[1]! : points[points.length - 2]!;
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}

function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Chain the lap's edges into one continuous centerline, carrying per-point width and height. Each
 * edge is walked in its traversal direction and its shared endpoint dropped, so the polyline closes
 * without a duplicated seam vertex.
 */
function assembleCenterline(
  nodes: readonly number[],
  edges: readonly number[],
  adjacency: Adjacency,
): { centerline: StreetVec2[]; widths: number[]; heights: number[] | null } {
  const centerline: StreetVec2[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  let anyHeights = false;
  for (let i = 0; i < edges.length; i += 1) {
    const edge = adjacency.edgeById.get(edges[i]!);
    if (edge === undefined) continue;
    const from = nodes[i]!;
    const forward = edge.a === from;
    const points = forward ? edge.points : [...edge.points].reverse();
    const edgeHeights =
      edge.heights === undefined ? null : forward ? edge.heights : [...edge.heights].reverse();
    if (edgeHeights !== null) anyHeights = true;
    // Drop the shared endpoint so consecutive edges weld into one polyline.
    for (let p = 0; p + 1 < points.length; p += 1) {
      centerline.push(points[p]!);
      widths.push(edge.width);
      heights.push(edgeHeights?.[p] ?? 0);
    }
  }
  return { centerline, widths, heights: anyHeights ? heights : null };
}

/**
 * Resample a closed lap to a fixed arc-length step, interpolating width and height. City street
 * polylines are emitted at whatever resolution the road ribbon needed (often 15 m between vertices);
 * a racing surface, corner analysis, and kerbs all need a dense, evenly spaced line.
 */
function resampleClosed(
  points: readonly StreetVec2[],
  widths: readonly number[],
  heights: readonly number[] | null,
  step: number,
): { points: StreetVec2[]; widths: number[]; heights: number[] | null } {
  const total = polylineLength(points, true);
  const count = Math.max(12, Math.min(4000, Math.round(total / step)));
  const spacing = total / count;
  const out: StreetVec2[] = [];
  const outWidths: number[] = [];
  const outHeights: number[] | null = heights === null ? null : [];
  let segment = 0;
  let consumed = 0;
  let segmentLength = (() => {
    const a = points[0]!;
    const b = points[1 % points.length]!;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  })();
  for (let i = 0; i < count; i += 1) {
    let remaining = i * spacing - consumed;
    while (remaining > segmentLength && segment + 1 < points.length) {
      consumed += segmentLength;
      remaining -= segmentLength;
      segment += 1;
      const a = points[segment]!;
      const b = points[(segment + 1) % points.length]!;
      segmentLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const a = points[segment]!;
    const b = points[(segment + 1) % points.length]!;
    const t = segmentLength < 1e-9 ? 0 : Math.max(0, Math.min(1, remaining / segmentLength));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    const wa = widths[segment] ?? 9;
    const wb = widths[(segment + 1) % widths.length] ?? wa;
    outWidths.push(wa + (wb - wa) * t);
    if (outHeights !== null && heights !== null) {
      const ha = heights[segment] ?? 0;
      const hb = heights[(segment + 1) % heights.length] ?? ha;
      outHeights.push(ha + (hb - ha) * t);
    }
  }
  return { points: out, widths: outWidths, heights: outHeights };
}

/**
 * Round the lap's junction corners into a drivable racing line. A city lap turning from one street
 * onto another inherits the junction's hard ~90° kink; a real street circuit takes that corner on a
 * curve. Relax every point tighter than `minRadius` toward its neighbours, but cap how far any point
 * may leave the street centerline so the line never drives off the asphalt it inherited.
 */
function roundCorners(
  points: readonly StreetVec2[],
  widths: readonly number[],
  minRadius: number,
  cut: number,
): StreetVec2[] {
  const n = points.length;
  if (n < 8 || cut <= 0) return [...points];
  const origin = points.map((point) => [point[0], point[1]] as [number, number]);
  const working = origin.map((point) => [point[0], point[1]] as [number, number]);
  const budget = widths.map((width) => Math.max(0, width * 0.5 * cut));
  const span = Math.max(minRadius * 0.5, polylineLength(points, true) / n * 3);
  for (let pass = 0; pass < 24; pass += 1) {
    const radii = curvatureProfile(working, span);
    let moved = 0;
    for (let i = 0; i < n; i += 1) {
      if (radii[i]! >= minRadius) continue;
      const prev = working[(i - 1 + n) % n]!;
      const next = working[(i + 1) % n]!;
      const targetX = (prev[0] + next[0]) * 0.5;
      const targetZ = (prev[1] + next[1]) * 0.5;
      const here = working[i]!;
      let x = here[0] + (targetX - here[0]) * 0.5;
      let z = here[1] + (targetZ - here[1]) * 0.5;
      // Clamp back inside the road: the racing line may cut a corner, never leave the street.
      const base = origin[i]!;
      const driftX = x - base[0];
      const driftZ = z - base[1];
      const drift = Math.hypot(driftX, driftZ);
      const limit = budget[i]!;
      if (drift > limit && drift > 1e-9) {
        x = base[0] + (driftX / drift) * limit;
        z = base[1] + (driftZ / drift) * limit;
      }
      moved += Math.hypot(x - here[0], z - here[1]);
      here[0] = x;
      here[1] = z;
    }
    if (moved < 0.01) break;
  }
  return working.map((point) => [point[0], point[1]] as StreetVec2);
}

function polylineLength(points: readonly StreetVec2[], closed: boolean): number {
  let total = 0;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** Radius of the circle through three points; Infinity when they are collinear. */
function circumRadius(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const cbx = b[0] - c[0];
  const cbz = b[1] - c[1];
  const cross = abx * cbz - abz * cbx;
  if (Math.abs(cross) < 1e-9) return Infinity;
  const ab = Math.hypot(abx, abz);
  const bc = Math.hypot(cbx, cbz);
  const ca = Math.hypot(c[0] - a[0], c[1] - a[1]);
  return (ab * bc * ca) / (2 * Math.abs(cross));
}

/** Per-point radius of curvature over a closed polyline, measured across a ~`span` meter chord. */
function curvatureProfile(points: readonly StreetVec2[], span: number): number[] {
  const n = points.length;
  const radii = new Array<number>(n).fill(Infinity);
  if (n < 5) return radii;
  const perPoint = polylineLength(points, true) / n;
  const step = Math.max(1, Math.round(span / Math.max(0.5, perPoint)));
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - step + n * 2) % n]!;
    const here = points[i]!;
    const next = points[(i + step) % n]!;
    radii[i] = circumRadius(prev, here, next);
  }
  return radii;
}

/**
 * Group the sub-threshold stretches of a curvature profile into discrete corners. The profile is
 * smoothed and short stretches dropped first: raw per-sample curvature on a dense line flickers
 * across any threshold, which would otherwise report one sweeper as a dozen "corners".
 */
function analyzeCorners(
  points: readonly StreetVec2[],
  radii: readonly number[],
  threshold: number,
  minArc: number,
  spacing: number,
): CircuitCorner[] {
  const n = points.length;
  const corners: CircuitCorner[] = [];
  if (n < 8) return corners;
  const smoothed = radii.map((_, i) => {
    let sum = 0;
    for (let k = -2; k <= 2; k += 1) sum += radii[(i + k + n * 3) % n]!;
    return sum / 5;
  });
  const tight = smoothed.map((r) => r < threshold);
  // Bridge tiny straights so one flowing corner is not split by a sample of relief.
  const bridge = Math.max(1, Math.round(minArc / Math.max(0.5, spacing) / 2));
  for (let i = 0; i < n; i += 1) {
    if (tight[i]) continue;
    let gap = 0;
    while (gap < bridge && !tight[(i + gap) % n]) gap += 1;
    if (gap < bridge && tight[(i - 1 + n) % n] && tight[(i + gap) % n]) {
      for (let k = 0; k < gap; k += 1) tight[(i + k) % n] = true;
    }
  }
  const minSpan = Math.max(3, Math.round(minArc / Math.max(0.5, spacing)));
  // Rotate the scan so it never starts mid-corner, otherwise one corner splits across the seam.
  let origin = tight.findIndex((value) => !value);
  if (origin < 0) origin = 0;
  let index = 0;
  while (index < n) {
    const at = (origin + index) % n;
    if (!tight[at]) {
      index += 1;
      continue;
    }
    let span = 0;
    let apex = at;
    let best = smoothed[at]!;
    while (span < n && tight[(origin + index + span) % n]) {
      const cursor = (origin + index + span) % n;
      if (smoothed[cursor]! < best) {
        best = smoothed[cursor]!;
        apex = cursor;
      }
      span += 1;
    }
    if (span < minSpan) {
      index += span;
      continue;
    }
    const entry = at;
    const exit = (origin + index + span - 1) % n;
    const before = points[(entry - 1 + n) % n]!;
    const atPoint = points[entry]!;
    const afterPoint = points[exit]!;
    const after = points[(exit + 1) % n]!;
    const headingIn = Math.atan2(atPoint[0] - before[0], atPoint[1] - before[1]);
    const headingOut = Math.atan2(after[0] - afterPoint[0], after[1] - afterPoint[1]);
    const turn = angleDelta(headingIn, headingOut);
    corners.push({
      apex,
      radius: best,
      angle: Math.abs(turn),
      direction: turn >= 0 ? 1 : -1,
      entry,
      exit,
    });
    index += span;
  }
  return corners;
}

/** Cumulative arc length at each point of a closed polyline, plus the total. */
function arcLengths(points: readonly StreetVec2[]): { at: number[]; total: number } {
  const at = new Array<number>(points.length).fill(0);
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    at[i] = total;
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return { at, total };
}

/** Index whose arc length is closest to `distance` around the lap. */
function indexAtDistance(at: readonly number[], total: number, distance: number): number {
  const target = ((distance % total) + total) % total;
  let lo = 0;
  let hi = at.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function headingAt(points: readonly StreetVec2[], index: number): number {
  const n = points.length;
  const a = points[index]!;
  const b = points[(index + 1) % n]!;
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}

/**
 * Locate the longest low-curvature run — the start/finish straight. Returns the centerline index
 * two-thirds along it, so the grid has room behind the line and the first corner room ahead.
 */
function findStartIndex(radii: readonly number[], at: readonly number[], total: number, straightRadius: number): number {
  const n = radii.length;
  let bestStart = 0;
  let bestLength = -1;
  let runStart = -1;
  // Two passes so a run wrapping the seam is measured whole.
  for (let i = 0; i < n * 2; i += 1) {
    const cursor = i % n;
    const straight = radii[cursor]! >= straightRadius;
    if (straight && runStart < 0) runStart = i;
    if (!straight && runStart >= 0) {
      const spanStart = at[runStart % n]!;
      const spanEnd = at[(i - 1) % n]!;
      const length = spanEnd >= spanStart ? spanEnd - spanStart : total - spanStart + spanEnd;
      if (length > bestLength) {
        bestLength = length;
        bestStart = runStart % n;
      }
      runStart = -1;
      if (i >= n) break;
    }
  }
  if (bestLength <= 0) return 0;
  return indexAtDistance(at, total, at[bestStart]! + bestLength * 0.66);
}

interface Candidate {
  nodes: number[];
  edges: number[];
  length: number;
  arterial: number;
}

/**
 * Randomized cycle search over the street graph. Each attempt walks node to node without revisiting,
 * biased toward arterial roads and toward carrying straight on, and closes the loop once the walk is
 * long enough to reach the target and an edge back to the start exists. Bounded attempts and bounded
 * walk length keep the work fixed however large the network.
 */
function searchCycle(adjacency: Adjacency, rules: CircuitRouteRules): Candidate | null {
  const rng = seededRng(`raceCircuit:${rules.seed}`);
  // Only nodes with two or more ways out can sit on a cycle; peel the trees off first.
  const degree = new Map<number, number>();
  for (const [node, links] of adjacency.links) degree.set(node, links.length);
  let peeled = true;
  while (peeled) {
    peeled = false;
    for (const [node, count] of degree) {
      if (count > 1 || count === 0) continue;
      degree.set(node, 0);
      for (const link of adjacency.links.get(node) ?? []) {
        const other = degree.get(link.other);
        if (other !== undefined && other > 0) degree.set(link.other, other - 1);
      }
      peeled = true;
    }
  }
  const cyclic = [...degree.entries()].filter(([, count]) => count >= 2).map(([node]) => node);
  if (cyclic.length < 3) return null;

  const arterialOf = (edge: StreetEdge): number => (LEVEL_RANK[edge.level] >= LEVEL_RANK.avenue ? 1 : 0);
  const maxSteps = Math.min(400, Math.max(24, Math.ceil((rules.lapLength / 40) * 4)));
  const attempts = 240;
  let best: Candidate | null = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const startNode = cyclic[Math.floor(rng() * cyclic.length)]!;
    const nodes: number[] = [startNode];
    const edges: number[] = [];
    const visited = new Set<number>([startNode]);
    let length = 0;
    let arterial = 0;
    let heading: number | null = null;
    let closed = false;

    for (let step = 0; step < maxSteps; step += 1) {
      const current = nodes[nodes.length - 1]!;
      const links = (adjacency.links.get(current) ?? []).filter((link) => {
        if (degree.get(link.other) === 0) return false;
        if (edges.length > 0 && link.edge === edges[edges.length - 1]) return false;
        return true;
      });
      if (links.length === 0) break;
      // Close as soon as the lap is long enough and the start is one edge away.
      if (length >= rules.lapLength * 0.7 && nodes.length >= 3) {
        const home = links.find((link) => link.other === startNode);
        if (home !== undefined) {
          const edge = adjacency.edgeById.get(home.edge)!;
          edges.push(home.edge);
          length += edgeLength(edge.points);
          arterial += arterialOf(edge) * edgeLength(edge.points);
          closed = true;
          break;
        }
      }
      const options = links.filter((link) => !visited.has(link.other));
      if (options.length === 0) break;
      let total = 0;
      const weights = options.map((link) => {
        const edge = adjacency.edgeById.get(link.edge)!;
        const rank = LEVEL_RANK[edge.level] / LEVEL_RANK.boulevard;
        let weight = 0.15 + rank * rules.arterialBias * 2.5;
        if (heading !== null) {
          // Prefer carrying straight on: a lap that zig-zags every junction drives like a maze.
          const turn = Math.abs(angleDelta(heading, departureHeading(edge, current)));
          weight *= 1.25 - (turn / Math.PI) * 0.85;
        }
        // Once long enough, pull back toward the start so the walk can actually close.
        if (length > rules.lapLength * 0.55) {
          const home = adjacency.nodeAt.get(startNode)!;
          const here = adjacency.nodeAt.get(current)!;
          const there = adjacency.nodeAt.get(link.other)!;
          const closer = Math.hypot(home.x - there.x, home.z - there.z) < Math.hypot(home.x - here.x, home.z - here.z);
          weight *= closer ? 2.4 : 0.5;
        }
        weight = Math.max(0.01, weight);
        total += weight;
        return weight;
      });
      let roll = rng() * total;
      let chosen = options.length - 1;
      for (let i = 0; i < weights.length; i += 1) {
        roll -= weights[i]!;
        if (roll <= 0) {
          chosen = i;
          break;
        }
      }
      const link = options[chosen]!;
      const edge = adjacency.edgeById.get(link.edge)!;
      const span = edgeLength(edge.points);
      nodes.push(link.other);
      edges.push(link.edge);
      visited.add(link.other);
      length += span;
      arterial += arterialOf(edge) * span;
      heading = departureHeading(edge, link.other) + Math.PI;
    }

    if (!closed || length <= 0) continue;
    const arterialShare = arterial / length;
    const lengthError = Math.abs(length - rules.lapLength) / rules.lapLength;
    const score = arterialShare * rules.arterialBias * 1.5 - lengthError * 2 + Math.min(nodes.length, 24) * 0.01;
    if (score <= bestScore) continue;
    // Reject undrivable kinks before accepting a candidate.
    const assembled = assembleCenterline(nodes, edges, adjacency);
    if (assembled.centerline.length < 8) continue;
    const radii = curvatureProfile(assembled.centerline, Math.max(6, rules.minCornerRadius));
    let tightest = Infinity;
    for (const radius of radii) if (radius < tightest) tightest = radius;
    if (tightest < rules.minCornerRadius * 0.6) continue;
    bestScore = score;
    best = { nodes, edges, length, arterial: arterialShare };
  }

  return best;
}

/** Order the generator's own `loop` edges into a traversal — the circuit-mode fast path. */
function loopCandidate(network: StreetNetwork): Candidate | null {
  const loopEdges = network.edges.filter((edge) => edge.loop && edge.a !== edge.b);
  if (loopEdges.length < 3) return null;
  const byNode = new Map<number, StreetEdge[]>();
  for (const edge of loopEdges) {
    for (const node of [edge.a, edge.b]) {
      const bucket = byNode.get(node) ?? [];
      bucket.push(edge);
      byNode.set(node, bucket);
    }
  }
  const first = loopEdges[0]!;
  const nodes: number[] = [first.a];
  const edges: number[] = [];
  const used = new Set<number>();
  let current = first.a;
  let length = 0;
  let arterial = 0;
  for (let guard = 0; guard < loopEdges.length + 2; guard += 1) {
    const next = (byNode.get(current) ?? []).find((edge) => !used.has(edge.id));
    if (next === undefined) break;
    used.add(next.id);
    const other = next.a === current ? next.b : next.a;
    const span = edgeLength(next.points);
    edges.push(next.id);
    length += span;
    if (LEVEL_RANK[next.level] >= LEVEL_RANK.avenue) arterial += span;
    if (other === nodes[0]) break;
    nodes.push(other);
    current = other;
  }
  if (edges.length !== nodes.length || edges.length < 3) return null;
  return { nodes, edges, length, arterial: length > 0 ? arterial / length : 0 };
}

/** Barriers on every street that leaves the lap and is not part of it. */
function buildSeals(
  nodes: readonly number[],
  edges: readonly number[],
  adjacency: Adjacency,
  kind: CircuitSealKind,
): CircuitSeal[] {
  const onRoute = new Set(edges);
  const seals: CircuitSeal[] = [];
  // The widest lap road meeting each node sets how far back a barrier must stand.
  const lapHalfWidth = new Map<number, number>();
  for (const id of edges) {
    const edge = adjacency.edgeById.get(id);
    if (edge === undefined) continue;
    for (const node of [edge.a, edge.b]) {
      lapHalfWidth.set(node, Math.max(lapHalfWidth.get(node) ?? 0, edge.width * 0.5));
    }
  }
  for (const node of nodes) {
    const at = adjacency.nodeAt.get(node);
    if (at === undefined) continue;
    for (const link of adjacency.links.get(node) ?? []) {
      if (onRoute.has(link.edge)) continue;
      const edge = adjacency.edgeById.get(link.edge);
      if (edge === undefined) continue;
      const heading = departureHeading(edge, node);
      // Stand the barrier past the junction mouth so it never overlaps the racing surface.
      const offset = (lapHalfWidth.get(node) ?? edge.width * 0.5) + edge.width * 0.5 + 4;
      seals.push({
        x: at.x + Math.sin(heading) * offset,
        z: at.z + Math.cos(heading) * offset,
        heading,
        width: edge.width,
        kind,
        node,
      });
    }
  }
  return seals;
}

/** Kerb strips on the outside and inside of every real corner. */
export interface CircuitKerbOptions {
  /** Strip width across, meters. Defaults to 1.1. */
  width?: number;
  /** Alternating stripe length along the run, meters. Defaults to 2.2. */
  stripe?: number;
  /** Only kerb corners at or below this radius (m). Defaults to 6× the route's tightest corner. */
  maxRadius?: number;
}

/**
 * Red/white kerb strips hugging both road edges through each corner. Returns the polylines and
 * stripe pitch as data; the renderer owns the mesh and the colors.
 */
export function circuitKerbs(route: CircuitRoute, options: CircuitKerbOptions = {}): CircuitKerb[] {
  const width = options.width ?? 1.1;
  const stripe = options.stripe ?? 2.2;
  const maxRadius = options.maxRadius ?? Infinity;
  const points = route.centerline;
  const n = points.length;
  const kerbs: CircuitKerb[] = [];
  route.corners.forEach((corner, index) => {
    if (corner.radius > maxRadius) return;
    const span: number[] = [];
    let cursor = corner.entry;
    for (let guard = 0; guard < n; guard += 1) {
      span.push(cursor);
      if (cursor === corner.exit) break;
      cursor = (cursor + 1) % n;
    }
    if (span.length < 3) return;
    for (const side of [-1, 1] as const) {
      const run: StreetVec2[] = [];
      for (const at of span) {
        const here = points[at]!;
        const next = points[(at + 1) % n]!;
        const dx = next[0] - here[0];
        const dz = next[1] - here[1];
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        const half = (route.widths[at] ?? 8) * 0.5;
        // Perpendicular in the XZ plane; kerb sits just outside the painted edge.
        run.push([here[0] + (dz / len) * half * side, here[1] - (dx / len) * half * side]);
      }
      if (run.length >= 2) kerbs.push({ points: run, width, side, stripe, corner: index });
    }
  });
  return kerbs;
}

/**
 * Lift a closed, sealed-off race lap out of an existing street network. Returns `null` when the
 * network has no drivable cycle (a pure tree of dead-end streets), so callers can fall back or warn
 * rather than render a broken race.
 *
 * On a `circuit`-mode network the generated loop is used directly. On a `net` (a city) the graph is
 * searched for the cycle closest to `lapLength` that respects `arterialBias` and `minCornerRadius`.
 */
export function extractCircuitRoute(
  network: StreetNetwork,
  rules: Partial<CircuitRouteRules> = {},
): CircuitRoute | null {
  const resolved: CircuitRouteRules = {
    ...CIRCUIT_ROUTE_DEFAULTS,
    ...rules,
    lapLength: Math.max(80, rules.lapLength ?? CIRCUIT_ROUTE_DEFAULTS.lapLength),
    arterialBias: Math.max(0, Math.min(1, rules.arterialBias ?? CIRCUIT_ROUTE_DEFAULTS.arterialBias)),
    minCornerRadius: Math.max(3, rules.minCornerRadius ?? CIRCUIT_ROUTE_DEFAULTS.minCornerRadius),
    checkpoints: Math.max(2, Math.floor(rules.checkpoints ?? CIRCUIT_ROUTE_DEFAULTS.checkpoints)),
    laps: Math.max(1, Math.floor(rules.laps ?? CIRCUIT_ROUTE_DEFAULTS.laps)),
    gridSlots: Math.max(0, Math.floor(rules.gridSlots ?? CIRCUIT_ROUTE_DEFAULTS.gridSlots)),
    sectors: Math.max(1, Math.floor(rules.sectors ?? CIRCUIT_ROUTE_DEFAULTS.sectors)),
    sampleStep: Math.max(0.5, rules.sampleStep ?? CIRCUIT_ROUTE_DEFAULTS.sampleStep),
    cornerCut: Math.max(0, Math.min(0.9, rules.cornerCut ?? CIRCUIT_ROUTE_DEFAULTS.cornerCut)),
  };
  const adjacency = buildAdjacency(network);
  const candidate =
    network.mode === "circuit"
      ? loopCandidate(network) ?? searchCycle(adjacency, resolved)
      : searchCycle(adjacency, resolved) ?? loopCandidate(network);
  if (candidate === null) return null;

  const assembled = assembleCenterline(candidate.nodes, candidate.edges, adjacency);
  if (assembled.centerline.length < 4) return null;
  // Resample to a racing-surface resolution, then round the junction kinks the city streets carry
  // into a line a car can actually take — still the same asphalt, just driven properly.
  const dense = resampleClosed(assembled.centerline, assembled.widths, assembled.heights, resolved.sampleStep);
  const centerline = roundCorners(dense.points, dense.widths, resolved.minCornerRadius, resolved.cornerCut);
  const widths = dense.widths;
  const heights = dense.heights;
  if (centerline.length < 8) return null;
  const { at, total } = arcLengths(centerline);
  const radii = curvatureProfile(centerline, Math.max(6, resolved.minCornerRadius));
  const cornerThreshold = Math.max(resolved.minCornerRadius * 4, 40);
  const spacing = total / centerline.length;
  const corners = analyzeCorners(centerline, radii, cornerThreshold, Math.max(8, resolved.minCornerRadius), spacing);
  const straightRadius = Math.max(cornerThreshold * 3, 200);

  const startIndex = findStartIndex(radii, at, total, straightRadius);
  const startPoint = centerline[startIndex]!;
  const startHeading = headingAt(centerline, startIndex);
  const startWidth = widths[startIndex] ?? 10;
  const across = startHeading + Math.PI / 2;
  const start: CircuitStart = {
    x: startPoint[0],
    z: startPoint[1],
    heading: startHeading,
    line: [
      [startPoint[0] + Math.sin(across) * startWidth * 0.5, startPoint[1] + Math.cos(across) * startWidth * 0.5],
      [startPoint[0] - Math.sin(across) * startWidth * 0.5, startPoint[1] - Math.cos(across) * startWidth * 0.5],
    ],
    distance: at[startIndex]!,
    width: startWidth,
  };

  const grid: CircuitGridSlot[] = [];
  for (let slot = 0; slot < resolved.gridSlots; slot += 1) {
    const row = Math.floor(slot / 2);
    const column = slot % 2 === 0 ? -1 : 1;
    const back = 8 + row * 9;
    const index = indexAtDistance(at, total, at[startIndex]! - back);
    const point = centerline[index]!;
    const heading = headingAt(centerline, index);
    const lateral = heading + Math.PI / 2;
    const offset = (widths[index] ?? startWidth) * 0.22 * column;
    grid.push({
      x: point[0] + Math.sin(lateral) * offset,
      z: point[1] + Math.cos(lateral) * offset,
      heading,
    });
  }

  // Gates are evenly spaced around the lap with the finish line LAST, so `raceTrack` treats the
  // start/finish crossing as the lap boundary.
  const checkpoints: CircuitGate[] = [];
  const gateSpacing = total / resolved.checkpoints;
  for (let gate = 1; gate <= resolved.checkpoints; gate += 1) {
    const index = indexAtDistance(at, total, at[startIndex]! + gateSpacing * gate);
    const point = centerline[index]!;
    const height = heights?.[index] ?? 0;
    const halfWidth = (widths[index] ?? startWidth) * 0.5 + 1.5;
    checkpoints.push({
      id: gate === resolved.checkpoints ? "finish" : `cp${gate}`,
      center: [point[0], height + resolved.gateHeight * 0.5, point[1]],
      half: [halfWidth, resolved.gateHeight * 0.5, 2.5],
    });
  }

  const sectors: number[] = [];
  for (let sector = 0; sector < resolved.sectors; sector += 1) sectors.push(sector / resolved.sectors);

  return {
    centerline,
    widths,
    ...(heights === null ? {} : { heights }),
    length: total,
    edges: candidate.edges,
    nodes: candidate.nodes,
    seals: buildSeals(candidate.nodes, candidate.edges, adjacency, resolved.sealKind),
    corners,
    checkpoints,
    laps: resolved.laps,
    start,
    grid,
    sectors,
    arterialShare: candidate.arterial,
  };
}
