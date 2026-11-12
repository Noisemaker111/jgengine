/**
 * The unified, seed-driven procedural STREET GENERATOR — one engine that grows an entire street/track
 * graph inside a box volume and answers to sliders instead of hardcoded geometry. It is deliberately
 * genre-agnostic: a city street net and a closed race circuit are the *same* engine at opposite
 * slider extremes, not two code paths. Drop a volume, pick a seed, and turn the dials:
 *
 * - `gridness` — 1 lays nodes on a regular lattice (Manhattan); 0 scatters them (organic hills).
 * - `loopiness` — 0 grows a tree that dead-ends; 1 collapses to a single closed loop (a circuit).
 * - `connectivity` — extra chord edges between neighbors → mesh density (a dense city grid).
 * - `branching` — spur lanes forking off the mains, ending in cul-de-sacs (and, in a circuit, the
 *   trigger for a real pit lane that leaves and rejoins the loop).
 * - `deadEnds` — fraction of dangling ends KEPT as cul-de-sacs vs reconnected into loops.
 * - `winding` — for a NET, sideways wander amplitude of every edge, capped so curvature never exceeds
 *   `1 / minCurveRadius`; for a CIRCUIT, corner density and mix (0 = few, fast corners; 1 = 6 per km,
 *   slow and technical). `minTurnAngle`/`maxTurnAngle` are HARD
 *   clamps on the corner a NET street may take at any vertex — shallow wiggles are straightened, and every
 *   real corner is replaced with a sampled circular-arc fillet of radius `minCurveRadius` so corners read
 *   as CURVES, never single bevels, sampled so no discrete turn between consecutive samples exceeds ~9°.
 *   A circuit skips that fillet entirely — its designed centerline is clothoid-entered arcs sampled
 *   finely enough that every per-sample turn stays ≤ ~6°.
 * - `lapLength`, `compactness`, `crossover` — CIRCUIT only: the lap length the circuit is designed to
 *   (shortened only when the volume cannot hold it), how tightly it packs into its footprint, and a
 *   grade-separated figure-8 crossing. `gridness` pulls a circuit's headings to the axes (a street
 *   circuit of 90° corners); `minCurveRadius` sets its hairpins.
 * - `bridges` / `tunnels` (with a ground sampler) — a span that dives under `minElevation` becomes a
 *   BRIDGE deck; a span buried under a ridge becomes a TUNNEL bore. Both are path FEATURES on a
 *   continuous edge, so a circuit stays closed as it crosses water or pierces a hill.
 * - `sidewalkWidth` — pedestrian band paved on both edges of every boulevard/avenue/street (not lanes),
 *   emitted as proper parallel offset polylines on each {@link Street} — arced on the outside of a bend,
 *   welded on the inside so the band never pinches or dips inside the road surface.
 * - `elevation` / `maxGrade` — a seeded smooth 2-D height FIELD draped over the whole network. `elevation`
 *   (0..1) dials the relief amplitude: 0 is dead flat and BYTE-IDENTICAL to a network authored before
 *   this field existed (no `heights`, no `elevationAt`); 1 ≈ 22 m of relief across a ~520 m volume,
 *   scaled to the footprint. The field is 2–3 octaves of sine/cos mixtures with wavelengths scaled to the
 *   volume, so it is smooth by construction (crests/dips, never cliffs). Every {@link Street} gains a
 *   per-point `heights[]` grade-LIMITED so no consecutive pair exceeds `maxGrade` (iterative relaxation;
 *   a circuit loop stays continuous — first height === last — and the cap holds across the start/finish
 *   seam); {@link StreetEdge}s carry raw (uncapped) field samples for continuity, and the field itself is
 *   exposed as {@link StreetNetwork.elevationAt} so renderers drape junction welds, sidewalks, and
 *   building bases off the SAME field for weld-continuous ground.
 *
 *   Road elevation is WHOLLY SEPARATE from the `heightAt` TERRAIN input that drives
 *   bridges/tunnels: `elevationAt` shapes the road surface itself; `heightAt` is the world ground the
 *   road bridges over or bores through. They never interact — a flat-elevation network can still span
 *   bridges, and an elevated network's `heights[]` say nothing about where terrain gaps or ridges are.
 *
 * Hierarchy is STRUCTURAL, not a length percentile: an approximate edge-betweenness centrality over the
 * grown graph elects a connected arterial skeleton (avenues/boulevards) that never dead-ends at an
 * interior junction of lesser roads NOR at an interior cul-de-sac (wide roads never stub out
 * mid-district); everything else is a local street, spurs are lanes. Grown chords and spur lanes
 * keep the graph planar — no edge ever crosses another without a shared junction node.
 *
 * Circuit mode is a DESIGNED lap ({@link designCircuit}): straights and corner complexes from a corner
 * grammar (hairpin, slow, medium, sweeper, kink, carousel, double-apex, chicane, esses), closed exactly at
 * `lapLength` by a linear solve, fitted to the volume, picked from several candidates by a lap
 * simulation, and dressed (elevation, banking, widths, run-off, barriers, pit lane, grandstands). The
 * sampled lap is distributed into many node-to-node edges (nodes exactly ON the line, each edge carrying
 * its sampled sub-arc and road heights); city (net) streets keep the single-radius `minCurveRadius` arc
 * fillet. When branching is meaningful the designed PIT LANE splits off the start straight and rejoins it
 * as three lane edges (two degree-3 junctions, never a dead-end stub). The design itself rides on the
 * network as {@link StreetNetwork.circuit}.
 *
 * Output is two coupled views of the graph: atomic node-to-node {@link StreetEdge}s (fed straight into
 * the block/parcel fabric — a race circuit is many edges between distinct nodes, never one fragile
 * self-loop) and chained {@link Street}s (through-streets for rendering, furniture, and
 * junctions). Pure deterministic math — same rules + seed + volume ⇒ identical network — with bounded
 * work caps so a huge volume can never generate unbounded content. Local (volume-centered) coords;
 * the caller rotates/translates into world space.
 *
 * @capability street-generator seed-driven procedural streets and race circuits from one slider-driven engine
 */
import { defineGenerator, type GeneratorContext } from "../generator/generator";
import { defineParamSchema, type ParamField, type ParamGroup, type ParamPreset, type ParamsOf } from "../generator/paramSchema";
import { seededStreams } from "../random/rng";
import { CIRCUIT_LAP_LENGTH_FIELD, SAMPLE_ROUND, designCircuit, type CircuitDesign } from "./circuitDesigner";

/** Add one to `counts[index]` (an unset slot counts from zero). */
function increment(counts: number[] | Uint16Array, index: number): void {
  counts[index] = (counts[index] ?? 0) + 1;
}

/** A path vertex in the volume-local XZ frame. */
export type StreetVec2 = readonly [number, number];

/** Road hierarchy, widest to narrowest — shared by the city fabric and the renderer. */
export type StreetLevel = "boulevard" | "avenue" | "street" | "lane";

/** A path feature spanning part of an edge/street: a bridge deck over a gap or a tunnel bore under a ridge. */
export type StreetFeatureKind = "bridge" | "tunnel";

/** The generator's chosen topology family: an open street `net`, or a closed `circuit` loop. */
export type StreetNetworkMode = "net" | "circuit";

/** One graph node: a junction, a dead end, or a mid-street bend, with its connection count. */
export interface StreetNode {
  id: number;
  x: number;
  z: number;
  degree: number;
}

/** One atomic node-to-node edge — the fabric graph consumes these (welds at shared node coords). */
export interface StreetEdge {
  id: number;
  /** Endpoint node ids. */
  a: number;
  b: number;
  /** Sampled centerline; `points[0]` sits exactly on node `a`, the last on node `b`. */
  points: StreetVec2[];
  width: number;
  level: StreetLevel;
  /** True when this edge belongs to the main closed loop (circuit mode). */
  loop: boolean;
  /** Per-point road-surface height (one per `points`), present only when `elevation > 0`. Raw
   *  (uncapped) samples of {@link StreetNetwork.elevationAt}; the grade-limited profile lives on the
   *  owning {@link Street.heights}. */
  heights?: number[];
}

/** A feature span carried by a street: a `[from, to]` index window into the street's `points`. */
export interface StreetFeatureSpan {
  kind: StreetFeatureKind;
  from: number;
  to: number;
  /** Ground height at each bank/portal — the deck/floor reference the renderer drapes to. */
  bankHeight: number;
}

/** Left/right pedestrian bands flanking a street's asphalt, as offset polylines. */
export interface StreetSidewalks {
  /** Polyline offset to the left of travel (parallel to `points`). */
  left: StreetVec2[];
  /** Polyline offset to the right of travel. */
  right: StreetVec2[];
}

/** One chained through-street: a maximal run of edges through degree-2 nodes, for rendering + furniture. */
export interface Street {
  id: number;
  /** Ordered node ids the chain visits; first === last when `loop`. */
  nodes: number[];
  /** Smoothed, arc-filleted centerline. */
  points: StreetVec2[];
  width: number;
  level: StreetLevel;
  /** Closed chain (a circuit lap or an inner ring). */
  loop: boolean;
  /** Cul-de-sac turning bulb when the street ends at a dangling node. */
  bulb?: StreetVec2;
  /** Bridge/tunnel spans along this street, if any. */
  features: StreetFeatureSpan[];
  /** Flanking pedestrian bands, present on boulevard/avenue/street levels (not lanes). */
  sidewalks?: StreetSidewalks;
  /** Per-point road-surface height (one per `points`), present only when `elevation > 0`. Grade-limited
   *  so no consecutive pair exceeds `maxGrade`; a loop stays continuous (`heights[0] === heights.at(-1)`).
   *  This is ROAD elevation, not the `heightAt` terrain input that drives bridges/tunnels. */
  heights?: number[];
}

/** One crossing of three or more streets: patch center/radius plus outgoing arm directions. */
export interface StreetJunction {
  x: number;
  z: number;
  radius: number;
  level: StreetLevel;
  /** Outgoing arm directions (radians) with the crossing street width, for crosswalks/patches. */
  arms: { angle: number; width: number }[];
}

/** One dangling street end kept as a cul-de-sac: node position plus the heading pointing off the road. */
export interface StreetDeadEnd {
  node: number;
  x: number;
  z: number;
  /** Yaw (radians) facing outward, away from the network. */
  heading: number;
  width: number;
}

/** A resolved path feature in world-of-the-volume space: a bridge deck or tunnel bore centerline. */
export interface StreetFeature {
  kind: StreetFeatureKind;
  points: StreetVec2[];
  width: number;
  bankHeight: number;
}

