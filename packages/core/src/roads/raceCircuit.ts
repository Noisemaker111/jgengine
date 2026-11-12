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
 * Works on either topology family the generator produces. On a `net` (a city) the lap search
 * (`raceLapSearch`) routes candidates along through-streets and boulevards, scores them like a track
 * designer (long straights into heavy braking, corner variety, flow, no trombones), and shapes the
 * winner into a racing line that uses the junction plazas. Callers can pin `via` anchors the lap
 * passes in order, a `start` hint, or ask for a point-to-point `sprint`
 * ({@link CircuitRouteConstraints}); {@link extractStreetRaces} lifts several named races out of one
 * city. On a `circuit` (the generator's closed-loop mode) the generator's DESIGNED lap
 * ({@link CircuitDesign}) is the route, with its corner types, banking, elevation, pit lane (part of
 * the event, never sealed), run-off, walls, grandstands and figure-8 crossings carried through.
 *
 * Volume-local XZ coords throughout, matching {@link StreetNetwork}; the caller rotates/translates
 * into world space. Deterministic: same network + rules ⇒ identical route, with bounded search work.
 *
 * @capability race-circuit lift a closed, sealed-off race lap out of an existing city street network
 * @capability street-races several named street laps and point-to-point sprints through a city, pinned to via junctions
 */
import { defineGenerator, type GeneratorContext } from "../generator/generator";
import { defineParamSchema, type ParamField, type ParamsOf } from "../generator/paramSchema";
import {
  METRIC_CHORD,
  OVERTAKE_STRAIGHT,
  SLOW_CORNER_RADIUS,
  angleDelta,
  arcProfile,
  buildLapGraph,
  chicaneGates,
  cornerTurn,
  edgeLength,
  lapCandidates,
  lapScore,
  outlineOf,
  planar,
  quantizedScore,
  radiusProfile,
  resolveAnchor,
  shapeRacingLine,
  simulateLap,
  straightRuns,
  summarizeOutline,
  type LapAnchor,
  type LapCornerSummary,
  type LapGraph,
  type LapOutline,
  type LapScoreRules,
  type LapSummary,
  type PlannedChicane,
} from "./raceLapSearch";
import {
  CIRCUIT_LAP_LENGTH_FIELD,
  SAMPLE_ROUND,
  type CircuitCornerKind,
  type CircuitCrossing,
  type CircuitDesign,
  type CircuitDesignBrake,
  type CircuitGrandstand,
  type CircuitPitLane,
  type CircuitRunoff,
  type CircuitWall,
} from "./circuitDesigner";
import { GRID_FRONT_GAP, GRID_ROW_PITCH, gridLength, lapTimeProfile, startLineOffset, timedSectors } from "./circuitDressing";
import {
  STREET_NETWORK_DIAL_FIELDS,
  STREET_NETWORK_GENERATOR,
  STREET_NETWORK_SCHEMA,
  type StreetEdge,
  type StreetLevel,
  type StreetNetwork,
  type StreetNetworkInput,
  type StreetVec2,
} from "./streetGenerator";

/** Road hierarchy rank — higher is wider/more arterial. Shared with the fabric's ordering. */
const LEVEL_RANK: Record<StreetLevel, number> = { lane: 0, street: 1, avenue: 2, boulevard: 3 };

/**
 * Worst self-approach of a closed lap, as `gap − required` over every non-adjacent pair of points;
 * negative means two stretches of the lap are close enough that their road surfaces overlap. The
 * generator holds the same invariant for its own circuits — an extracted lap needs it too, or a
 * junction fold hands back a "lap" that drives through itself.
 */
function selfClearance(points: readonly StreetVec2[], widths: readonly number[], closed = true): number {
  const n = points.length;
  const { at, total } = arcProfile(points, closed);
  let worst = Infinity;
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    for (let j = i + 1; j < n; j += 1) {
      const required = ((widths[i] ?? 9) + (widths[j] ?? 9)) * 0.5 * 1.15;
      // Adjacency is measured along the lap, not in indices: two points a whole corner apart may
      // still be one short edge apart by index, and that pair is not an overlap.
      const along = at[j]! - at[i]!;
      if ((closed ? Math.min(along, total - along) : along) < required * 2.5) continue;
      const b = points[j]!;
      const gap = planar(a[0] - b[0], a[1] - b[1]) - required;
      if (gap < worst) worst = gap;
    }
  }
  return worst;
}

/** How a sealed-off side street is closed: hard barriers, a cone line, or temporary fencing. */
export type CircuitSealKind = "barrier" | "cones" | "fence";

/**
 * The lap dials the route search answers to (defaults: a ~2.4 km arterial street lap with 12 gates,
 * 3 laps and barriered side streets).
 * - `lapLength` — target lap (or sprint) length (m); length error is the heaviest term of the lap score
 *   (a designed closed circuit is built to it).
 * - `arterialBias` — 0 races any street; 1 routes and scores the lap toward avenues and boulevards.
 * - `minCornerRadius` — radius (m) a turn must be tighter than (×4, at least 40 m) to count as a
 *   corner, and on a `circuit` loop the radius the corner-rounding pass works toward. The achieved
 *   figure is reported back as {@link CircuitRoute.tightestRadius}.
 * - `checkpoints` / `laps` — ordered gates around the lap, and laps the race runs.
 * - `gateHeight` — height (m) of a checkpoint gate volume.
 * - `gridSlots` — starting grid slots behind the line (0 = no grid).
 * - `sealKind` — how the side streets leaving the lap are closed off.
 * - `sectors` — timing sectors the lap splits into: on a lap each takes about an equal share of the
 *   simulated lap time and breaks just past a significant corner.
 * - `sampleStep` — arc-length spacing (m) the lap is resampled to: city streets are sampled for a road
 *   ribbon, far too coarsely for a racing surface, corner analysis or kerbs.
 * - `cornerCut` — how far the racing line may stray from the NEAREST street centerline, as a fraction
 *   of the local half-width: it straightens wobbly streets into straights and, through a junction,
 *   uses the plaza where two carriageways overlap. 0 keeps the street centerline and its hard kinks.
 * - `chicanes` — drop barrier chicanes on the lap's secondary straights (the main straight stays clean
 *   for the overtake); off, every straight runs flat out.
 */