/** The fully-resolved network in volume-local coords. */
export interface StreetNetwork {
  mode: StreetNetworkMode;
  nodes: StreetNode[];
  /** Atomic edges — feed to the block/parcel fabric. */
  edges: StreetEdge[];
  /** Chained through-streets — feed to the renderer, furniture, and analysis. */
  streets: Street[];
  junctions: StreetJunction[];
  deadEnds: StreetDeadEnd[];
  bridges: StreetFeature[];
  tunnels: StreetFeature[];
  /** Independent cycle count (E − V + components): 0 = pure tree, ≥1 = has loops. */
  loops: number;
  /** The designed lap and its dressing — `circuit` mode only. */
  circuit?: CircuitDesign;
}

/** The street generator's output family: a {@link StreetNetwork}. */
export const STREET_NETWORK_OUTPUT = "street-network";

/** The generator id a caller or the editor's variant grid names. */
export const STREET_NETWORK_GENERATOR_ID = "streets";

/** The topology dials, shared by every generator that grows a street network first (the race circuit). */
const STREET_FIELDS = [
  { type: "range", key: "gridness", label: "grid-ness", group: "layout", min: 0, max: 1, step: 0.01, default: 0.9 },
  { type: "range", key: "loopiness", label: "loopiness", group: "layout", min: 0, max: 1, step: 0.01, default: 0.2 },
  { type: "range", key: "connectivity", label: "connectivity", group: "layout", min: 0, max: 1, step: 0.01, default: 0.35 },
  { type: "range", key: "branching", label: "branching", group: "layout", min: 0, max: 1, step: 0.01, default: 0.3 },
  { type: "range", key: "deadEnds", label: "dead ends", group: "layout", min: 0, max: 1, step: 0.01, default: 0.5 },
  { type: "range", key: "segmentLength", label: "block size", group: "layout", min: 10, max: 400, step: 0.5, default: 48, unit: "m", explore: [20, 140] },
  { type: "range", key: "aspect", label: "block aspect", group: "layout", min: 1, max: 4, step: 0.05, default: 1, explore: [1, 3] },
  { type: "range", key: "winding", label: "winding", group: "layout", min: 0, max: 1, step: 0.01, default: 0.2 },
  { type: "range", key: "minCurveRadius", label: "min curve radius", group: "layout", min: 2, max: 200, step: 0.5, default: 30, unit: "m", explore: [6, 120] },
  { type: "range", key: "minTurnAngle", label: "min turn angle", group: "layout", min: 0, max: 90, step: 0.5, default: 0, unit: "°" },
  { type: "range", key: "maxTurnAngle", label: "max turn angle", group: "layout", min: 10, max: 180, step: 0.5, default: 120, unit: "°", explore: [30, 180] },
  { type: "range", key: "width", label: "street width", group: "layout", min: 2, max: 40, step: 0.5, default: 7, unit: "m", explore: [3, 16] },
  { type: "range", key: "boulevards", label: "boulevards", group: "layout", min: 0, max: 1, step: 0.01, default: 0.3 },
  { type: "range", key: "sidewalkWidth", label: "sidewalk width", group: "layout", min: 0, max: 6, step: 0.1, default: 2, unit: "m" },
  { type: "range", key: "elevation", label: "road elevation", group: "layout", min: 0, max: 1, step: 0.01, default: 0 },
  { type: "range", key: "maxGrade", label: "max grade", group: "layout", min: 0.005, max: 0.5, step: 0.005, default: 0.07, explore: [0.01, 0.3] },
  { type: "range", key: "compactness", label: "circuit compactness", group: "layout", min: 0, max: 1, step: 0.01, default: 0 },
  { type: "bool", key: "crossover", label: "circuit figure-8 crossover", group: "layout", default: false },
  { type: "number", key: "halfX", label: "half width", group: "footprint", min: 1, default: 200, vary: false },
  { type: "number", key: "halfZ", label: "half depth", group: "footprint", min: 1, default: 200, vary: false },
  { type: "bool", key: "bridges", label: "bridges over gaps", group: "terrain", default: false },
  { type: "bool", key: "tunnels", label: "tunnels through ridges", group: "terrain", default: false },
  { type: "number", key: "minElevation", label: "bridge below y", group: "terrain", step: 0.5, default: -2, vary: false },
  { type: "range", key: "tunnelClearance", label: "tunnel ridge height", group: "terrain", min: 1, max: 40, step: 0.5, default: 6, unit: "m" },
] as const satisfies readonly ParamField[];

const STREET_GROUPS = [
  { id: "layout", label: "Layout" },
  { id: "footprint", label: "Footprint" },
  { id: "terrain", label: "Terrain features", collapsed: true },
] as const satisfies readonly ParamGroup[];

/** The two ends of the slider space, as presets: an open street net and a closed race circuit. */
const STREET_PRESETS = [
  {
    id: "net",
    label: "Street net",
    values: { gridness: 0.9, loopiness: 0.2, connectivity: 0.35, branching: 0.3, deadEnds: 0.5, segmentLength: 48, aspect: 1, winding: 0.2, minCurveRadius: 30, minTurnAngle: 0, maxTurnAngle: 120, width: 7, boulevards: 0.3 },
  },
  {
    id: "circuit",
    label: "Race circuit",
    values: { gridness: 0.15, loopiness: 1, connectivity: 0, branching: 0, deadEnds: 0, segmentLength: 60, aspect: 1, winding: 0.45, minCurveRadius: 11, minTurnAngle: 0, maxTurnAngle: 70, width: 12, boulevards: 0, compactness: 0.3, lapLength: 2400 },
  },
] as const satisfies readonly ParamPreset[];

const STREET_SEED_FIELD = { type: "seed", key: "seed", label: "seed", default: "" } as const;

/**
 * The street dials and seed WITHOUT the circuit lap length, for a generator that brings its own lap
 * length dial (the race circuit's lap stage) — the street generator still reads it by the same key.
 * @internal
 */
export const STREET_NETWORK_DIAL_FIELDS = [...STREET_FIELDS, STREET_SEED_FIELD] as const;

/**
 * The street generator's params: topology dials (a city street net and a closed circuit are the same
 * dials at opposite extremes), the volume-local footprint `halfX` × `halfZ` it grows inside, and the
 * bridge/tunnel switches its ground `input` drives.
 */
export const STREET_NETWORK_SCHEMA = defineParamSchema({
  groups: STREET_GROUPS,
  fields: [...STREET_FIELDS, { ...CIRCUIT_LAP_LENGTH_FIELD, label: "circuit lap length", group: "layout" }, STREET_SEED_FIELD],
  presets: STREET_PRESETS,
});

/** Parsed street generator params. */
export type StreetNetworkParams = ParamsOf<typeof STREET_NETWORK_SCHEMA>;

/** The street generator's world input: the ground it bridges over and bores through. */
export interface StreetNetworkInput {
  /**
   * Volume-local ground height. A span diving under `minElevation` becomes a bridge, one buried under
   * a ridge `tunnelClearance` above its banks a tunnel (with `bridges` / `tunnels` on). Without it the
   * network has no features. Distinct from the road-surface `elevation` field.
   */
  heightAt?: ((x: number, z: number) => number) | undefined;
}

/** The params one generate call grows from, with its resolved seed. */
type StreetRules = Omit<StreetNetworkParams, "seed"> & { readonly seed: string };

const TAU = Math.PI * 2;
const MAX_NODES = 900;
const MAX_STREETS = 360;
const MAX_EDGES = 1400;
const MAX_LANES = 260;
const BETWEENNESS_SOURCES = 40;
/** Hard cap on the direction change between consecutive arc-fillet samples (≈9°) so filleted corners
 *  render as smooth curves, not chunky polygons, regardless of the (looser) `maxTurnAngle` ceiling. */
const MAX_ARC_STEP_RAD = (9 * Math.PI) / 180;
const LEVEL_RANK: Record<StreetLevel, number> = { boulevard: 3, avenue: 2, street: 1, lane: 0 };
const WIDTH_MULT: Record<StreetLevel, number> = { boulevard: 2.2, avenue: 1.5, street: 1, lane: 0.65 };