const CIRCUIT_ROUTE_FIELDS = [
  { ...CIRCUIT_LAP_LENGTH_FIELD, group: "race" },
  { type: "range", key: "arterialBias", label: "arterial bias", group: "race", min: 0, max: 1, step: 0.01, default: 0.7 },
  { type: "range", key: "minCornerRadius", label: "corner radius", group: "race", min: 3, max: 60, step: 0.5, default: 9, unit: "m" },
  { type: "range", key: "checkpoints", label: "checkpoints", group: "race", min: 2, max: 64, step: 1, default: 12 },
  { type: "range", key: "laps", label: "laps", group: "race", min: 1, max: 20, step: 1, default: 3 },
  { type: "range", key: "gateHeight", label: "gate height", group: "race", min: 1, max: 20, step: 0.5, default: 6, unit: "m" },
  { type: "range", key: "gridSlots", label: "grid slots", group: "race", min: 0, max: 40, step: 1, default: 12 },
  { type: "select", key: "sealKind", label: "side-street seals", group: "race", default: "barrier", options: [{ value: "barrier" }, { value: "cones" }, { value: "fence" }] },
  { type: "range", key: "sectors", label: "timing sectors", group: "race", min: 1, max: 8, step: 1, default: 3 },
  { type: "range", key: "sampleStep", label: "sample step", group: "race", min: 0.5, max: 10, step: 0.5, default: 2.5, unit: "m", vary: false },
  { type: "range", key: "cornerCut", label: "corner cut", group: "race", min: 0, max: 0.9, step: 0.01, default: 0.42 },
  { type: "bool", key: "chicanes", label: "barrier chicanes", group: "race", default: true },
] as const satisfies readonly ParamField[];

/**
 * The lap stage's own params, for a generator that lifts a lap out of streets it already grew (the
 * `city` kind parses its race dials through this).
 */
export const CIRCUIT_ROUTE_SCHEMA = defineParamSchema({ fields: CIRCUIT_ROUTE_FIELDS });

/** Parsed lap params. */
export type CircuitRouteParams = ParamsOf<typeof CIRCUIT_ROUTE_SCHEMA>;

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

/**
 * One barrier run dropped onto the racing surface for the event (a chicane apex): a line of blocks
 * across the road, perpendicular to `heading`, spanning `width` from one road edge.
 */
export interface CircuitBarrier {
  x: number;
  z: number;
  /** Yaw of travel down the road at the barrier; the run stands across it. */
  heading: number;
  /** Length of the run across the road, meters. */
  width: number;
  kind: CircuitSealKind;
}

/**
 * A barrier chicane on a long straight: two runs from opposite road edges a few car lengths apart,
 * forcing a flick across the road. Event-scoped like the seals — only stood up while the race runs.
 */
export interface CircuitChicane {
  /** `centerline` index nearest the first barrier, and the second. */
  entry: number;
  exit: number;
  barriers: readonly [CircuitBarrier, CircuitBarrier];
}

/** A closed lap, or a point-to-point sprint from one end of the city to another. */
export type StreetRaceKind = "lap" | "sprint";

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
  /** The corner's type in the corner grammar — present on a designed closed circuit. */
  kind?: CircuitCornerKind;
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

/**
 * A race lifted out of a street network, with everything a race needs hung off it: a closed lap, or
 * (when {@link CircuitRoute.closed} is false) a point-to-point sprint.
 *
 * Seals and chicane barriers are EVENT-SCOPED data: a renderer stands them up only while the race
 * runs (see `raceEvents`), so the city drives as an open world the rest of the time.
 */
export interface CircuitRoute {
  /** `true` for a lap; `false` for a sprint, whose centerline runs start area → finish. */
  closed: boolean;
  /**
   * The driven line in volume-local XZ: the street centerlines the race runs on, shaped into a racing
   * line inside the asphalt. A lap is implicitly closed (the last point joins the first).
   */
  centerline: StreetVec2[];
  /** Road width at each centerline point, inherited from the streets the lap follows. */
  widths: number[];
  /** Road-surface height per point, present only when the network carries elevation. */
  heights?: number[];
  /** Lap length, meters. */
  length: number;
  /** Graph edge ids the lap runs on — style exactly these streets as track surface. */
  edges: number[];
  /** Graph node ids the lap visits in order (no repeat of the closing node; a sprint lists both ends). */
  nodes: number[];
  /** Every street leaving the lap that is not part of it, closed off. */
  seals: CircuitSeal[];
  /** Barrier chicanes on the secondary straights. */
  chicanes: CircuitChicane[];
  corners: CircuitCorner[];
  /** Ordered gates, finish line last — ready for `raceTrack({ checkpoints, laps })`. */
  checkpoints: CircuitGate[];
  /** Laps the race runs; always 1 for a sprint. */
  laps: number;
  start: CircuitStart;
  grid: CircuitGridSlot[];
  /** Arc-length fractions (0..1) where each timing sector begins; `sectors[0]` is always 0. */
  sectors: number[];
  /** Share of lap length running on avenue-or-wider streets, 0..1. */
  arterialShare: number;
  /**
   * Tightest radius (m) the finished racing line actually holds. `minCornerRadius` is a TARGET the
   * rounding pass works toward, not a guarantee: rounding may not pull the line outside the street it
   * inherited, so a 90° junction on a narrow road stays tighter than any target can ask for. Read
   * this to report what the lap really is — widen `streetWidth` to buy a smoother one.
   */
  tightestRadius: number;
  /** Road roll per point, radians (positive raises the right edge) — designed circuits only. */
  banking?: number[];
  /** Simulated lap time (s) and braking zones (arc lengths from index 0) — designed circuits only. */
  lapTime?: number;
  brakingZones?: CircuitDesignBrake[];
  /** Pit lane joined to the lap at two junctions, with garages — designed circuits only. */
  pit?: CircuitPitLane;
  /** Run-off areas, permanent wall runs and grandstand spots — designed circuits only. */
  runoff?: CircuitRunoff[];
  walls?: CircuitWall[];
  grandstands?: CircuitGrandstand[];
  /** Grade-separated crossings of a figure-8 — designed circuits only. */
  crossings?: CircuitCrossing[];
}