/** Turn angle (radians, 0..π) at `b` going a→b→c; 0 = straight, π = full reversal. */
function turnAngle(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
  const ux = b[0] - a[0];
  const uz = b[1] - a[1];
  const vx = c[0] - b[0];
  const vz = c[1] - b[1];
  const lu = Math.hypot(ux, uz);
  const lv = Math.hypot(vx, vz);
  if (lu < 1e-6 || lv < 1e-6) return 0;
  const dot = (ux * vx + uz * vz) / (lu * lv);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/**
 * Replace every real corner of a polyline with a sampled **circular-arc fillet** so bends read as
 * smooth curves instead of polygonal notches, while enforcing two hard limits with fixed endpoints:
 * interior corners gentler than `minRad` are straightened away (deliberate winding only, no
 * micro-wiggle), and each remaining corner is rounded with an arc of radius `curveRadius` (clamped to
 * half the shorter adjacent leg) sampled finely enough that no discrete turn between consecutive
 * samples exceeds `maxRad` — a corner sharper than the ceiling is still reduced, now to a fillet
 * rather than a bevel. Open-chain endpoints never move (a graph node stays welded); pass `closed` for
 * a ring (first === last) so its wrap corner is filleted too and the loop stays closed.
 *
 * Pass `radiusFor` to vary the fillet radius PER CORNER (returning the target radius from the corner's
 * deflection and adjacent leg lengths) instead of the single `curveRadius` — the circuit loop uses this
 * to mix hairpins, standard corners, and sweepers; every other caller keeps the scalar radius.
 * @internal
 */
export function clampTurns(
  points: readonly StreetVec2[],
  minRad: number,
  maxRad: number,
  curveRadius = 0,
  closed = false,
  radiusFor?: (deflection: number, la: number, lb: number) => number,
): StreetVec2[] {
  if (points.length < 3) return points.map((p) => [p[0], p[1]] as StreetVec2);
  // 1. straighten pass — drop interior vertices whose corner is shallower than the minimum.
  let pts: StreetVec2[] = points.map((p) => [p[0], p[1]] as StreetVec2);
  if (minRad > 0) {
    let changed = true;
    let guard = 0;
    while (changed && guard < 40) {
      changed = false;
      guard += 1;
      const out: StreetVec2[] = [pts[0]!];
      for (let i = 1; i < pts.length - 1; i += 1) {
        const angle = turnAngle(out[out.length - 1]!, pts[i]!, pts[i + 1]!);
        if (angle > 1e-4 && angle < minRad) {
          changed = true; // skip this vertex — collinearize the bend
          continue;
        }
        out.push(pts[i]!);
      }
      out.push(pts[pts.length - 1]!);
      pts = out;
    }
  }
  // 2. fillet pass — round every remaining corner into a sampled circular arc.
  return filletCorners(pts, curveRadius, maxRad, closed, radiusFor);
}

/** Deflection floor above which a corner is filleted (below it the vertex is left straight). Shared by
 *  {@link filletCorners} and the per-corner radius planner so both detect the SAME corner set. */
function filletFmin(maxRad: number): number {
  return Math.min(0.14, Math.max(1e-4, maxRad));
}

/**
 * Round the corners of a polyline into sampled circular arcs. Each interior corner sharper than a
 * small threshold (or above the `maxRad` ceiling) is replaced by an arc tangent to both legs of radius
 * `curveRadius` (clamped to half the shorter leg; a non-positive radius rounds as large as the legs
 * allow). The arc is sampled uniformly in angle so the turn between consecutive samples is the sweep
 * divided by the sample count — kept at or below the smaller of `maxRad` and a fixed ~9° smoothness cap
 * ({@link MAX_ARC_STEP_RAD}) so bends read as curves, not chunky polygons. Open endpoints are preserved
 * exactly; a `closed` ring keeps `first === last`.
 * @internal
 */
function filletCorners(
  points: StreetVec2[],
  curveRadius: number,
  maxRad: number,
  closed: boolean,
  radiusFor?: (deflection: number, la: number, lb: number) => number,
): StreetVec2[] {
  const n0 = points.length;
  if (n0 < 3) return points.map((p) => [p[0], p[1]] as StreetVec2);
  const isClosed =
    closed && Math.hypot(points[0]![0] - points[n0 - 1]![0], points[0]![1] - points[n0 - 1]![1]) < 1e-6;
  const verts = isClosed ? points.slice(0, n0 - 1) : points;
  const n = verts.length;
  if (n < 3) return points.map((p) => [p[0], p[1]] as StreetVec2);
  // Fillet corners above this deflection; clamp to the ceiling so anything over `maxRad` is always
  // rounded (and anything left un-filleted is already under the ceiling).
  const fmin = filletFmin(maxRad);
  // Sample each arc so no discrete turn exceeds the smaller of the (looser) `maxRad` ceiling and the
  // fixed smoothness cap — the latter is what keeps a filleted corner from reading as a hard polygon.
  const step = Math.min(maxRad > 1e-3 ? maxRad : Math.PI, MAX_ARC_STEP_RAD);
  const out: StreetVec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const v = verts[i]!;
    const isEnd = !isClosed && (i === 0 || i === n - 1);
    if (isEnd) {
      out.push([v[0], v[1]]);
      continue;
    }
    const a = verts[(i - 1 + n) % n]!;
    const b = verts[(i + 1) % n]!;
    const deflection = turnAngle(a, v, b);
    if (deflection <= fmin) {
      out.push([v[0], v[1]]);
      continue;
    }
    const adx = a[0] - v[0];
    const adz = a[1] - v[1];
    const bdx = b[0] - v[0];
    const bdz = b[1] - v[1];
    const la = Math.hypot(adx, adz);
    const lb = Math.hypot(bdx, bdz);
    if (la < 1e-3 || lb < 1e-3) {
      out.push([v[0], v[1]]);
      continue;
    }
    const dax = adx / la;
    const daz = adz / la;
    const dbx = bdx / lb;
    const dbz = bdz / lb;
    const half = deflection / 2;
    const tanHalf = Math.tan(half);
    // Per-corner target radius (circuit sweeper/hairpin mix) or the single scalar for every other caller.
    const cornerRadius = radiusFor ? radiusFor(deflection, la, lb) : curveRadius;
    // Tangent length from the corner: `cornerRadius·tan(θ/2)`, clamped to half each leg so adjacent
    // fillets can meet but never overlap. A non-positive radius rounds as large as the legs allow.
    let t = cornerRadius > 0 ? cornerRadius * tanHalf : Math.min(la, lb) * 0.5;
    t = Math.min(t, la * 0.5, lb * 0.5);
    if (t < 1e-3) {
      out.push([v[0], v[1]]);
      continue;
    }
    const reff = t / (tanHalf || 1e-6); // effective radius after leg clamping
    let bix = dax + dbx;
    let biz = daz + dbz;
    const bl = Math.hypot(bix, biz);
    if (bl < 1e-6) {
      // Near-reversal (θ ≈ π): no stable arc center — leave the vertex as-is.
      out.push([v[0], v[1]]);
      continue;
    }
    bix /= bl;
    biz /= bl;
    // Arc center sits reff/cos(θ/2) along the inward bisector (θ = deflection); cos(θ/2) = sin(γ/2)
    // where γ = π−θ is the interior angle at the vertex.
    const denom = Math.cos(half) || 1e-6;
    const cx = v[0] + bix * (reff / denom);
    const cz = v[1] + biz * (reff / denom);
    const p0: StreetVec2 = [v[0] + dax * t, v[1] + daz * t];
    const p1: StreetVec2 = [v[0] + dbx * t, v[1] + dbz * t];
    const a0 = Math.atan2(p0[1] - cz, p0[0] - cx);
    const a1 = Math.atan2(p1[1] - cz, p1[0] - cx);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;
    // At least 3 samples so even a tiny fillet is a curve, never a bevel; capped so a full sweep can
    // still be sampled finely (a near-U hairpin at ~9°/step needs ~20 samples).
    const segs = Math.max(3, Math.min(96, Math.ceil(Math.abs(delta) / step)));
    out.push([p0[0], p0[1]]);
    for (let s = 1; s < segs; s += 1) {
      const ang = a0 + (delta * s) / segs;
      out.push([cx + reff * Math.cos(ang), cz + reff * Math.sin(ang)]);
    }
    out.push([p1[0], p1[1]]);
  }
  if (isClosed) out.push([out[0]![0], out[0]![1]]);
  return out;
}

/** Two-octave deterministic sideways wander, capped by a max amplitude. */
function makeWander(rng: () => number, amplitude: number, wavelength: number): (t: number) => number {
  const f1 = TAU / (wavelength * (0.75 + rng() * 0.5));
  const f2 = f1 * (2.3 + rng() * 0.8);
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  return (t) => amplitude * (Math.sin(t * f1 + p1) * 0.65 + Math.sin(t * f2 + p2) * 0.35);
}

/** The wander amplitude for a segment, capped so peak curvature never dips under `minCurveRadius`. */
function windingAmplitude(rules: StreetRules, wavelength: number): number {
  const want = rules.winding * rules.segmentLength * 0.34;
  // Peak curvature of A·sin(2πt/λ) is A·(2π/λ)²; keep radius ≥ minCurveRadius (0.35 covers the octave mix).
  const cap = (0.35 * wavelength * wavelength) / (4 * Math.PI * Math.PI * Math.max(1, rules.minCurveRadius));
  return Math.max(0, Math.min(want, cap));
}

/** Sample a straight chord a→b into a wandered polyline (endpoints pinned exactly on the nodes). */
function wanderEdge(a: StreetVec2, b: StreetVec2, rng: () => number, rules: StreetRules): StreetVec2[] {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return [[a[0], a[1]], [b[0], b[1]]];
  const ux = dx / len;
  const uz = dz / len;
  const nx = -uz;
  const nz = ux;
  const wavelength = rules.segmentLength * (2.6 + rng() * 1.4);
  const amp = windingAmplitude(rules, wavelength);
  const wander = makeWander(rng, amp, wavelength);
  const steps = Math.max(1, Math.ceil(len / Math.min(Math.max(rules.segmentLength / 3, 6), 16)));
  const out: StreetVec2[] = [];
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    // Window the wander to zero at both ends so the node coords stay exact for graph welding.
    const window = Math.sin(Math.PI * t);
    const off = amp === 0 ? 0 : wander(t * len) * window;
    out.push([a[0] + ux * len * t + nx * off, a[1] + uz * len * t + nz * off]);
  }
  return out;
}

interface Lattice {
  nodes: StreetVec2[];
  cols: number;
  rows: number;
  index: (i: number, j: number) => number;
}

/** Lay seed nodes: a regular lattice at `gridness` 1, jittered toward organic scatter as it drops. */
function seedLattice(rules: StreetRules, hx: number, hz: number, rng: () => number): Lattice {
  const spacingX = rules.segmentLength * Math.max(1, rules.aspect);
  const spacingZ = rules.segmentLength;
  const cols = Math.max(2, Math.min(Math.round((hx * 2) / spacingX), 30));
  const rows = Math.max(2, Math.min(Math.round((hz * 2) / spacingZ), 30));
  const dx = (hx * 2) / cols;
  const dz = (hz * 2) / rows;
  const jitter = (1 - rules.gridness) * 0.42;
  const nodes: StreetVec2[] = [];
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      if (nodes.length >= MAX_NODES) break;
      const baseX = -hx + i * dx;
      const baseZ = -hz + j * dz;
      // Edge-column/row nodes keep their x/z pinned to the rim so the network fills the footprint.
      const jx = i === 0 || i === cols ? 0 : (rng() - 0.5) * dx * jitter;
      const jz = j === 0 || j === rows ? 0 : (rng() - 0.5) * dz * jitter;
      const x = Math.max(-hx, Math.min(hx, baseX + jx));
      const z = Math.max(-hz, Math.min(hz, baseZ + jz));
      nodes.push([x, z]);
    }
  }
  const stride = cols + 1;
  return { nodes, cols, rows, index: (i, j) => j * stride + i };
}

interface Uf {
  find: (a: number) => number;
  union: (a: number, b: number) => boolean;
}

function makeUf(n: number): Uf {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]!]!;
      a = parent[a]!;
    }
    return a;
  };
  return {
    find,
    union: (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return false;
      parent[ra] = rb;
      return true;
    },
  };
}

/** Fisher-Yates over an index array using a seeded stream. */
function shuffled(n: number, rng: () => number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
  return arr;
}

interface RawEdge {
  a: number;
  b: number;
  lane: boolean;
  /** Pre-sampled centerline for this edge (circuit spline edges). When present the assembler uses it
   *  verbatim instead of re-synthesizing a wandered chord between the endpoint nodes. `points[0]` sits on
   *  node `a`, the last on node `b`. */
  points?: StreetVec2[];
  /** Designed road heights, one per `points` (circuit edges), used verbatim instead of the field. */
  heights?: number[];
}

/** Grow the open street NET: lattice nodes, a spanning tree (guaranteed connectivity), then chords,
 *  loop-closing reconnections, and spur lanes — all driven by the sliders. */