interface Adjacency {
  /** node id → incident edges. */
  links: Map<number, { edge: number; other: number }[]>;
  edgeById: Map<number, StreetEdge>;
  nodeAt: Map<number, { x: number; z: number }>;
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
 * Resample a lap (or, `closed` false, a sprint) to a fixed arc-length step, interpolating width and
 * height. City street polylines are emitted at whatever resolution the road ribbon needed (often 15 m
 * between vertices); a racing surface, corner analysis, and kerbs all need a dense, evenly spaced line.
 */
function resampleLine(
  points: readonly StreetVec2[],
  widths: readonly number[],
  heights: readonly number[] | null,
  step: number,
  closed = true,
): { points: StreetVec2[]; widths: number[]; heights: number[] | null } {
  const n = points.length;
  const segments = closed ? n : n - 1;
  // Cumulative arc length at the START of each segment, so a lap's wrap-around segment from the last
  // vertex back to the first is sampled like any other.
  const starts = new Array<number>(segments + 1).fill(0);
  for (let i = 0; i < segments; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    starts[i + 1] = starts[i]! + planar(b[0] - a[0], b[1] - a[1]);
  }
  const total = starts[segments]!;
  if (total < 1e-6) return { points: [...points], widths: [...widths], heights: heights === null ? null : [...heights] };
  const intervals = Math.max(12, Math.min(4000, Math.round(total / step)));
  // A sprint keeps both ends: one more sample than intervals.
  const count = closed ? intervals : intervals + 1;
  const spacing = total / intervals;
  const out: StreetVec2[] = [];
  const outWidths: number[] = [];
  const outHeights: number[] | null = heights === null ? null : [];
  let segment = 0;
  for (let i = 0; i < count; i += 1) {
    const distance = i * spacing;
    while (segment + 1 < segments && starts[segment + 1]! <= distance) segment += 1;
    const spanStart = starts[segment]!;
    const spanLength = starts[segment + 1]! - spanStart;
    const t = spanLength < 1e-9 ? 0 : Math.max(0, Math.min(1, (distance - spanStart) / spanLength));
    const a = points[segment]!;
    const b = points[(segment + 1) % n]!;
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
    const radii = radiusProfile(working, span, true);
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
      const drift = planar(driftX, driftZ);
      const limit = budget[i]!;
      if (drift > limit && drift > 1e-9) {
        x = base[0] + (driftX / drift) * limit;
        z = base[1] + (driftZ / drift) * limit;
      }
      moved += planar(x - here[0], z - here[1]);
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
    total += planar(b[0] - a[0], b[1] - a[1]);
  }
  return total;
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
  // Average CURVATURE, not radius: one near-straight sample (an S-bend's inflection, a collinear
  // triple) has a huge radius that would otherwise swamp a real corner beside it.
  const smoothed = radii.map((_, i) => {
    let sum = 0;
    for (let k = -2; k <= 2; k += 1) sum += 1 / radii[(i + k + n * 3) % n]!;
    return sum > 0 ? 5 / sum : Infinity;
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

/** Index whose arc length is closest to `distance` around the lap (clamped to the ends of a sprint). */
function indexAtDistance(at: readonly number[], total: number, distance: number, closed = true): number {
  const target = closed ? ((distance % total) + total) % total : Math.max(0, Math.min(total, distance));
  let lo = 0;
  let hi = at.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function headingAt(points: readonly StreetVec2[], index: number, closed = true): number {
  const n = points.length;
  const from = !closed && index === n - 1 ? index - 1 : index;
  const a = points[from]!;
  const b = points[closed ? (from + 1) % n : from + 1]!;
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

/** Radius (m, at {@link METRIC_CHORD}) the whole grid must sit straighter than. */
const GRID_STRAIGHT_RADIUS = 150;

/**
 * Start/finish placement that keeps the whole grid on a straight: among the straight runs long enough
 * to hold `gridLength` behind the line (plus room before the first corner), take the point nearest the
 * `preferred` arc distance, or two-thirds along the longest run. Null when no straight holds the grid.
 */
function placeStart(radii: readonly number[], at: readonly number[], total: number, closed: boolean, gridLength: number, preferred: number | null): number | null {
  const runs = straightRunsAbove(radii, at, total, closed, GRID_STRAIGHT_RADIUS);
  let best: number | null = null;
  let bestKey = Infinity;
  for (const run of runs) {
    const lo = run.start + gridLength + 4;
    const hi = run.start + run.length - 12;
    if (hi < lo) continue;
    let point: number;
    let key: number;
    if (preferred === null) {
      point = Math.max(lo, Math.min(hi, run.start + run.length * 0.66));
      key = -run.length;
    } else {
      // The feasible point nearest the preferred distance, around the lap for a closed one.
      const candidates = closed ? [preferred - total, preferred, preferred + total] : [preferred];
      point = lo;
      key = Infinity;
      for (const want of candidates) {
        const clamped = Math.max(lo, Math.min(hi, want));
        const off = Math.abs(clamped - want);
        if (off < key) {
          key = off;
          point = clamped;
        }
      }
    }
    if (key < bestKey - 1e-6) {
      bestKey = key;
      best = point;
    }
  }
  return best === null ? null : indexAtDistance(at, total, best, closed);
}

/** Runs (arc start, length) where the radius stays at or above `minRadius`. */
function straightRunsAbove(radii: readonly number[], at: readonly number[], total: number, closed: boolean, minRadius: number): { start: number; length: number }[] {
  const n = radii.length;
  const runs: { start: number; length: number }[] = [];
  const ok = radii.map((r) => r >= minRadius);
  const origin = closed ? ok.findIndex((v) => !v) : 0;
  if (origin < 0) return [{ start: 0, length: total }];
  let run = -1;
  for (let k = 0; k <= n; k += 1) {
    const i = origin + k;
    const here = k < n && ok[i % n]!;
    if (here && run < 0) run = i;
    if (!here && run >= 0) {
      const a = at[run % n]!;
      const b = !closed && i >= n ? total : at[(i - 1) % n]!;
      runs.push({ start: a, length: b >= a ? b - a : total - a + b });
      run = -1;
    }
  }
  return runs;
}

interface Candidate {
  nodes: number[];
  edges: number[];
  length: number;
  arterial: number;
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
  open: ReadonlySet<number> = new Set(),
): CircuitSeal[] {
  // `open` edges belong to the event (a circuit's pit lane): never barriered off.
  const onRoute = new Set([...edges, ...open]);
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
 * Red/white kerb strips where a racing line touches the road edge: an inside kerb across the apex (the
 * middle of the corner) and an outside kerb at the track-out (apex to exit). Returns the polylines and
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
    // Inside is the side the corner turns toward: a right-hander (direction 1) has its inside on the right.
    const inside: -1 | 1 = corner.direction === 1 ? 1 : -1;
    const apexAt = Math.max(0, span.indexOf(corner.apex));
    const third = Math.max(1, Math.floor(span.length / 3));
    const insideFrom = Math.max(0, Math.min(apexAt - Math.floor(third / 2), span.length - 3));
    const pieces: [-1 | 1, number[]][] = [
      [inside, span.slice(insideFrom, Math.max(insideFrom + 3, Math.min(span.length, apexAt + Math.ceil(third / 2) + 1)))],
      [inside === 1 ? -1 : 1, span.slice(Math.min(apexAt, span.length - 3))],
    ];
    for (const [side, part] of pieces) {
      const run: StreetVec2[] = [];
      for (const at of part) {
        const here = points[at]!;
        // Mitre on the neighbour-to-neighbour tangent: a per-segment normal fans the strip open on
        // the outside of a corner, which is exactly where a kerb must stay flush to the road edge.
        const prev = points[(at - 1 + n) % n]!;
        const next = points[(at + 1) % n]!;
        const dx = next[0] - prev[0];
        const dz = next[1] - prev[1];
        const len = planar(dx, dz);
        if (len < 1e-6) continue;
        const half = (route.widths[at] ?? 8) * 0.5;
        run.push([here[0] + (dz / len) * half * side, here[1] - (dx / len) * half * side]);
      }
      if (run.length >= 2) kerbs.push({ points: run, width, side, stripe, corner: index });
    }
  });
  return kerbs;
}

/**
 * Where and how a street race runs, beyond the lap dials. Every anchor is a graph node id or a
 * volume-local point (snapped to the nearest junction on a street cycle) — so laps over authored
 * streets (`streetNetworkFromPaths`) can name junctions by position.
 * - `kind` — `"lap"` (default) or a point-to-point `"sprint"`.
 * - `via` — anchors the race must pass, in order.
 * - `start` — where the race starts: a lap is routed through it and its start line (with the whole
 *   grid on a straight) goes as near it as the straights allow; a sprint starts there.
 * - `finish` — a sprint's end (default: wherever a route of about `lapLength` lands).
 * - `landmarks` — points the score rewards passing within 40 m of.
 * - `avoidEdges` — edges of other races the score steers away from, so a city's laps differ.
 */
export interface CircuitRouteConstraints {
  kind?: StreetRaceKind;
  via?: readonly (number | StreetVec2)[];
  start?: number | StreetVec2;
  finish?: number | StreetVec2;
  landmarks?: readonly StreetVec2[];
  avoidEdges?: readonly number[];
}

/** Spacing (m) the search shapes finalists at; the winner is resampled to `sampleStep` afterwards. */
const SHAPE_STEP = 3;
/** Finalists the search shapes into racing lines and re-scores. */
const FINALISTS = 4;

/** A finalist shaped into its racing line, with its chicane barriers placed on the street. */
interface ShapedRoute {
  line: StreetVec2[];
  widths: number[];
  heights: number[] | null;
  barriers: { x: number; z: number; heading: number; width: number }[];
}

function shapeOutline(outline: LapOutline, planned: readonly PlannedChicane[], resolved: CircuitRouteParams, closed: boolean): ShapedRoute {
  const dense = resampleLine(outline.points, outline.widths, outline.heights, Math.max(resolved.sampleStep, SHAPE_STEP), closed);
  const n = dense.points.length;
  const { total } = arcProfile(dense.points, closed);
  const spacing = total / (closed ? n : n - 1);
  const { gates, barriers } = chicaneGates(planned, dense.widths, spacing, n);
  const line = shapeRacingLine(dense.points, dense.widths, closed, resolved.cornerCut, gates);
  const placed = barriers.map((barrier) => {
    const here = dense.points[barrier.index]!;
    const heading = headingAt(dense.points, barrier.index, closed);
    const width = dense.widths[barrier.index] ?? 9;
    // Right of travel is (cos h, -sin h) for heading atan2(dx, dz); the run fills from its road edge
    // to the gap, centred `side × gap / 2` off the street centerline.
    const offset = barrier.side * barrier.gap * 0.5;
    return { x: here[0] + Math.cos(heading) * offset, z: here[1] - Math.sin(heading) * offset, heading, width: width - barrier.gap };
  });
  return { line, widths: dense.widths, heights: dense.heights, barriers: placed };
}

/** Corners of a shaped line with their honest total turn, read just outside each tight span. */
function lineCorners(line: readonly StreetVec2[], closed: boolean, resolved: CircuitRouteParams): { corners: CircuitCorner[]; radii: number[]; at: number[]; total: number } {
  const { at, total } = arcProfile(line, closed);
  const radii = radiusProfile(line, Math.max(6, resolved.minCornerRadius), closed);
  const cornerThreshold = Math.max(resolved.minCornerRadius * 4, 40);
  const spacing = total / line.length;
  const raw = splitEsses(line, radii, analyzeCorners(line, radii, cornerThreshold, Math.max(8, resolved.minCornerRadius), spacing), closed);
  const n = line.length;
  const corners = raw.map((corner, k) => {
    // The tight span is only the middle of a turn a racing line spreads wide: read the turn up to
    // CORNER_READ outside it, never past halfway to a neighbouring corner.
    const prev = raw[(k - 1 + raw.length) % raw.length]!;
    const next = raw[(k + 1) % raw.length]!;
    const gap = (from: number, to: number): number => (closed ? (((at[to]! - at[from]!) % total) + total) % total : Math.abs(at[to]! - at[from]!));
    const limitBefore = raw.length > 1 && (closed || k > 0) ? Math.min(CORNER_READ, gap(prev.exit, corner.entry) * 0.5) : CORNER_READ;
    const limitAfter = raw.length > 1 && (closed || k < raw.length - 1) ? Math.min(CORNER_READ, gap(corner.exit, next.entry) * 0.5) : CORNER_READ;
    const turn = cornerTurn(line, at, total, corner.entry, corner.exit, closed, limitBefore, limitAfter);
    // Which way it turns is read at the apex, where curvature is strongest: an S's near-zero net turn
    // (or a hairpin's ±180°) would flip sign on float noise.
    const a = line[closed ? (corner.apex - 1 + n) % n : Math.max(0, corner.apex - 1)]!;
    const b = line[corner.apex]!;
    const c = line[closed ? (corner.apex + 1) % n : Math.min(n - 1, corner.apex + 1)]!;
    const bend = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    return { ...corner, angle: Math.abs(turn), direction: (bend <= 0 ? 1 : -1) as -1 | 1 };
  });
  return { corners, radii, at, total };
}

/** Smallest turn (radians) each half of an S must make to count as two corners. */
const ESS_MIN_TURN = (5 * Math.PI) / 180;

/**
 * Split a tight span that turns one way then the other (a chicane, an S) into its two corners at
 * the inflection: unsigned radius sees one corner there, a driver sees a left and a right.
 */
function splitEsses(line: readonly StreetVec2[], radii: readonly number[], corners: CircuitCorner[], closed: boolean): CircuitCorner[] {
  const n = line.length;
  const turnAt = (i: number): number => {
    const a = line[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
    const b = line[i]!;
    const c = line[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    return angleDelta(Math.atan2(b[0] - a[0], b[1] - a[1]), Math.atan2(c[0] - b[0], c[1] - b[1]));
  };
  const out: CircuitCorner[] = [];
  for (const corner of corners) {
    const span: number[] = [];
    for (let i = corner.entry, guard = 0; guard <= n; guard += 1) {
      span.push(i);
      if (i === corner.exit) break;
      i = closed ? (i + 1) % n : i + 1;
    }
    // Running turn: the split is where it peaks, the far side of the first half.
    let running = 0;
    let peak = 0;
    let at = -1;
    for (let k = 0; k < span.length; k += 1) {
      running += turnAt(span[k]!);
      if (Math.abs(running) > Math.abs(peak) + 1e-9) {
        peak = running;
        at = k;
      }
    }
    const rest = running - peak;
    if (at <= 0 || at >= span.length - 1 || Math.abs(peak) < ESS_MIN_TURN || Math.abs(rest) < ESS_MIN_TURN || Math.sign(rest) === Math.sign(peak)) {
      out.push(corner);
      continue;
    }
    for (const part of [span.slice(0, at + 1), span.slice(at + 1)]) {
      let apex = part[0]!;
      for (const i of part) if (radii[i]! < radii[apex]!) apex = i;
      out.push({ ...corner, entry: part[0]!, exit: part[part.length - 1]!, apex, radius: radii[apex]! });
    }
  }
  return out;
}

/** Furthest (m) a corner's turn is read outside its tight span. */
const CORNER_READ = 60;

/** The lap summary read off a shaped racing line — what the finalists are judged on. */
function shapedSummary(shaped: ShapedRoute, closed: boolean, base: LapSummary, resolved: CircuitRouteParams): LapSummary {
  const line = shaped.line;
  const { corners, at, total } = lineCorners(line, closed, resolved);
  const metric = radiusProfile(line, METRIC_CHORD, closed);
  const runs = straightRuns(metric, at, total, closed, true);
  let overtakes = 0;
  for (const run of runs) {
    if (run.length < OVERTAKE_STRAIGHT) continue;
    // Heavy braking: a slow corner within 80 m of the straight's end.
    const end = run.start + run.length;
    for (let d = 0; d <= 80; d += SHAPE_STEP) {
      if (!closed && end + d > total) break;
      if (metric[indexAtDistance(at, total, end + d, closed)]! < SLOW_CORNER_RADIUS) {
        overtakes += 1;
        break;
      }
    }
  }
  const sim = simulateLap(line, metric, closed);
  const summary: LapCornerSummary[] = corners.map((corner) => ({ angle: corner.angle, direction: corner.direction, at: at[corner.apex]!, radius: corner.radius }));
  return { ...base, length: total, straights: runs.map((run) => run.length), corners: summary, overtakes, brakingZones: sim.brakingZones };
}

interface LiftedRoute {
  nodes: number[];
  edges: number[];
  arterial: number;
  shaped: ShapedRoute;
}

/**
 * The street-race search: generate candidates, score every one off its outline, shape the best few
 * into racing lines and keep the one that scores best as driven.
 */
function liftStreetRace(graph: LapGraph, resolved: CircuitRouteParams, constraints: CircuitRouteConstraints, seed: string, closed: boolean): LiftedRoute | null {
  const anchors: LapAnchor[] = [];
  if (constraints.start !== undefined) anchors.push(resolveAnchor(graph, constraints.start));
  for (const via of constraints.via ?? []) anchors.push(resolveAnchor(graph, via));
  const finish = !closed && constraints.finish !== undefined ? resolveAnchor(graph, constraints.finish) : null;
  const startOnly = constraints.start !== undefined && (constraints.via ?? []).length === 0;
  const candidates = lapCandidates(graph, { closed, lapLength: resolved.lapLength, arterialBias: resolved.arterialBias, anchors, startOnly, finish, seed });
  const rules: LapScoreRules = {
    lapLength: resolved.lapLength,
    arterialBias: resolved.arterialBias,
    chicanes: resolved.chicanes,
    ...(constraints.landmarks === undefined ? {} : { landmarks: constraints.landmarks }),
    ...(constraints.avoidEdges === undefined ? {} : { avoidEdges: new Set(constraints.avoidEdges) }),
  };
  const scored: { outline: LapOutline; summary: LapSummary; chicanes: PlannedChicane[]; key: number; order: number }[] = [];
  candidates.forEach((links, order) => {
    const outline = outlineOf(graph, links, closed);
    if (outline.points.length < 4) return;
    const { summary, chicanes } = summarizeOutline(outline, closed, rules);
    scored.push({ outline, summary, chicanes, key: quantizedScore(lapScore(summary, rules)), order });
  });
  scored.sort((a, b) => b.key - a.key || a.order - b.order);
  let best: LiftedRoute | null = null;
  let bestKey = -Infinity;
  let shapedCount = 0;
  for (const entry of scored) {
    if (shapedCount >= FINALISTS) break;
    // A fold where two stretches of the lap share asphalt is not raceable.
    if (selfClearance(entry.outline.points, entry.outline.widths, closed) < 0) continue;
    shapedCount += 1;
    const shaped = shapeOutline(entry.outline, entry.chicanes, resolved, closed);
    const key = quantizedScore(lapScore(shapedSummary(shaped, closed, entry.summary, resolved), rules));
    if (key > bestKey) {
      bestKey = key;
      best = { nodes: entry.outline.nodes, edges: entry.outline.edges, arterial: entry.outline.arterialShare, shaped };
    }
  }
  return best;
}

/**
 * Lift a sealed-off street race out of an existing street network: a closed lap by default, or a
 * point-to-point sprint, optionally pinned through `via` anchors in order from a `start` hint
 * ({@link CircuitRouteConstraints}). Returns `null` when no route fits (a pure tree of dead-end
 * streets, or anchors the streets cannot link without crossing themselves), so callers can fall back
 * or warn rather than render a broken race.
 *
 * On a `circuit`-mode network with no constraints the generated loop is used directly. Otherwise the
 * lap search runs, seeded by the calling generator's seed. This is the lap stage of
 * {@link RACE_CIRCUIT_GENERATOR}; a generator that already grew its streets (the `city` kind) runs it on
 * them with its own context.
 */
export function extractCircuitRoute(
  network: StreetNetwork,
  resolved: CircuitRouteParams,
  context: Pick<GeneratorContext, "seed">,
  constraints: CircuitRouteConstraints = {},
): CircuitRoute | null {
  const adjacency = buildAdjacency(network);
  const closed = constraints.kind !== "sprint";
  const constrained = constraints.via !== undefined || constraints.start !== undefined || !closed;
  if (network.mode === "circuit" && network.circuit !== undefined && !constrained) {
    const designedLoop = loopCandidate(network);
    if (designedLoop !== null) return designedRoute(network.circuit, designedLoop, adjacency, network, resolved);
  }
  let nodes: number[];
  let edges: number[];
  let arterialShare: number;
  let centerline: StreetVec2[];
  let widths: number[];
  let heights: number[] | null;
  let barriers: ShapedRoute["barriers"] = [];
  const loop = network.mode === "circuit" && !constrained ? loopCandidate(network) : null;
  const lifted = loop === null ? liftStreetRace(buildLapGraph(network), resolved, constraints, context.seed, closed) : null;
  if (lifted !== null) {
    nodes = lifted.nodes;
    edges = lifted.edges;
    arterialShare = lifted.arterial;
    const dense = resampleLine(lifted.shaped.line, lifted.shaped.widths, lifted.shaped.heights, resolved.sampleStep, closed);
    centerline = dense.points;
    widths = dense.widths;
    heights = dense.heights;
    barriers = lifted.shaped.barriers;
  } else {
    const candidate = loop ?? (constrained ? null : loopCandidate(network));
    if (candidate === null) return null;
    const assembled = assembleCenterline(candidate.nodes, candidate.edges, adjacency);
    if (assembled.centerline.length < 4) return null;
    // Resample to a racing-surface resolution, then round the junction kinks into a line a car can
    // actually take — still the same asphalt, just driven properly.
    const dense = resampleLine(assembled.centerline, assembled.widths, assembled.heights, resolved.sampleStep);
    nodes = candidate.nodes;
    edges = candidate.edges;
    arterialShare = candidate.arterial;
    centerline = roundCorners(dense.points, dense.widths, resolved.minCornerRadius, resolved.cornerCut);
    widths = dense.widths;
    heights = dense.heights;
  }
  if (centerline.length < 8) return null;
  const { corners, radii, at, total } = lineCorners(centerline, closed, resolved);
  let tightestRadius = Infinity;
  for (const radius of radii) if (radius < tightestRadius) tightestRadius = radius;
  const cornerThreshold = Math.max(resolved.minCornerRadius * 4, 40);
  const straightRadius = Math.max(cornerThreshold * 3, 200);

  // The whole grid stands on a straight: never in a corner.
  const gridSpan = gridLength(resolved.gridSlots);
  let preferred: number | null = closed ? null : 0;
  if (constraints.start !== undefined) {
    const hint = typeof constraints.start === "number" ? adjacency.nodeAt.get(constraints.start) : { x: constraints.start[0], z: constraints.start[1] };
    if (hint !== undefined) {
      let nearest = 0;
      let nearestD = Infinity;
      centerline.forEach((p, i) => {
        const d = (p[0] - hint.x) ** 2 + (p[1] - hint.z) ** 2;
        if (d < nearestD) {
          nearestD = d;
          nearest = i;
        }
      });
      preferred = at[nearest]!;
    }
  }
  const metric = radiusProfile(centerline, METRIC_CHORD, closed);
  const startIndex = placeStart(metric, at, total, closed, gridSpan, preferred) ?? (closed ? findStartIndex(radii, at, total, straightRadius) : indexAtDistance(at, total, gridSpan + 4, false));
  const start = startAt(centerline, widths, at, startIndex, closed);
  const grid = gridBehind(centerline, widths, at, total, startIndex, resolved.gridSlots, closed);
  const checkpoints = raceGates(centerline, widths, heights, at, total, startIndex, closed, resolved);
  // A lap's sectors split its simulated lap time, breaking just past corners; a sprint's split evenly.
  const profile = closed ? lapTimeProfile(centerline) : null;
  const breaks = corners.map((corner) => indexAtDistance(at, total, at[corner.exit]! + 15, closed));
  const sectors =
    profile === null
      ? Array.from({ length: resolved.sectors }, (_, k) => k / resolved.sectors)
      : timedSectors(profile.time, profile.lapTime, at, total, startIndex, breaks, resolved.sectors);

  const chicanes: CircuitChicane[] = [];
  for (let k = 0; k + 1 < barriers.length; k += 2) {
    const nearest = (b: { x: number; z: number }): number => {
      let best = 0;
      let bestD = Infinity;
      centerline.forEach((p, i) => {
        const d = (p[0] - b.x) ** 2 + (p[1] - b.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };
    const first = barriers[k]!;
    const second = barriers[k + 1]!;
    chicanes.push({
      entry: nearest(first),
      exit: nearest(second),
      barriers: [
        { ...first, kind: resolved.sealKind },
        { ...second, kind: resolved.sealKind },
      ],
    });
  }

  return {
    closed,
    centerline,
    widths,
    ...(heights === null ? {} : { heights }),
    length: total,
    edges,
    nodes,
    seals: buildSeals(nodes, edges, adjacency, resolved.sealKind),
    chicanes,
    corners,
    checkpoints,
    laps: closed ? resolved.laps : 1,
    start,
    grid,
    sectors,
    arterialShare,
    tightestRadius,
  };
}

/** The start/finish line across the road at `index`. */
function startAt(centerline: readonly StreetVec2[], widths: readonly number[], at: readonly number[], index: number, closed: boolean): CircuitStart {
  const point = centerline[index]!;
  const heading = headingAt(centerline, index, closed);
  const width = widths[index] ?? 10;
  const across = heading + Math.PI / 2;
  return {
    x: point[0],
    z: point[1],
    heading,
    line: [
      [point[0] + Math.sin(across) * width * 0.5, point[1] + Math.cos(across) * width * 0.5],
      [point[0] - Math.sin(across) * width * 0.5, point[1] - Math.cos(across) * width * 0.5],
    ],
    distance: at[index]!,
    width,
  };
}

/** Staggered grid slots in pairs behind the line at `startIndex`. */
function gridBehind(
  centerline: readonly StreetVec2[],
  widths: readonly number[],
  at: readonly number[],
  total: number,
  startIndex: number,
  slots: number,
  closed: boolean,
): CircuitGridSlot[] {
  const grid: CircuitGridSlot[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    const row = Math.floor(slot / 2);
    const column = slot % 2 === 0 ? -1 : 1;
    const index = indexAtDistance(at, total, at[startIndex]! - (GRID_FRONT_GAP + row * GRID_ROW_PITCH), closed);
    const point = centerline[index]!;
    const heading = headingAt(centerline, index, closed);
    const lateral = heading + Math.PI / 2;
    const offset = (widths[index] ?? widths[startIndex] ?? 10) * 0.22 * column;
    grid.push({ x: point[0] + Math.sin(lateral) * offset, z: point[1] + Math.cos(lateral) * offset, heading });
  }
  return grid;
}

/**
 * Gates evenly spaced with the finish line LAST, so `raceTrack` treats the start/finish crossing as the
 * lap boundary; a sprint's gates run from the start line to the far end. A lap's finish IS the start
 * line: placing it by distance (start + spacing * count, wrapped by `total`) lands within an ulp of
 * `at[startIndex]`, so libm's last bit picked the sample before or after the line and moved the finish
 * by a whole step.
 */
function raceGates(
  centerline: readonly StreetVec2[],
  widths: readonly number[],
  heights: readonly number[] | null,
  at: readonly number[],
  total: number,
  startIndex: number,
  closed: boolean,
  resolved: CircuitRouteParams,
): CircuitGate[] {
  const checkpoints: CircuitGate[] = [];
  const raceDistance = closed ? total : total - at[startIndex]!;
  const gateSpacing = raceDistance / resolved.checkpoints;
  for (let gate = 1; gate <= resolved.checkpoints; gate += 1) {
    const finish = gate === resolved.checkpoints;
    const index = finish ? (closed ? startIndex : centerline.length - 1) : indexAtDistance(at, total, at[startIndex]! + gateSpacing * gate, closed);
    const point = centerline[index]!;
    const height = heights?.[index] ?? 0;
    const halfWidth = (widths[index] ?? widths[startIndex] ?? 10) * 0.5 + 1.5;
    checkpoints.push({
      id: finish ? "finish" : `cp${gate}`,
      center: [point[0], height + resolved.gateHeight * 0.5, point[1]],
      half: [halfWidth, resolved.gateHeight * 0.5, 2.5],
    });
  }
  return checkpoints;
}

/**
 * A designed closed circuit as a route: the design resampled to `sampleStep`, its corners, start line
 * on the start straight with the whole grid behind it, timed sectors at the designed break points, the
 * pit lane left open, and the dressing carried through.
 */
function designedRoute(design: CircuitDesign, loop: Candidate, adjacency: Adjacency, network: StreetNetwork, resolved: CircuitRouteParams): CircuitRoute {
  const length = design.length;
  const count = Math.max(12, Math.min(8000, Math.floor(length / resolved.sampleStep + SAMPLE_ROUND)));
  const spacing = length / count;
  const m = design.centerline.length;
  const lerpAt = (values: readonly number[], s: number): number => {
    const u = s / design.step;
    const i = Math.floor(u);
    const t = u - i;
    const a = values[((i % m) + m) % m]!;
    const b = values[(((i + 1) % m) + m) % m]!;
    return a + (b - a) * t;
  };
  const xs = design.centerline.map((p) => p[0]);
  const zs = design.centerline.map((p) => p[1]);
  const centerline: StreetVec2[] = [];
  const widths: number[] = [];
  const banking: number[] = [];
  const heights: number[] | null = design.heights === undefined ? null : [];
  const time: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const s = i * spacing;
    centerline.push([lerpAt(xs, s), lerpAt(zs, s)]);
    widths.push(lerpAt(design.widths, s));
    banking.push(lerpAt(design.banking, s));
    if (heights !== null) heights.push(lerpAt(design.heights!, s));
    // Elapsed time wraps at the seam: interpolate inside the lap only.
    const u = s / design.step;
    const j = Math.min(m - 1, Math.floor(u));
    time.push(j + 1 < m ? design.time[j]! + (design.time[j + 1]! - design.time[j]!) * (u - j) : design.time[j]!);
  }
  const { at, total } = arcProfile(centerline, true);
  const indexAt = (s: number): number => ((Math.floor(s / spacing + SAMPLE_ROUND) % count) + count) % count;
  const corners: CircuitCorner[] = design.corners.map((corner) => ({
    apex: indexAt(corner.apex),
    radius: corner.radius,
    angle: Math.abs(corner.turn),
    direction: corner.turn > 0 ? -1 : 1,
    entry: indexAt(corner.entry),
    exit: indexAt(corner.exit),
    kind: corner.kind,
  }));
  const startIndex = indexAt(startLineOffset(design.startStraight.to - design.startStraight.from, resolved.gridSlots));
  const pitEdges = new Set(network.edges.filter((edge) => !edge.loop).map((edge) => edge.id));
  return {
    closed: true,
    centerline,
    widths,
    ...(heights === null ? {} : { heights }),
    length: total,
    edges: loop.edges,
    nodes: loop.nodes,
    seals: buildSeals(loop.nodes, loop.edges, adjacency, resolved.sealKind, pitEdges),
    chicanes: [],
    corners,
    checkpoints: raceGates(centerline, widths, heights, at, total, startIndex, true, resolved),
    laps: resolved.laps,
    start: startAt(centerline, widths, at, startIndex, true),
    grid: gridBehind(centerline, widths, at, total, startIndex, resolved.gridSlots, true),
    sectors: timedSectors(time, design.lapTime, at, total, startIndex, design.sectorBreaks.map(indexAt), resolved.sectors),
    arterialShare: loop.arterial,
    tightestRadius: Math.min(...design.corners.map((corner) => corner.radius)),
    banking,
    lapTime: design.lapTime,
    brakingZones: design.brakingZones,
    ...(design.pit === undefined ? {} : { pit: design.pit }),
    runoff: design.runoff,
    walls: design.walls,
    grandstands: design.grandstands,
    crossings: design.crossings,
  };
}

/** One named race a city hosts: a lap or sprint, its anchors, and any lap dials it overrides. */
export interface StreetRaceSpec extends CircuitRouteConstraints {
  /** Stable id: seeds the race's own search and names it in the result. */
  id: string;
  label?: string;
  /** Lap dials this race overrides on top of the shared defaults. */
  params?: Partial<CircuitRouteParams>;
}

/** One lifted race: its id, label, and the route (null when the streets hold no fitting route). */
export interface StreetRace {
  id: string;
  label: string;
  route: CircuitRoute | null;
}

/**
 * Lift several named races out of one street network — a city's race calendar. Each race is searched
 * with its own seed (`<seed>:<id>`), and races without anchors are steered away from the streets the
 * earlier ones already use, so a city's laps differ instead of all picking the same best loop.
 */
export function extractStreetRaces(network: StreetNetwork, specs: readonly StreetRaceSpec[], defaults: CircuitRouteParams, context: Pick<GeneratorContext, "seed">): StreetRace[] {
  const used = new Set<number>();
  return specs.map((spec) => {
    const { id, label, params, ...constraints } = spec;
    const avoid = [...(constraints.avoidEdges ?? []), ...used];
    const route = extractCircuitRoute(network, { ...defaults, ...params }, { seed: `${context.seed}:${id}` }, { ...constraints, avoidEdges: avoid });
    for (const edge of route?.edges ?? []) used.add(edge);
    return { id, label: label ?? id, route };
  });
}

/** The race circuit generator's output family: a {@link RaceCircuit}. */
export const RACE_CIRCUIT_OUTPUT = "race-circuit";

/** One generated race: the streets it was lifted from, and the lap (null when they hold no drivable cycle). */
export interface RaceCircuit {
  network: StreetNetwork;
  route: CircuitRoute | null;
}

const streetPreset = (id: string): Readonly<Record<string, unknown>> => STREET_NETWORK_SCHEMA.presets?.find((preset) => preset.id === id)?.values ?? {};

/** The closed-circuit characters share a pit lane, a full grid and the circuit topology dials. */
const closedCircuit = (values: Record<string, unknown>): Record<string, unknown> => ({ ...streetPreset("circuit"), branching: 0.4, gridSlots: 20, ...values });

/**
 * The race circuit's params: the street generator's dials and footprint, then the lap dials. The lap
 * length is one dial for both: the length a closed circuit is designed to, and the route a street race
 * searches for.
 */
export const RACE_CIRCUIT_SCHEMA = defineParamSchema({
  groups: [...(STREET_NETWORK_SCHEMA.groups ?? []), { id: "race", label: "Race" }],
  fields: [...STREET_NETWORK_DIAL_FIELDS, ...CIRCUIT_ROUTE_FIELDS],
  presets: [
    { id: "street-race", label: "Street race", values: { ...streetPreset("net"), connectivity: 0.85, loopiness: 0.3, segmentLength: 90, width: 9, lapLength: 1200 } },
    {
      id: "circuit",
      label: "Closed circuit (flowing classic)",
      values: closedCircuit({ gridness: 0.1, winding: 0.4, minCurveRadius: 11, width: 13, compactness: 0.25, elevation: 0.6, maxGrade: 0.08, lapLength: 3200 }),
    },
    {
      id: "street-circuit",
      label: "Street circuit (tight)",
      values: closedCircuit({ gridness: 0.9, winding: 0.75, minCurveRadius: 10, width: 11, compactness: 0.6, elevation: 0.15, maxGrade: 0.06, lapLength: 2400 }),
    },
    {
      id: "high-speed",
      label: "High-speed",
      values: closedCircuit({ gridness: 0.05, winding: 0.05, minCurveRadius: 12, width: 14, compactness: 0, elevation: 0.3, maxGrade: 0.05, lapLength: 4200 }),
    },
    {
      id: "technical",
      label: "Technical",
      values: closedCircuit({ gridness: 0.3, winding: 0.95, minCurveRadius: 10, width: 12, compactness: 0.85, elevation: 0.4, maxGrade: 0.07, lapLength: 2800 }),
    },
    {
      id: "figure-8",
      label: "Figure-8",
      values: closedCircuit({ gridness: 0.1, winding: 0.5, minCurveRadius: 11, width: 12, compactness: 0.3, elevation: 0.3, maxGrade: 0.07, crossover: true, lapLength: 3000 }),
    },
  ],
});

/**
 * The race circuit generator: grows a street network ({@link STREET_NETWORK_GENERATOR}) and lifts a
 * closed, sealed-off lap out of it with {@link extractCircuitRoute}, both from the one injected seed.
 * Street dials at the `circuit` end give a purpose-built closed track designed to `lapLength`; at the
 * `net` end, a street race through a city's own blocks. The ground `input` turns gaps into bridges and ridges into tunnels.
 *
 * @capability race-circuit lift a closed, sealed-off race lap out of an existing city street network
 */
export const RACE_CIRCUIT_GENERATOR = defineGenerator({
  id: "race-circuit",
  label: "Race circuit",
  output: RACE_CIRCUIT_OUTPUT,
  schema: RACE_CIRCUIT_SCHEMA,
  generate(params, context: GeneratorContext<StreetNetworkInput>): RaceCircuit {
    const network = STREET_NETWORK_GENERATOR.generate(params, context);
    return { network, route: extractCircuitRoute(network, params, context) };
  },
});