function buildNet(
  rules: StreetRules,
  hx: number,
  hz: number,
  streams: (s: string) => () => number,
): { nodes: StreetVec2[]; edges: RawEdge[] } {
  const lattice = seedLattice(rules, hx, hz, streams("lattice"));
  const nodes = lattice.nodes;
  const { cols, rows, index } = lattice;
  // Candidate lattice edges: right + down neighbors.
  const candidates: RawEdge[] = [];
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const here = index(i, j);
      if (here >= nodes.length) continue;
      if (i < cols) {
        const r = index(i + 1, j);
        if (r < nodes.length) candidates.push({ a: here, b: r, lane: false });
      }
      if (j < rows) {
        const d = index(i, j + 1);
        if (d < nodes.length) candidates.push({ a: here, b: d, lane: false });
      }
    }
  }
  const order = shuffled(candidates.length, streams("tree"));
  const uf = makeUf(nodes.length);
  const chosen = new Array<boolean>(candidates.length).fill(false);
  // 1. spanning tree — every node reachable ("roads that actually connect").
  for (const idx of order) {
    const e = candidates[idx]!;
    if (uf.union(e.a, e.b)) chosen[idx] = true;
  }
  // 2. connectivity chords — extra mesh edges close grid loops.
  const chordRng = streams("chords");
  for (let k = 0; k < candidates.length; k += 1) {
    if (chosen[k]) continue;
    if (chordRng() < rules.connectivity) chosen[k] = true;
  }
  const edges: RawEdge[] = [];
  for (let k = 0; k < candidates.length; k += 1) if (chosen[k]) edges.push(candidates[k]!);

  // 3. loopiness — reconnect leaf dead-ends into loops (add a chord to a nearby non-neighbor).
  const degree = new Array<number>(nodes.length).fill(0);
  const adj = new Map<number, Set<number>>();
  const addAdj = (a: number, b: number): void => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
    increment(degree, a);
    increment(degree, b);
  };
  for (const e of edges) addAdj(e.a, e.b);
  // A new chord/spur must keep the graph PLANAR: it may not cross or shadow any edge it does not
  // share a node with — otherwise two roads overlap mid-segment with no junction node, and every
  // downstream consumer (blocks, lots, renderers) sees pavement crossing pavement with no crossing.
  const corridorClear = rules.width * 1.6;
  const chordClear = (a: StreetVec2, b: StreetVec2, endA: number, endB: number): boolean => {
    for (const e of edges) {
      if (e.a === endA || e.b === endA || e.a === endB || e.b === endB) continue;
      if (segSegDistance(a, b, nodes[e.a]!, nodes[e.b]!) < corridorClear) return false;
    }
    return true;
  };
  const loopRng = streams("loops");
  for (let n = 0; n < nodes.length; n += 1) {
    if (degree[n] !== 1) continue;
    const keep = loopRng() < rules.deadEnds;
    if (keep) continue; // becomes a cul-de-sac
    if (loopRng() > rules.loopiness + 0.15) continue; // otherwise mostly left as-is
    // Reconnect to the nearest node that isn't already a neighbor, forming a loop — but only via a
    // chord that stays clear of every unrelated edge (no node-less crossings).
    let best = -1;
    let bestD = Infinity;
    for (let m = 0; m < nodes.length; m += 1) {
      if (m === n || adj.get(n)?.has(m)) continue;
      const d = Math.hypot(nodes[n]![0] - nodes[m]![0], nodes[n]![1] - nodes[m]![1]);
      if (d < bestD && d < rules.segmentLength * 1.8 && chordClear(nodes[n]!, nodes[m]!, n, m)) {
        bestD = d;
        best = m;
      }
    }
    if (best >= 0) {
      edges.push({ a: n, b: best, lane: false });
      addAdj(n, best);
    }
  }

  // 4. branching — spur lanes (alleys) forking off MID-BLOCK, ending in a fresh cul-de-sac node.
  // An alley leaves its street at a right angle from the middle of a block face — never from a
  // junction (where it would shadow a road) and never at a random diagonal (which reads as a
  // glitch cutting through the grid). The host edge is split at the branch point so the graph
  // stays planar and the crossing is a real T node.
  const laneCount = Math.min(Math.round(rules.branching * nodes.length * 0.6), MAX_LANES);
  const branchRng = streams("branches");
  for (let b = 0; b < laneCount && nodes.length + 2 <= MAX_NODES && edges.length + 2 <= MAX_EDGES; b += 1) {
    const ei = Math.floor(branchRng() * edges.length);
    const hostEdge = edges[ei]!;
    const tRoll = 0.35 + branchRng() * 0.3;
    const sideRoll = branchRng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    const jitter = (branchRng() - 0.5) * (1 - rules.gridness) * (Math.PI / 2) * 0.8;
    const baseLen = rules.segmentLength * (0.6 + branchRng() * 0.7);
    if (hostEdge.lane) continue; // alleys fork off streets, not off other alleys
    const pa = nodes[hostEdge.a]!;
    const pb = nodes[hostEdge.b]!;
    const hostLen = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    if (hostLen < rules.segmentLength * 0.5) continue; // too short a face to host an alley
    const mid: StreetVec2 = [pa[0] + (pb[0] - pa[0]) * tRoll, pa[1] + (pb[1] - pa[1]) * tRoll];
    const edgeDir = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
    // Try both perpendicular sides and progressively shorter lanes until one candidate keeps the
    // graph planar and clear — a blocked alley shrinks before it is abandoned.
    let tip: StreetVec2 | null = null;
    for (const flip of [0, Math.PI]) {
      if (tip !== null) break;
      for (const lenF of [1, 0.72, 0.52]) {
        const angle = edgeDir + sideRoll + flip + jitter;
        const len = baseLen * lenF;
        if (len < rules.segmentLength * 0.3) break;
        const nx = mid[0] + Math.cos(angle) * len;
        const nz = mid[1] + Math.sin(angle) * len;
        if (Math.abs(nx) > hx - 1 || Math.abs(nz) > hz - 1) continue;
        // Reject spurs whose tip would land on top of an existing node.
        let clash = false;
        for (let m = 0; m < nodes.length; m += 1) {
          if (Math.hypot(nodes[m]![0] - nx, nodes[m]![1] - nz) < rules.segmentLength * 0.45) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        // Planarity: the spur may not cross/shadow any edge other than the host it forks from.
        const candidate: StreetVec2 = [nx, nz];
        let blocked = false;
        for (let k = 0; k < edges.length; k += 1) {
          if (k === ei) continue;
          const e = edges[k]!;
          if (segSegDistance(mid, candidate, nodes[e.a]!, nodes[e.b]!) < corridorClear) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          tip = candidate;
          break;
        }
      }
    }
    if (tip === null) continue;
    const midId = nodes.length;
    nodes.push(mid);
    const tipId = nodes.length;
    nodes.push(tip);
    // Split the host edge at the branch point; both halves keep the host's street role.
    edges[ei] = { a: hostEdge.a, b: midId, lane: false };
    edges.push({ a: midId, b: hostEdge.b, lane: false });
    edges.push({ a: midId, b: tipId, lane: true });
  }
  return { nodes, edges: edges.slice(0, MAX_EDGES) };
}

/** True when segments p1–p2 and p3–p4 intersect (including touching). */
function segSegIntersects(p1: StreetVec2, p2: StreetVec2, p3: StreetVec2, p4: StreetVec2): boolean {
  const rx = p2[0] - p1[0];
  const rz = p2[1] - p1[1];
  const sx = p4[0] - p3[0];
  const sz = p4[1] - p3[1];
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-12) return false; // parallel — the distance test covers overlap
  const t = ((p3[0] - p1[0]) * sz - (p3[1] - p1[1]) * sx) / denom;
  const u = ((p3[0] - p1[0]) * rz - (p3[1] - p1[1]) * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Minimum distance between two line segments in the XZ plane (0 when they intersect). */
function segSegDistance(p1: StreetVec2, p2: StreetVec2, p3: StreetVec2, p4: StreetVec2): number {
  if (segSegIntersects(p1, p2, p3, p4)) return 0;
  const pointSeg = (p: StreetVec2, a: StreetVec2, b: StreetVec2): number => {
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const l2 = abx * abx + abz * abz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
    return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
  };
  return Math.min(pointSeg(p1, p3, p4), pointSeg(p2, p3, p4), pointSeg(p3, p1, p2), pointSeg(p4, p1, p2));
}

/**
 * Distribute a designed circuit loop into the `{nodes, edges}` graph contract: nodes land ON the line at
 * every straight↔curve boundary, at every `forced` sample (pit entry/exit), and every ~`segmentLength` of
 * arc inside curved runs; each straight run stays a single edge. Every edge carries its exact sampled
 * sub-arc (and road heights when present), so the designed centerline survives assembly verbatim.
 * @internal
 */
function distributeLoopEdges(
  loop: readonly StreetVec2[],
  straight: readonly boolean[],
  segmentLength: number,
  forced: readonly number[],
  heights: readonly number[] | undefined,
): { nodes: StreetVec2[]; edges: RawEdge[]; nodeAt: Map<number, number> } {
  const P = loop.length;
  const isNode = new Array<boolean>(P).fill(false);
  isNode[0] = true;
  for (const i of forced) isNode[i] = true;
  for (let i = 0; i < P; i += 1) if (straight[i] !== straight[(i - 1 + P) % P]) isNode[i] = true; // run boundary
  let acc = 0;
  for (let i = 1; i <= P; i += 1) {
    const cur = i % P;
    const prev = (i - 1 + P) % P;
    acc += Math.hypot(loop[cur]![0] - loop[prev]![0], loop[cur]![1] - loop[prev]![1]);
    if (isNode[cur]) {
      acc = 0;
      continue;
    }
    if (!straight[cur] && acc >= segmentLength) {
      isNode[cur] = true;
      acc = 0;
    }
  }
  const nodeIdx: number[] = [];
  for (let i = 0; i < P; i += 1) if (isNode[i]) nodeIdx.push(i);
  const nodes: StreetVec2[] = nodeIdx.map((i) => [loop[i]![0], loop[i]![1]] as StreetVec2);
  const nodeAt = new Map<number, number>(nodeIdx.map((i, k) => [i, k]));
  const K = nodeIdx.length;
  const edges: RawEdge[] = [];
  for (let e = 0; e < K; e += 1) {
    const from = nodeIdx[e]!;
    const to = nodeIdx[(e + 1) % K]!;
    const points: StreetVec2[] = [[loop[from]![0], loop[from]![1]]];
    const edgeHeights: number[] = [heights?.[from] ?? 0];
    let idx = from;
    do {
      idx = (idx + 1) % P;
      points.push([loop[idx]![0], loop[idx]![1]]);
      edgeHeights.push(heights?.[idx] ?? 0);
    } while (idx !== to);
    edges.push({ a: e, b: (e + 1) % K, lane: false, points, ...(heights === undefined ? {} : { heights: edgeHeights }) });
  }
  return { nodes, edges, nodeAt };
}

/**
 * Grow a closed race CIRCUIT: the {@link designCircuit} lap — straights and corner complexes from a
 * corner grammar, closed at `lapLength` and fitted to the volume — distributed into node-to-node loop
 * edges (nodes ON the designed line, each edge carrying its sampled arc and road heights), plus the
 * designed pit lane as three lane edges that split off the start straight and rejoin it (two degree-3
 * junctions, never a dead-end stub).
 */
function buildCircuit(
  rules: StreetRules,
  hx: number,
  hz: number,
  streams: (s: string) => () => number,
): { nodes: StreetVec2[]; edges: RawEdge[]; design: CircuitDesign } {
  const design = designCircuit({
    lapLength: rules.lapLength,
    halfX: hx,
    halfZ: hz,
    width: rules.width,
    winding: rules.winding,
    gridness: rules.gridness,
    compactness: rules.compactness,
    minRadius: rules.minCurveRadius,
    crossover: rules.crossover,
    pitLane: rules.branching > 0.25,
    maxGrade: rules.maxGrade,
    elevationAt: streetElevationField(rules, rules.seed),
    streams,
  });
  const loop = design.centerline;
  const P = loop.length;
  const indexAt = (s: number): number => ((Math.floor(s / design.step + SAMPLE_ROUND) % P) + P) % P;
  const pit = design.pit;
  const forced = pit === undefined ? [] : [indexAt(pit.entry), indexAt(pit.exit)];
  const { nodes, edges, nodeAt } = distributeLoopEdges(loop, design.straight, rules.segmentLength, forced, design.heights);
  if (pit !== undefined && pit.points.length >= 6) {
    const m = pit.points.length;
    const cutA = Math.max(1, Math.round(m * 0.22));
    const cutB = Math.min(m - 2, Math.round(m * 0.78));
    const entryNode = nodeAt.get(forced[0]!)!;
    const exitNode = nodeAt.get(forced[1]!)!;
    const idA = nodes.length;
    nodes.push(pit.points[cutA]!);
    const idB = nodes.length;
    nodes.push(pit.points[cutB]!);
    const slice = (from: number, to: number): { points: StreetVec2[]; heights?: number[] } => ({
      points: pit.points.slice(from, to + 1).map((p) => [p[0], p[1]] as StreetVec2),
      ...(pit.heights === undefined ? {} : { heights: pit.heights.slice(from, to + 1) }),
    });
    edges.push({ a: entryNode, b: idA, lane: true, ...slice(0, cutA) });
    edges.push({ a: idA, b: idB, lane: true, ...slice(cutA, cutB) });
    edges.push({ a: idB, b: exitNode, lane: true, ...slice(cutB, m - 1) });
  }
  return { nodes, edges, design };
}

/** Decide which topology family the sliders call for. Circuit wins when loops dominate and both
 *  branching and mesh connectivity are low — exactly the "race track" corner of the slider space.
 *  @internal */
export function streetNetworkMode(rules: Pick<StreetNetworkParams, "loopiness" | "branching" | "connectivity">): StreetNetworkMode {
  const score = rules.loopiness * (1 - rules.branching * 0.7) * (1 - rules.connectivity * 0.7);
  return score >= 0.45 ? "circuit" : "net";
}

/** Sampled-source shortest-path (Brandes) node betweenness over the unweighted node graph. Sources are
 *  a deterministic even sample of at most {@link BETWEENNESS_SOURCES} nodes so the work stays bounded. */
function nodeBetweenness(n: number, adjNodes: number[][]): number[] {
  const bt = new Array<number>(n).fill(0);
  if (n === 0) return bt;
  const sources: number[] = [];
  const stride = Math.max(1, Math.ceil(n / BETWEENNESS_SOURCES));
  for (let s = 0; s < n; s += stride) sources.push(s);
  const dist = new Array<number>(n);
  const sigma = new Array<number>(n);
  const delta = new Array<number>(n);
  const preds: number[][] = Array.from({ length: n }, () => []);
  const queue = new Array<number>(n);
  const stack = new Array<number>(n);
  for (const src of sources) {
    for (let i = 0; i < n; i += 1) {
      dist[i] = -1;
      sigma[i] = 0;
      delta[i] = 0;
      preds[i]!.length = 0;
    }
    dist[src] = 0;
    sigma[src] = 1;
    let head = 0;
    let tail = 0;
    let top = 0;
    queue[tail++] = src;
    while (head < tail) {
      const v = queue[head++]!;
      stack[top++] = v;
      for (const w of adjNodes[v]!) {
        if (dist[w]! < 0) {
          dist[w] = dist[v]! + 1;
          queue[tail++] = w;
        }
        if (dist[w] === dist[v]! + 1) {
          sigma[w]! += sigma[v]!;
          preds[w]!.push(v);
        }
      }
    }
    while (top > 0) {
      const w = stack[--top]!;
      for (const v of preds[w]!) {
        delta[v]! += (sigma[v]! / sigma[w]!) * (1 + delta[w]!);
      }
      if (w !== src) bt[w]! += delta[w]!;
    }
  }
  return bt;
}

interface LevelContext {
  bt: number[];
  degree: number[];
  isRim: (node: number) => boolean;
  /** For each boundary node, the chain indices that terminate there. */
  chainsAt: Map<number, number[]>;
}

/**
 * Assign the road hierarchy STRUCTURALLY: spurs are lanes; a high-centrality connected skeleton
 * (arteries) becomes avenues/boulevards; everything else is a local street. Arterial chains never
 * dead-end at an interior junction whose other roads are all lower level — such a chain is extended
 * through the most-central neighbor or demoted. A `boulevards` share of arteries upgrade to boulevard.
 */
function levelForStreets(
  chains: { nodes: number[]; length: number; lane: boolean; loop: boolean }[],
  rules: StreetRules,
  rng: () => number,
  ctx: LevelContext,
): StreetLevel[] {
  const levels = new Array<StreetLevel>(chains.length).fill("street");
  // Centrality score per non-lane chain: sum of endpoint-node betweenness weighted by chain length.
  const score = chains.map((c) => {
    if (c.lane) return -1;
    let s = 0;
    for (const nid of c.nodes) s += ctx.bt[nid] ?? 0;
    return s * Math.max(1, c.length);
  });
  const nonLane = chains.map((_, i) => i).filter((i) => !chains[i]!.lane);
  const arterial = new Set<number>();
  const ranked = nonLane.slice().sort((a, b) => score[b]! - score[a]!);
  const arterialCut = Math.max(1, Math.ceil(nonLane.length * 0.28));
  for (let r = 0; r < ranked.length && arterial.size < arterialCut; r += 1) arterial.add(ranked[r]!);

  // A wide road must never stub out mid-district: an arterial chain whose end dangles at an
  // INTERIOR degree-1 node is demoted to a local street — cul-de-sacs are fine for streets and
  // lanes, but a boulevard/avenue that just stops mid-map reads as broken pavement. Rim endpoints
  // stay arterial (the road exits the district).
  const interiorDeadEnd = (ci: number): boolean => {
    const chain = chains[ci]!;
    if (chain.loop) return false;
    for (const endNode of [chain.nodes[0]!, chain.nodes[chain.nodes.length - 1]!]) {
      if ((ctx.degree[endNode] ?? 0) <= 1 && !ctx.isRim(endNode)) return true;
    }
    return false;
  };
  // Connectivity repair: an arterial chain must not terminate at an interior junction whose other
  // chains are all non-arterial, and must not dead-end at an interior node. Extend through the
  // most-central non-stub neighbor, or demote when impossible.
  const bestNeighborAt = (node: number, self: number): number => {
    const here = ctx.chainsAt.get(node) ?? [];
    let best = -1;
    let bestScore = -Infinity;
    for (const ci of here) {
      if (ci === self || chains[ci]!.lane || arterial.has(ci) || interiorDeadEnd(ci)) continue;
      if (score[ci]! > bestScore) {
        bestScore = score[ci]!;
        best = ci;
      }
    }
    return best;
  };
  let guard = 0;
  const maxGuard = chains.length * 4 + 8;
  let changed = true;
  while (changed && guard < maxGuard) {
    changed = false;
    guard += 1;
    for (const ci of Array.from(arterial)) {
      const chain = chains[ci]!;
      if (chain.loop) continue; // a closed ring has no dangling terminus
      if (interiorDeadEnd(ci)) {
        arterial.delete(ci);
        changed = true;
        continue;
      }
      for (const endNode of [chain.nodes[0]!, chain.nodes[chain.nodes.length - 1]!]) {
        if (ctx.isRim(endNode)) continue; // rim endpoints are fine
        if ((ctx.degree[endNode] ?? 0) < 2) continue; // unreachable for arterials (demoted above)
        const here = ctx.chainsAt.get(endNode) ?? [];
        const connected = here.some((other) => other !== ci && arterial.has(other));
        if (connected) continue;
        const ext = bestNeighborAt(endNode, ci);
        if (ext >= 0) {
          arterial.add(ext);
          changed = true;
        } else {
          arterial.delete(ci);
          changed = true;
        }
        break;
      }
    }
  }
  if (arterial.size === 0 && ranked.length > 0) {
    const fallback = ranked.find((ci) => !interiorDeadEnd(ci)) ?? ranked[0]!;
    arterial.add(fallback);
  }

  for (let ci = 0; ci < chains.length; ci += 1) {
    if (chains[ci]!.lane) {
      levels[ci] = "lane";
    } else if (arterial.has(ci)) {
      levels[ci] = rng() < rules.boulevards ? "boulevard" : "avenue";
    }
  }
  return levels;
}

/** True when some segment of the polyline lies closer than `reach` to the point (keeps sidewalk vertices off the road surface). */
function pointNearPolyline(px: number, pz: number, line: readonly StreetVec2[], reach: number): boolean {
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    // A segment whose box lies beyond `reach` on either axis cannot be that close, so skip its distance.
    if (
      Math.min(a[0], b[0]) - px > reach || px - Math.max(a[0], b[0]) > reach ||
      Math.min(a[1], b[1]) - pz > reach || pz - Math.max(a[1], b[1]) > reach
    ) continue;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const l2 = abx * abx + abz * abz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / l2));
    if (Math.hypot(px - (a[0] + abx * t), pz - (a[1] + abz * t)) < reach) return true;
  }
  return false;
}

/**
 * 2D segment/segment proper-intersection test (shared endpoints don't count). An endpoint within a
 * hair (1e-7 of the segment lengths) of the other segment's line counts as touching, not crossing: a
 * near-collinear run of offset points otherwise reads as crossing or not on the last bit of libm noise.
 * @internal
 */
export function segmentsCross(p1: StreetVec2, p2: StreetVec2, p3: StreetVec2, p4: StreetVec2): boolean {
  const d = (a: StreetVec2, b: StreetVec2, c: StreetVec2): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const tolerance = 1e-7 * Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * Math.hypot(p4[0] - p3[0], p4[1] - p3[1]);
  const side = (value: number): number => (value > tolerance ? 1 : value < -tolerance ? -1 : 0);
  const d1 = side(d(p3, p4, p1));
  const d2 = side(d(p3, p4, p2));
  const d3 = side(d(p1, p2, p3));
  const d4 = side(d(p1, p2, p4));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Offset a road centerline sideways into a clean, parallel SIDEWALK polyline (positive `dist` = left of
 * travel). This is a real polyline offset, not a naive per-vertex normal push: on the OUTSIDE of a bend
 * it inserts arc samples around the corner so the band stays parallel; on the INSIDE it clamps the miter
 * to the offset distance (never blowing out into a spike). A cleanup pass then WELDS pinched inside
 * corners — dropping any vertex that lands closer than `dist·0.9` to the road, and any vertex whose two
 * incident offset segments cross — so the sidewalk can never dip inside the road surface or self-loop
 * (the z-fighting/pinch defect). Endpoints are preserved.
 */
function offsetPolyline(points: readonly StreetVec2[], dist: number): StreetVec2[] {
  // Deduplicate coincident vertices so segment directions are well-defined.
  const src: StreetVec2[] = [];
  for (const p of points) {
    const last = src[src.length - 1];
    if (last === undefined || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) src.push([p[0], p[1]]);
  }
  const m = src.length;
  const absd = Math.abs(dist);
  if (m < 2) return src.map((p) => [p[0] + dist, p[1]] as StreetVec2);
  // Per-segment unit direction + left normal.
  const nrm: StreetVec2[] = [];
  for (let i = 0; i + 1 < m; i += 1) {
    const dx = src[i + 1]![0] - src[i]![0];
    const dz = src[i + 1]![1] - src[i]![1];
    const l = Math.hypot(dx, dz) || 1;
    nrm.push([-dz / l, dx / l]);
  }
  const out: StreetVec2[] = [];
  out.push([src[0]![0] + dist * nrm[0]![0], src[0]![1] + dist * nrm[0]![1]]);
  for (let i = 1; i + 1 < m; i += 1) {
    const P = src[i]!;
    const nP = nrm[i - 1]!;
    const nN = nrm[i]!;
    // Turn sign from the two segment directions (left normal rotated back gives the tangent).
    const dPx = nP[1];
    const dPz = -nP[0];
    const dNx = nN[1];
    const dNz = -nN[0];
    const cross = dPx * dNz - dPz * dNx; // >0 = left turn
    if (Math.abs(cross) < 1e-5) {
      out.push([P[0] + dist * nN[0], P[1] + dist * nN[1]]);
      continue;
    }
    const inside = cross * dist > 0; // offset side is the concave (inside) side of the bend
    if (inside) {
      // Miter clamped to the offset distance so the inside never spikes past `absd` from the corner.
      let bx = nP[0] + nN[0];
      let bz = nP[1] + nN[1];
      const bl = Math.hypot(bx, bz) || 1;
      bx /= bl;
      bz /= bl;
      out.push([P[0] + bx * dist, P[1] + bz * dist]);
    } else {
      // Outside: arc of radius `absd` around the corner from the prev band edge to the next.
      const aPrev: StreetVec2 = [P[0] + dist * nP[0], P[1] + dist * nP[1]];
      const aNext: StreetVec2 = [P[0] + dist * nN[0], P[1] + dist * nN[1]];
      const a0 = Math.atan2(aPrev[1] - P[1], aPrev[0] - P[0]);
      const a1 = Math.atan2(aNext[1] - P[1], aNext[0] - P[0]);
      let delta = a1 - a0;
      while (delta > Math.PI) delta -= TAU;
      while (delta < -Math.PI) delta += TAU;
      const segs = Math.max(1, Math.ceil(Math.abs(delta) / MAX_ARC_STEP_RAD));
      for (let s = 0; s <= segs; s += 1) {
        const ang = a0 + (delta * s) / segs;
        out.push([P[0] + absd * Math.cos(ang), P[1] + absd * Math.sin(ang)]);
      }
    }
  }
  out.push([src[m - 1]![0] + dist * nrm[m - 2]![0], src[m - 1]![1] + dist * nrm[m - 2]![1]]);
  return weldOffset(out, src, absd);
}

/** Cleanup pass over a raw offset polyline: WELD pinched inside corners — drop any interior vertex that
 *  lands nearer than `absd·0.9` to the road, that spikes back on itself (a sharp consecutive backtrack),
 *  or whose incident segments cross — so the sidewalk stays a clean parallel band. Endpoints stay. */
function weldOffset(raw: StreetVec2[], centerline: readonly StreetVec2[], absd: number): StreetVec2[] {
  let pts = raw;
  const floor = absd * 0.9;
  // Pass 1: drop road-pinching interior vertices.
  const kept: StreetVec2[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    if (i === 0 || i === pts.length - 1) {
      kept.push(pts[i]!);
      continue;
    }
    if (pointNearPolyline(pts[i]![0], pts[i]![1], centerline, floor)) continue; // welded away
    kept.push(pts[i]!);
  }
  pts = kept;
  // Pass 2: remove backtrack spikes and collapse local self-loops. A backtrack (interior turn > ~100°)
  // is a fold the naive offset leaves inside the road band; a windowed crossing is a small self-loop.
  const spikeCos = Math.cos((100 * Math.PI) / 180); // turn sharper than this folds back
  const WINDOW = 6; // collapse self-loops spanning up to this many segments
  let guard = 0;
  let changed = true;
  while (changed && guard < pts.length * 2 + 8) {
    changed = false;
    guard += 1;
    // Collapse the nearest self-loop (segment i crossing a segment up to WINDOW ahead).
    for (let i = 0; i + 1 < pts.length && !changed; i += 1) {
      for (let j = i + 2; j + 1 < pts.length && j <= i + WINDOW; j += 1) {
        if (segmentsCross(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!)) {
          pts.splice(i + 1, j - i); // drop the looped vertices i+1..j, welding i to j+1
          changed = true;
          break;
        }
      }
    }
    if (changed) continue;
    // Drop backtrack spikes.
    for (let i = 1; i + 1 < pts.length; i += 1) {
      const a = pts[i - 1]!;
      const v = pts[i]!;
      const b = pts[i + 1]!;
      const ux = v[0] - a[0];
      const uz = v[1] - a[1];
      const vx = b[0] - v[0];
      const vz = b[1] - v[1];
      const lu = Math.hypot(ux, uz);
      const lv = Math.hypot(vx, vz);
      if (lu > 1e-6 && lv > 1e-6 && (ux * vx + uz * vz) / (lu * lv) < spikeCos) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/**
 * The road-surface elevation field {@link STREET_NETWORK_GENERATOR} drapes a network over for these
 * params and its seed, or `undefined` when the `elevation` dial is 0 (flat). It depends only on the
 * seed, the footprint and the dial, so a renderer can rebuild the same ground a generated network's
 * streets were laid on. Wholly separate from the `heightAt` ground input that drives bridges/tunnels.
 */
export function streetElevationField(
  params: Pick<StreetNetworkParams, "elevation" | "halfX" | "halfZ">,
  seed: string,
): ((x: number, z: number) => number) | undefined {
  if (params.elevation <= 0) return undefined;
  const hx = params.halfX;
  const hz = params.halfZ;
  const streams = seededStreams(`pathnet:${seed}:${Math.round(hx)}:${Math.round(hz)}`);
  // Dial 1 ≈ 22 m relief across a ~520 m volume, scaled to this footprint.
  return makeElevationField(streams("elevation"), Math.max(hx, hz) * 2, params.elevation * Math.max(hx, hz) * 2 * (22 / 520));
}

/**
 * Build the seeded smooth 2-D road-surface elevation FIELD: 3 octaves of sine/cos mixtures with
 * wavelengths scaled to the volume `extent`, normalized so the peak-to-peak relief ≈ `reliefMeters`.
 * Smooth by construction (no cliffs). Pure and deterministic given `rng`. The returned sampler is the
 * SHARED field — streets, edges, junctions, sidewalks, and building bases all read it for weld continuity.
 */
function makeElevationField(rng: () => number, extent: number, reliefMeters: number): (x: number, z: number) => number {
  const baseAmps = [1, 0.5, 0.28];
  const comps = baseAmps.map((amp, k) => {
    // Longest wavelength ≈ 0.9·extent (≈2 hills across the map), each octave shorter.
    const wl = extent * (0.9 - k * 0.26) * (0.85 + rng() * 0.3);
    const f = TAU / Math.max(1, wl);
    const dir = rng() * TAU;
    const dir2 = dir + Math.PI / 2 + (rng() - 0.5) * 0.8; // a second, near-perpendicular axis for real 2-D relief
    return {
      amp,
      f,
      dx: Math.cos(dir),
      dz: Math.sin(dir),
      ex: Math.cos(dir2),
      ez: Math.sin(dir2),
      ph1: rng() * TAU,
      ph2: rng() * TAU,
    };
  });
  const ampSum = comps.reduce((s, c) => s + c.amp, 0);
  const norm = reliefMeters / (2 * ampSum); // each component peaks at ±amp, so Σamp·norm = reliefMeters/2
  return (x: number, z: number): number => {
    let h = 0;
    for (const c of comps) {
      h += c.amp * (Math.sin((x * c.dx + z * c.dz) * c.f + c.ph1) * 0.6 + Math.cos((x * c.ex + z * c.ez) * c.f + c.ph2) * 0.4);
    }
    return h * norm;
  };
}

/**
 * Grade-cap a height sequence so no consecutive pair's slope exceeds `maxGrade`. Guaranteed-feasible
 * peak-shaving: each violating edge lowers only its HIGHER endpoint to `lower + maxGrade·dist`, a monotone
 * (strictly-decreasing) propagation that converges within a bounded pass count (the shave travels one edge
 * per pass; capped at the chain length) and, at a no-change pass, leaves every edge under the cap. A final
 * constant shift restores the field's mean — a uniform offset changes no slope, so crests are relaxed into
 * grade-legal ramps without dragging the whole road toward the valleys. For a `closed` loop
 * (points[0] === points[last]) the ring, INCLUDING the start/finish seam edge, is capped and the shared
 * vertex re-welded, so the lap stays continuous. Crests/dips read smooth because the sampled field is.
 */
function gradeCapHeights(points: readonly StreetVec2[], heights: number[], maxGrade: number, closed: boolean): number[] {
  const n = heights.length;
  if (n < 2) return heights.slice();
  const dist = (i: number, j: number): number => Math.hypot(points[i]![0] - points[j]![0], points[i]![1] - points[j]![1]);
  // Edge list of (a, b, maxDelta). For a closed ring collapse the duplicate last vertex onto the first.
  const uniq = closed && dist(0, n - 1) < 1e-6 ? n - 1 : n;
  const edges: { a: number; b: number; limit: number }[] = [];
  for (let i = 0; i + 1 < uniq; i += 1) edges.push({ a: i, b: i + 1, limit: maxGrade * dist(i, i + 1) });
  if (uniq < n) edges.push({ a: uniq - 1, b: 0, limit: maxGrade * dist(uniq - 1, n - 1) }); // seam edge
  const u = heights.slice(0, uniq);
  let meanBefore = 0;
  for (const v of u) meanBefore += v;
  meanBefore /= uniq;
  const maxPass = uniq * 2 + 8;
  let changed = true;
  for (let pass = 0; pass < maxPass && changed; pass += 1) {
    changed = false;
    for (const e of edges) {
      const diff = u[e.b]! - u[e.a]!;
      if (diff > e.limit) {
        u[e.b] = u[e.a]! + e.limit; // b too high → shave it down
        changed = true;
      } else if (diff < -e.limit) {
        u[e.a] = u[e.b]! + e.limit; // a too high → shave it down
        changed = true;
      }
    }
  }
  // Restore the mean with a constant offset (slopes are shift-invariant, so the cap still holds).
  let meanAfter = 0;
  for (const v of u) meanAfter += v;
  meanAfter /= uniq;
  const shift = meanBefore - meanAfter;
  const out: number[] = u.map((v) => v + shift);
  if (uniq < n) out.push(out[0]!); // re-weld the closing vertex to keep the loop continuous
  return out;
}

/** Grow the whole network for one params set, seed and ground input, in volume-local coordinates. */
function growStreets(rules: StreetRules, input: StreetNetworkInput): StreetNetwork {
  const hx = rules.halfX;
  const hz = rules.halfZ;
  const streams = seededStreams(`pathnet:${rules.seed}:${Math.round(hx)}:${Math.round(hz)}`);
  const mode = streetNetworkMode(rules);
  const raw: { nodes: StreetVec2[]; edges: RawEdge[]; design?: CircuitDesign } =
    mode === "circuit" ? buildCircuit(rules, hx, hz, streams) : buildNet(rules, hx, hz, streams);
  const design = raw.design;
  const rawNodes = raw.nodes;
  const rawEdges = raw.edges.filter((e) => e.a !== e.b);

  // --- degrees + adjacency over the atomic graph ---
  const degree = new Array<number>(rawNodes.length).fill(0);
  const adj: { edge: number; other: number }[][] = rawNodes.map(() => []);
  const adjNodes: number[][] = rawNodes.map(() => []);
  rawEdges.forEach((e, i) => {
    increment(degree, e.a);
    increment(degree, e.b);
    adj[e.a]!.push({ edge: i, other: e.b });
    adj[e.b]!.push({ edge: i, other: e.a });
    adjNodes[e.a]!.push(e.b);
    adjNodes[e.b]!.push(e.a);
  });

  // --- level per edge: chain length drives the hierarchy, so compute chains first (topology only). ---
  // A designed circuit carries its OWN sampled centerline per edge (loop and pit lane), used verbatim;
  // every city-net edge gets wandered.
  const edgeWander: StreetVec2[][] = rawEdges.map((e) =>
    // Clamp crests to the footprint so a curve near the rim never bulges outside the volume.
    (e.points ?? wanderEdge(rawNodes[e.a]!, rawNodes[e.b]!, streams(`edge:${e.a}:${e.b}`), rules)).map(
      ([x, z]) => [Math.max(-hx, Math.min(hx, x)), Math.max(-hz, Math.min(hz, z))] as StreetVec2,
    ),
  );
  const edgeLength = rawEdges.map(
    (_, i) => {
      const pts = edgeWander[i]!;
      let l = 0;
      for (let s = 1; s < pts.length; s += 1) l += Math.hypot(pts[s]![0] - pts[s - 1]![0], pts[s]![1] - pts[s - 1]![1]);
      return l;
    },
  );

  // Chain atomic edges through degree-2 nodes into maximal streets (split at junctions/dead-ends).
  const usedEdge = new Array<boolean>(rawEdges.length).fill(false);
  const isChainThrough = (n: number): boolean => degree[n] === 2 && !rawEdges.some((e, i) => (e.a === n || e.b === n) && rawEdges[i]!.lane);
  interface Chain {
    nodes: number[];
    edges: number[];
    length: number;
    lane: boolean;
    loop: boolean;
  }
  const chains: Chain[] = [];
  // In a street net, a chain ends where the road bends hard, so streets read as straight runs (and a
  // pure grid stays axis-aligned); a circuit chains its whole ring through every gentle corner.
  const chainSplit = mode === "circuit" ? Math.PI : (55 * Math.PI) / 180;
  const chordTurn = (prev: number, mid: number, next: number): number => {
    const ux = rawNodes[mid]![0] - rawNodes[prev]![0];
    const uz = rawNodes[mid]![1] - rawNodes[prev]![1];
    const vx = rawNodes[next]![0] - rawNodes[mid]![0];
    const vz = rawNodes[next]![1] - rawNodes[mid]![1];
    const lu = Math.hypot(ux, uz);
    const lv = Math.hypot(vx, vz);
    if (lu < 1e-6 || lv < 1e-6) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv))));
  };
  const walkFrom = (startEdge: number): void => {
    if (usedEdge[startEdge]) return;
    const e0 = rawEdges[startEdge]!;
    // Grow both directions from this edge through degree-2 pass-through nodes.
    const nodesSeq = [e0.a, e0.b];
    const edgeSeq = [startEdge];
    usedEdge[startEdge] = true;
    const lane = e0.lane;
    // Extend forward off nodesSeq[last], then backward off nodesSeq[0].
    const extend = (dir: 1 | -1): void => {
      while (true) {
        const tip = dir === 1 ? nodesSeq[nodesSeq.length - 1]! : nodesSeq[0]!;
        if (!isChainThrough(tip)) break;
        const nextConn = adj[tip]!.find((c) => !usedEdge[c.edge]);
        if (nextConn === undefined) break;
        if (rawEdges[nextConn.edge]!.lane !== lane) break;
        const prevTip = dir === 1 ? nodesSeq[nodesSeq.length - 2]! : nodesSeq[1]!;
        if (chordTurn(prevTip, tip, nextConn.other) > chainSplit) break; // road bends hard → end street
        usedEdge[nextConn.edge] = true;
        if (dir === 1) {
          // Closing the loop = reaching the far (unchanging) end, which is index 0 going forward.
          const closed = nextConn.other === nodesSeq[0];
          nodesSeq.push(nextConn.other);
          edgeSeq.push(nextConn.edge);
          if (closed) break;
        } else {
          // Going backward the far end is the last index, fixed while we prepend.
          const closed = nextConn.other === nodesSeq[nodesSeq.length - 1];
          nodesSeq.unshift(nextConn.other);
          edgeSeq.unshift(nextConn.edge);
          if (closed) break;
        }
      }
    };
    extend(1);
    extend(-1);
    let length = 0;
    for (const ei of edgeSeq) length += edgeLength[ei]!;
    const loop = nodesSeq.length > 2 && nodesSeq[0] === nodesSeq[nodesSeq.length - 1];
    chains.push({ nodes: nodesSeq, edges: edgeSeq, length, lane, loop });
  };
  // Prefer starting chains at junctions/dead-ends so through-streets read whole.
  for (let n = 0; n < rawNodes.length; n += 1) {
    if (degree[n] === 2) continue;
    for (const c of adj[n]!) walkFrom(c.edge);
  }
  for (let i = 0; i < rawEdges.length; i += 1) walkFrom(i); // leftover pure loops

  // --- structural hierarchy: betweenness centrality + connectivity repair ---
  const bt = nodeBetweenness(rawNodes.length, adjNodes);
  const rimEps = 0.5;
  const isRim = (node: number): boolean => {
    const p = rawNodes[node];
    return p !== undefined && (Math.abs(p[0]) >= hx - rimEps || Math.abs(p[1]) >= hz - rimEps);
  };
  const chainsAt = new Map<number, number[]>();
  chains.forEach((chain, ci) => {
    if (chain.loop) return;
    for (const endNode of [chain.nodes[0]!, chain.nodes[chain.nodes.length - 1]!]) {
      (chainsAt.get(endNode) ?? chainsAt.set(endNode, []).get(endNode)!).push(ci);
    }
  });
  const levels = levelForStreets(chains, rules, streams("levels"), { bt, degree, isRim, chainsAt });
  const edgeLevel = new Array<StreetLevel>(rawEdges.length).fill("street");
  chains.forEach((chain, ci) => {
    for (const ei of chain.edges) edgeLevel[ei] = levels[ci]!;
  });

  // --- road-surface elevation field (opt-in; flat + byte-identical when the dial is 0) ---
  const maxGrade = rules.maxGrade;
  const elevationAt = streetElevationField(rules, rules.seed);

  // --- assemble atomic edges ---
  const minRad = (rules.minTurnAngle * Math.PI) / 180;
  const maxRad = (rules.maxTurnAngle * Math.PI) / 180;
  const sidewalkWidth = rules.sidewalkWidth;
  const edges: StreetEdge[] = rawEdges.map((e, i) => {
    const edge: StreetEdge = {
      id: i,
      a: e.a,
      b: e.b,
      points: edgeWander[i]!,
      width: design === undefined ? rules.width * WIDTH_MULT[edgeLevel[i]!] : e.lane ? (design.pit?.width ?? design.width) : design.width,
      level: edgeLevel[i]!,
      loop: mode === "circuit" && !e.lane,
    };
    // A designed circuit's own road profile; otherwise raw (uncapped) field samples for continuity — the
    // grade-limited profile lives on the owning street.
    if (e.heights !== undefined) edge.heights = e.heights.slice();
    else if (elevationAt) edge.heights = edge.points.map((p) => elevationAt(p[0], p[1]));
    return edge;
  });

  // --- assemble chained streets (smoothed geometry for rendering) ---
  const heightAt = input.heightAt;
  const streets: Street[] = [];
  chains.forEach((chain, ci) => {
    if (streets.length >= MAX_STREETS) return;
    const level = levels[ci]!;
    const width = design === undefined ? rules.width * WIDTH_MULT[level] : chain.lane ? (design.pit?.width ?? design.width) : design.width;
    // Concatenate the chain's atomic wander polylines (dropping duplicated shared vertices).
    const pts: StreetVec2[] = [];
    const designedHeights: number[] = [];
    chain.edges.forEach((ei, k) => {
      const e = rawEdges[ei]!;
      let seg = edgeWander[ei]!;
      let segHeights = e.heights;
      // Orient the segment so it continues the chain's node order.
      const wantStart = chain.nodes[k]!;
      if (e.b === wantStart && e.a !== wantStart) {
        seg = [...seg].reverse();
        segHeights = segHeights === undefined ? undefined : [...segHeights].reverse();
      }
      for (let s = 0; s < seg.length; s += 1) {
        if (pts.length > 0 && s === 0) continue;
        pts.push(seg[s]!);
        designedHeights.push(segHeights?.[s] ?? 0);
      }
    });
    // A designed circuit's concatenated edge samples ARE the final centerline (loop and pit lane), so
    // they skip the polygon fillet; city nets fillet their corners at `minCurveRadius`.
    const smooth = design !== undefined ? pts.map((p) => [p[0], p[1]] as StreetVec2) : clampTurns(pts, minRad, maxRad, rules.minCurveRadius, chain.loop);
    const street: Street = {
      id: streets.length,
      nodes: chain.nodes,
      points: smooth,
      width,
      level,
      loop: chain.loop,
      features: [],
    };
    // A designed circuit carries its own grade-capped profile (crests, a figure-8 flyover); otherwise
    // grade-limited heights sampled from the shared field (loops stay continuous at the seam).
    if (design?.heights !== undefined) {
      street.heights = designedHeights;
      for (const crossing of design.crossings) street.features.push(...flyoverSpans(smooth, designedHeights, crossing, design.width));
    } else if (elevationAt) {
      street.heights = gradeCapHeights(smooth, smooth.map((p) => elevationAt(p[0], p[1])), maxGrade, chain.loop);
    }
    // Flanking pedestrian bands on paved streets (not service lanes, and not a race circuit's track —
    // its edges carry kerbs, run-off and barriers instead).
    if (level !== "lane" && smooth.length >= 2 && design === undefined) {
      const d = width / 2 + sidewalkWidth;
      street.sidewalks = { left: offsetPolyline(smooth, d), right: offsetPolyline(smooth, -d) };
    }
    // Dead-end cul-de-sac bulb at a dangling terminal node.
    const endNode = chain.nodes[chain.nodes.length - 1]!;
    const startNode = chain.nodes[0]!;
    if (!chain.loop) {
      if (degree[endNode] === 1) street.bulb = smooth[smooth.length - 1]!;
      else if (degree[startNode] === 1) street.bulb = smooth[0]!;
    }
    // Bridge/tunnel features along this street.
    if (heightAt !== undefined) {
      street.features.push(...detectFeatures(smooth, heightAt, rules));
    }
    streets.push(street);
  });

  // --- junctions from branches and hard degree-2 bends split into separate streets ---
  const chainEndsAt = new Uint16Array(rawNodes.length);
  for (const chain of chains) {
    if (chain.loop) continue;
    const head = chain.nodes[0];
    const tail = chain.nodes.at(-1);
    if (head !== undefined) increment(chainEndsAt, head);
    if (tail !== undefined) increment(chainEndsAt, tail);
  }
  const junctions: StreetJunction[] = [];
  for (let n = 0; n < rawNodes.length; n += 1) {
    const nodeDegree = degree[n] ?? 0;
    if (nodeDegree < 3 && !(nodeDegree === 2 && (chainEndsAt[n] ?? 0) >= 2)) continue;
    const arms: { angle: number; width: number }[] = [];
    let radius = 0;
    let level: StreetLevel = "lane";
    for (const c of adj[n]!) {
      const e = rawEdges[c.edge]!;
      const pts = edgeWander[c.edge]!;
      // Direction leaving node n along this edge.
      const nearN = e.a === n ? pts[Math.min(1, pts.length - 1)]! : pts[Math.max(0, pts.length - 2)]!;
      const dx = nearN[0] - rawNodes[n]![0];
      const dz = nearN[1] - rawNodes[n]![1];
      arms.push({ angle: Math.atan2(dx, dz), width: edges[c.edge]!.width });
      radius = Math.max(radius, edges[c.edge]!.width / 2 + 0.8);
      if (LEVEL_RANK[edgeLevel[c.edge]!] > LEVEL_RANK[level]) level = edgeLevel[c.edge]!;
    }
    junctions.push({ x: rawNodes[n]![0], z: rawNodes[n]![1], radius, level, arms });
  }

  // --- dead ends from degree-1 nodes ---
  const deadEnds: StreetDeadEnd[] = [];
  for (let n = 0; n < rawNodes.length; n += 1) {
    if (degree[n] !== 1) continue;
    const c = adj[n]![0]!;
    const e = rawEdges[c.edge]!;
    const pts = edgeWander[c.edge]!;
    const inner = e.a === n ? pts[Math.min(1, pts.length - 1)]! : pts[Math.max(0, pts.length - 2)]!;
    const dx = rawNodes[n]![0] - inner[0];
    const dz = rawNodes[n]![1] - inner[1];
    deadEnds.push({ node: n, x: rawNodes[n]![0], z: rawNodes[n]![1], heading: Math.atan2(dx, dz), width: edges[c.edge]!.width });
  }

  // --- resolve feature spans into world-of-volume feature centerlines ---
  const bridges: StreetFeature[] = [];
  const tunnels: StreetFeature[] = [];
  for (const street of streets) {
    for (const span of street.features) {
      const slice = street.points.slice(span.from, span.to + 1);
      if (slice.length < 2) continue;
      const feature: StreetFeature = { kind: span.kind, points: slice, width: street.width, bankHeight: span.bankHeight };
      (span.kind === "bridge" ? bridges : tunnels).push(feature);
    }
  }

  const components = countComponents(rawNodes.length, rawEdges);
  const loops = Math.max(0, rawEdges.length - rawNodes.length + components);

  // Compact node list with final degrees.
  const nodes: StreetNode[] = rawNodes.map((p, i) => ({ id: i, x: p[0], z: p[1], degree: degree[i]! }));

  return { mode, nodes, edges, streets, junctions, deadEnds, bridges, tunnels, loops, ...(design === undefined ? {} : { circuit: design }) };
}

/** The deck of a figure-8 flyover on a street: its points over the lower pass, raised clear of it. */
function flyoverSpans(points: readonly StreetVec2[], heights: readonly number[], crossing: CircuitDesign["crossings"][number], width: number): StreetFeatureSpan[] {
  const spans: StreetFeatureSpan[] = [];
  const reach = width * 0.75 + 8;
  let from = -1;
  for (let i = 0; i <= points.length; i += 1) {
    const p = points[i];
    const over = p !== undefined && Math.hypot(p[0] - crossing.x, p[1] - crossing.z) <= reach && heights[i]! >= crossing.underHeight + 3;
    if (over && from < 0) from = i;
    if (!over && from >= 0) {
      if (i - 1 > from) spans.push({ kind: "bridge", from, to: i - 1, bankHeight: crossing.underHeight });
      from = -1;
    }
  }
  return spans;
}

/** Connected-component count over the atomic graph (for the cycle-rank / loop count). */
function countComponents(n: number, edges: RawEdge[]): number {
  const uf = makeUf(n);
  let count = n;
  for (const e of edges) if (uf.union(e.a, e.b)) count -= 1;
  return count;
}

/**
 * Walk a street's centerline and mark BRIDGE spans (a run dipping under `minElevation`, banked by
 * land on both sides) and TUNNEL spans (a run buried under a ridge rising `tunnelClearance` above its
 * banks). Both are bounded to a few segment lengths so a road never bridges an ocean or bores a
 * mountain range. Returns index windows into `points`.
 */
function detectFeatures(
  points: readonly StreetVec2[],
  heightAt: (x: number, z: number) => number,
  rules: Pick<StreetRules, "minElevation" | "tunnelClearance" | "bridges" | "tunnels">,
): StreetFeatureSpan[] {
  const minEl = rules.minElevation;
  const clearance = rules.tunnelClearance;
  const wantBridge = rules.bridges;
  const wantTunnel = rules.tunnels;
  if (!wantBridge && !wantTunnel) return [];
  const spans: StreetFeatureSpan[] = [];
  const heights = points.map((p) => heightAt(p[0], p[1]));
  let i = 0;
  while (i < points.length) {
    if (wantBridge && heights[i]! < minEl && i > 0 && heights[i - 1]! >= minEl) {
      const start = i - 1; // last land vertex before the gap (guaranteed above water)
      let j = i;
      while (j < points.length && heights[j]! < minEl) j += 1;
      if (j < points.length) {
        const bank = Math.min(heights[start]!, heights[j]!);
        spans.push({ kind: "bridge", from: start, to: j, bankHeight: bank });
        i = j + 1;
        continue;
      }
      break; // gap runs off the end of the street — no far bank, no deck
    }
    if (wantTunnel && i > 0 && i < points.length - 1) {
      const bank = heights[i - 1]!;
      if (heights[i]! > bank + clearance && heights[i]! >= minEl) {
        const start = i - 1;
        let j = i;
        while (j < points.length - 1 && heights[j]! > bank + clearance) j += 1;
        const farBank = heights[j]!;
        if (farBank <= bank + clearance) {
          spans.push({ kind: "tunnel", from: start, to: j, bankHeight: Math.min(bank, farBank) });
          i = j + 1;
          continue;
        }
      }
    }
    i += 1;
  }
  return spans;
}

/**
 * The street generator: a whole street/track graph grown inside a `halfX` × `halfZ` footprint from
 * the topology dials and an injected seed. A city street net and a closed race circuit are the same
 * generator at opposite slider extremes (the `net` and `circuit` presets). Pass a ground sampler as
 * the `input` to turn water gaps into bridges and ridges into tunnels. The output is plain data in
 * volume-local coordinates, the same for the same params, seed and input; rebuild the road-surface
 * field with {@link streetElevationField}.
 *
 * @capability street-generator build a deterministic street/track graph (nodes, edges, streets, junctions, sidewalks, bridges, tunnels) from sliders
 */
export const STREET_NETWORK_GENERATOR = defineGenerator({
  id: STREET_NETWORK_GENERATOR_ID,
  label: "Streets",
  output: STREET_NETWORK_OUTPUT,
  schema: STREET_NETWORK_SCHEMA,
  generate(params, context: GeneratorContext<StreetNetworkInput>): StreetNetwork {
    return growStreets({ ...params, seed: context.seed }, context.input ?? {});
  },
});
