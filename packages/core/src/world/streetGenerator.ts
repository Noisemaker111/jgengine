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
 *   `1 / minCurveRadius`; for a CIRCUIT, how much the control polygon folds and how few deliberate
 *   straights it keeps (a windy lap curves nearly everywhere). `minTurnAngle`/`maxTurnAngle` are HARD
 *   clamps on the corner a NET street may take at any vertex — shallow wiggles are straightened, and every
 *   real corner is replaced with a sampled circular-arc fillet of radius `minCurveRadius` so corners read
 *   as CURVES, never single bevels, sampled so no discrete turn between consecutive samples exceeds ~9°.
 *   A circuit's loop skips that fillet entirely — its centerline is a smooth curvature-floored spline whose
 *   own dense sampling keeps every per-sample turn ≤ ~6°.
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
 *   Road elevation is WHOLLY SEPARATE from the `context.heightAt` TERRAIN sampler that drives
 *   bridges/tunnels: `elevationAt` shapes the road surface itself; `heightAt` is the world ground the
 *   road bridges over or bores through. They never interact — a flat-elevation network can still span
 *   bridges, and an elevated network's `heights[]` say nothing about where terrain gaps or ridges are.
 *
 * Hierarchy is STRUCTURAL, not a length percentile: an approximate edge-betweenness centrality over the
 * grown graph elects a connected arterial skeleton (avenues/boulevards) that never dead-ends at an
 * interior junction of lesser roads; everything else is a local street, spurs are lanes.
 *
 * Circuit mode is a CURVE-FIRST centerline, not a filleted polygon (which read as straights joined by
 * small corner caps). The layout synthesis is unchanged — seeded points scattered, hulled, a random subset
 * of hull-edge midpoints displaced DEEP inward (the classic random-track method, folded far enough for
 * several concave lobes) with light hairpin/ess/chicane templates — but its polygon is treated as CONTROL
 * POINTS, not the track: 1–3 edges are collapsed onto lines as deliberate STRAIGHTS (start/finish is the
 * longest), a periodic centripetal Catmull-Rom spline is fitted through the points and sampled densely, and
 * a CURVATURE CLAMP (iterative Laplacian smoothing on a coarse uniform working loop, then a re-fit) relaxes
 * every spot tighter than `minCurveRadius` up to the floor. So the lap is MOSTLY continuous curve — long
 * sweepers, flowing esses, parabolic entries, curvature that flows rather than corner-caps — with the
 * straights as deliberate exceptions and a legal hairpin (~`minCurveRadius`) surviving at the floor; radii
 * form a smooth continuum from ~1× to many × `minCurveRadius`. `minCurveRadius` is enforced by the clamp
 * and self-clearance (the sampled spline never runs within ~1.5 track widths of a non-adjacent part of
 * itself) via bounded deterministic reject-and-retry with decaying fold aggression, falling back to a safe
 * simple layout only when every retry crosses. The sampled loop is distributed into many node-to-node edges
 * (nodes exactly ON the spline, each edge carrying its sampled sub-arc); city (net) streets keep the
 * single-radius `minCurveRadius` arc fillet. When branching is meaningful a lane-level PIT LANE offsets
 * parallel to the start/finish straight, leaving the loop at one node and rejoining at another (two
 * degree-3 junctions, never a dead-end stub).
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
import { seededStreams } from "../random/rng";

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
   *  This is ROAD elevation, not the `context.heightAt` terrain that drives bridges/tunnels. */
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
  /** The shared road-surface height FIELD (volume-local), present only when `elevation > 0`. Sample it
   *  to drape junction welds, sidewalks, and building bases so every surface meets the road continuously
   *  — the streets/edges sample this exact field. Distinct from the `context.heightAt` terrain sampler. */
  elevationAt?: (x: number, z: number) => number;
}

/** Fully-defaulted slider set the generator reads. */
export interface StreetNetworkRules {
  seed: string;
  /** 1 = regular lattice nodes; 0 = organic scatter. */
  gridness: number;
  /** 0 = tree (dead-ends); 1 = a single closed circuit. */
  loopiness: number;
  /** Extra chord edges between neighbors → mesh density. */
  connectivity: number;
  /** Spur-lane density forking off the mains (and, in a circuit, the pit-lane trigger). */
  branching: number;
  /** Fraction of dangling ends kept as cul-de-sacs (vs reconnected). */
  deadEnds: number;
  /** Target node spacing / block size, world units. */
  segmentLength: number;
  /** Cross-axis spacing multiplier (≥1 = long skinny Manhattan blocks). */
  aspect: number;
  /** Sideways wander amplitude, 0..1 (and circuit corner-template density). */
  winding: number;
  /** Minimum curve radius (m) — caps wander curvature and sets the corner-fillet radius. */
  minCurveRadius: number;
  /** Shallowest corner (degrees) a street keeps — gentler bends are straightened. */
  minTurnAngle: number;
  /** Sharpest corner (degrees) between consecutive centerline samples — sharper corners are filleted. */
  maxTurnAngle: number;
  /** Base street width; the hierarchy scales off it. */
  width: number;
  /** Share of avenues upgraded to boulevards, 0..1. */
  boulevards: number;
  /** Pedestrian band width paved on each side of boulevard/avenue/street levels. Default ~2. */
  sidewalkWidth?: number;
  /** Road-surface relief amplitude, 0..1. 0 (default) = dead flat and byte-identical to a pre-elevation
   *  network; 1 ≈ 22 m of relief across a ~520 m volume (scaled to the footprint). */
  elevation?: number;
  /** Maximum road slope (rise/run) the grade cap enforces on every street's height sequence. Default 0.07. */
  maxGrade?: number;
  /** District OUTLINE irregularity, 0..1. 0 (default) keeps the full rectangular footprint —
   *  byte-identical to a pre-outline network. Rising values clip the lattice to a seeded organic
   *  boundary blob (low-frequency radial harmonics inside the `hx`/`hz` rect), so every seed grows a
   *  differently-shaped city — lobes, bays, shaved corners — instead of the same filled square. The
   *  surviving network is reduced to its largest connected component, so streets always connect.
   *  Only meaningful for the street net; ignored in circuit mode. */
  outline?: number;
  /** Share (0..1) of branch spurs grown as RESIDENTIAL SIDE STREETS — winding 1–3-segment
   *  street-level chains ending in cul-de-sac bulbs, optionally forking once — instead of the
   *  legacy single-stub service alleys. 0 (default) keeps the alley-only behavior byte-identical.
   *  `generateCity` defaults it to 0.6 for the suburb look. */
  residentialBranches?: number;
  /** SPACE-FILLING circuit layout dial, 0..1. 0 (default) = the hull construction (a flowing loop around
   *  an empty middle), BYTE-IDENTICAL to a pre-compactness network. Rising values switch the circuit
   *  LAYOUT stage to a grid spanning-tree CYCLE that folds back through its own interior: parallel
   *  adjacent runs one corridor pitch apart, switchback esses, consecutive hairpins, and long straights
   *  from straight tree branches, with footprint coverage rising with the dial (~45% of grid cells at
   *  0.5, ~85% at 1). Everything downstream — spline fit, curvature floor, straight designation,
   *  self-clearance, edge distribution, elevation, pit lane — is reused unchanged. Only meaningful in
   *  circuit mode; ignored by the street net. */
  compactness?: number;
}

/** Ground sampler + feature toggles enabling bridges/tunnels; omit for a flat, feature-free network. */
export interface StreetNetworkContext {
  /** Volume-local ground height sampler. */
  heightAt?: (x: number, z: number) => number;
  /** Ground below this (local) height is a gap streets bridge over. */
  minElevation?: number;
  /** Emit bridge decks over sub-`minElevation` gaps. */
  bridges?: boolean;
  /** Emit tunnel bores where the ground rises this far above a span's banks. */
  tunnels?: boolean;
  /** Ridge height above the banks that triggers a tunnel. Default 6. */
  tunnelClearance?: number;
}

const TAU = Math.PI * 2;
const MAX_NODES = 900;
const MAX_STREETS = 360;
const MAX_EDGES = 1400;
const MAX_LANES = 260;
const MAX_CIRCUIT_TRIES = 20;
const BETWEENNESS_SOURCES = 40;
const DEFAULT_SIDEWALK_WIDTH = 2;
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
function windingAmplitude(rules: StreetNetworkRules, wavelength: number): number {
  const want = rules.winding * rules.segmentLength * 0.34;
  // Peak curvature of A·sin(2πt/λ) is A·(2π/λ)²; keep radius ≥ minCurveRadius (0.35 covers the octave mix).
  const cap = (0.35 * wavelength * wavelength) / (4 * Math.PI * Math.PI * Math.max(1, rules.minCurveRadius));
  return Math.max(0, Math.min(want, cap));
}

/** Sample a straight chord a→b into a wandered polyline (endpoints pinned exactly on the nodes). */
function wanderEdge(a: StreetVec2, b: StreetVec2, rng: () => number, rules: StreetNetworkRules): StreetVec2[] {
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
function seedLattice(rules: StreetNetworkRules, hx: number, hz: number, rng: () => number): Lattice {
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

/**
 * Seeded organic district boundary: a radial blob from 3 low-frequency harmonics over the
 * normalized (u = x/hx, v = z/hz) footprint. Returns an inside-test. At `outline` 0 the caller
 * skips the mask entirely, so the legacy full-rectangle footprint stays byte-identical.
 */
function makeOutlineMask(
  outline: number,
  rng: () => number,
): (x: number, z: number, hx: number, hz: number) => boolean {
  // Harmonic amplitudes/phases: k=2 gives lobes/ovals, k=3 tri-lobes, k=5 coastline nibble.
  const amps = [0.28 + rng() * 0.3, 0.16 + rng() * 0.22, 0.06 + rng() * 0.12];
  const phases = [rng() * TAU, rng() * TAU, rng() * TAU];
  const ks = [2, 3, 5];
  const strength = Math.max(0, Math.min(1, outline));
  return (x, z, hx, hz) => {
    const u = x / Math.max(1e-6, hx);
    const v = z / Math.max(1e-6, hz);
    const r = Math.hypot(u, v);
    const theta = Math.atan2(v, u);
    let h = 0;
    for (let i = 0; i < ks.length; i += 1) h += amps[i]! * Math.sin(ks[i]! * theta + phases[i]!);
    // Boundary radius in normalized space: shrinks with the dial, waves with the harmonics. The
    // 1.16 base keeps mid-edge reach near the rim at low dials while corners (r≈1.41) get shaved —
    // the mask nibbles lobes and bays out of the silhouette rather than gutting the net.
    const boundary = 1.16 - strength * 0.24 + strength * 0.38 * h;
    return r <= Math.max(0.4, boundary);
  };
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
}

/** Grow the open street NET: lattice nodes, a spanning tree (guaranteed connectivity), then chords,
 *  loop-closing reconnections, and spur lanes — all driven by the sliders. */
function buildNet(
  rules: StreetNetworkRules,
  hx: number,
  hz: number,
  streams: (s: string) => () => number,
): { nodes: StreetVec2[]; edges: RawEdge[] } {
  const lattice = seedLattice(rules, hx, hz, streams("lattice"));
  const nodes = lattice.nodes;
  const { cols, rows, index } = lattice;
  // Organic district outline: nodes outside the seeded boundary blob die before any edge exists,
  // so the net grows into a seed-unique silhouette instead of always filling the rectangle.
  const outline = rules.outline ?? 0;
  const inMask =
    outline > 0 ? makeOutlineMask(outline, streams("outline")) : null;
  const dead = new Array<boolean>(nodes.length).fill(false);
  if (inMask !== null) {
    for (let n = 0; n < nodes.length; n += 1) {
      if (!inMask(nodes[n]![0], nodes[n]![1], hx, hz)) dead[n] = true;
    }
    // Never let the mask eat the whole lattice (extreme dial + tiny grid): keep at least a 3×3 core.
    let alive = 0;
    for (let n = 0; n < nodes.length; n += 1) if (!dead[n]) alive += 1;
    if (alive < 9) dead.fill(false);
  }
  // Candidate lattice edges: right + down neighbors (between surviving nodes only).
  const candidates: RawEdge[] = [];
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const here = index(i, j);
      if (here >= nodes.length || dead[here]) continue;
      if (i < cols) {
        const r = index(i + 1, j);
        if (r < nodes.length && !dead[r]) candidates.push({ a: here, b: r, lane: false });
      }
      if (j < rows) {
        const d = index(i, j + 1);
        if (d < nodes.length && !dead[d]) candidates.push({ a: here, b: d, lane: false });
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
    degree[a] += 1;
    degree[b] += 1;
  };
  for (const e of edges) addAdj(e.a, e.b);
  const loopRng = streams("loops");
  for (let n = 0; n < nodes.length; n += 1) {
    if (degree[n] !== 1) continue;
    const keep = loopRng() < rules.deadEnds;
    if (keep) continue; // becomes a cul-de-sac
    if (loopRng() > rules.loopiness + 0.15) continue; // otherwise mostly left as-is
    // Reconnect to the nearest node that isn't already a neighbor, forming a loop.
    let best = -1;
    let bestD = Infinity;
    for (let m = 0; m < nodes.length; m += 1) {
      if (m === n || dead[m] || adj.get(n)?.has(m)) continue;
      const d = Math.hypot(nodes[n]![0] - nodes[m]![0], nodes[n]![1] - nodes[m]![1]);
      if (d < bestD && d < rules.segmentLength * 1.8) {
        bestD = d;
        best = m;
      }
    }
    if (best >= 0) {
      edges.push({ a: n, b: best, lane: false });
      addAdj(n, best);
    }
  }

  // 4. branching — spurs forking outward off existing nodes. A spur is either a service ALLEY
  // (the legacy single lane-level stub) or — at `residentialBranches` > 0 — a RESIDENTIAL BRANCH:
  // a short winding street-level chain of 1–3 segments — the "one street off the main with just
  // houses on it" suburb move — ending in a dangling node that downstream becomes a cul-de-sac
  // bulb, and occasionally forking once. At the 0 default the pass replays the legacy alley
  // behavior byte-identically (same rng draw order, same acceptance rules).
  const spurCount = Math.min(Math.round(rules.branching * nodes.length * 0.6), MAX_LANES);
  const residentialShare = Math.max(0, Math.min(1, rules.residentialBranches ?? 0));
  const branchRng = streams("branches");
  // Grow one spur segment from `from` toward `angle`; returns the new node id or -1 when rejected.
  const growSegment = (from: number, angle: number, len: number, lane: boolean, clashRadius: number, crossCheck: boolean): number => {
    const fp = nodes[from]!;
    const nx = fp[0] + Math.cos(angle) * len;
    const nz = fp[1] + Math.sin(angle) * len;
    if (Math.abs(nx) > hx - 1 || Math.abs(nz) > hz - 1) return -1;
    if (inMask !== null && !inMask(nx, nz, hx, hz)) return -1;
    // Reject a segment that would land on an existing node…
    for (let m = 0; m < nodes.length; m += 1) {
      if (m === from) continue;
      if (Math.hypot(nodes[m]![0] - nx, nodes[m]![1] - nz) < clashRadius) return -1;
    }
    // …or slice across an existing edge (a branch must stay a branch, never a fake crossing).
    if (crossCheck) {
      for (const e of edges) {
        if (e.a === from || e.b === from) continue;
        if (segSegDistance(fp, [nx, nz], nodes[e.a]!, nodes[e.b]!) < rules.width * 1.6) return -1;
      }
    }
    const id = nodes.length;
    nodes.push([nx, nz]);
    edges.push({ a: from, b: id, lane });
    return id;
  };
  for (let b = 0; b < spurCount && nodes.length < MAX_NODES; b += 1) {
    const host = Math.floor(branchRng() * nodes.length);
    if (dead[host] === true) continue;
    // Short-circuit keeps the rng draw order identical to the legacy path at share 0.
    const residential = residentialShare > 0 && branchRng() < residentialShare;
    if (!residential) {
      // Service alley: one lane-level stub, the legacy look (legacy clash radius, no cross check).
      growSegment(host, branchRng() * TAU, rules.segmentLength * (0.6 + branchRng() * 0.7), true, rules.segmentLength * 0.45, residentialShare > 0);
      continue;
    }
    // Residential branch: 1–3 chained street-level segments with a drifting heading (reads as one
    // winding side street once chained), with at most one early fork.
    const segments = 1 + Math.floor(branchRng() * 3);
    let heading = branchRng() * TAU;
    let cursor = host;
    for (let s = 0; s < segments && nodes.length < MAX_NODES; s += 1) {
      const len = rules.segmentLength * (0.5 + branchRng() * 0.35);
      const next = growSegment(cursor, heading, len, false, rules.segmentLength * 0.4, true);
      if (next < 0) break;
      if (s === 0 && branchRng() < 0.25) {
        // Early fork: a short sibling street off the first branch node.
        growSegment(next, heading + (branchRng() < 0.5 ? 1 : -1) * (0.9 + branchRng() * 0.5), rules.segmentLength * (0.45 + branchRng() * 0.3), false, rules.segmentLength * 0.4, true);
      }
      heading += (branchRng() - 0.5) * 1.1;
      cursor = next;
    }
  }
  let finalEdges = edges.slice(0, MAX_EDGES);
  if (inMask !== null && finalEdges.length > 0) {
    // The blob can pinch the lattice into separate islands; keep only the largest component so the
    // network stays one connected city.
    const comp = makeUf(nodes.length);
    for (const e of finalEdges) comp.union(e.a, e.b);
    const sizes = new Map<number, number>();
    for (const e of finalEdges) {
      const root = comp.find(e.a);
      sizes.set(root, (sizes.get(root) ?? 0) + 1);
    }
    let bestRoot = -1;
    let bestSize = -1;
    for (const [root, size] of sizes) {
      if (size > bestSize) {
        bestSize = size;
        bestRoot = root;
      }
    }
    finalEdges = finalEdges.filter((e) => comp.find(e.a) === bestRoot);
  }
  return { nodes, edges: finalEdges };
}

/** Convex hull (Andrew's monotone chain), returns hull points CCW. */
function convexHull(pts: StreetVec2[]): StreetVec2[] {
  const uniq = pts.slice().sort((p, q) => (p[0] === q[0] ? p[1] - q[1] : p[0] - q[0]));
  const dedup: StreetVec2[] = [];
  for (const p of uniq) {
    const last = dedup[dedup.length - 1];
    if (last === undefined || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) dedup.push(p);
  }
  const n = dedup.length;
  if (n < 3) return dedup;
  const cross = (o: StreetVec2, a: StreetVec2, b: StreetVec2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: StreetVec2[] = [];
  for (const p of dedup) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: StreetVec2[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const p = dedup[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Minimum distance between two line segments in the XZ plane. */
function segSegDistance(p1: StreetVec2, p2: StreetVec2, p3: StreetVec2, p4: StreetVec2): number {
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
 * True when no two centerline segments that are FAR APART ALONG THE LOOP (arc-length separation
 * `> gapMin`) run spatially closer than `clearance` — i.e. the track never folds back onto a distant
 * part of itself. Segments within the same corner or between neighboring corners (small arc gap,
 * including the intentional close legs of a hairpin) are excluded, so only genuine self-crossings fail.
 */
function loopSelfClearing(poly: StreetVec2[], clearance: number, gapMin: number): boolean {
  const n = poly.length;
  if (n < 6) return true;
  const seg: number[] = [];
  let perimeter = 0;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(l);
    perimeter += l;
  }
  const cum: number[] = [0];
  for (let i = 0; i < n; i += 1) cum.push(cum[i]! + seg[i]!);
  for (let i = 0; i < n; i += 1) {
    const a1 = poly[i]!;
    const a2 = poly[(i + 1) % n]!;
    for (let j = i + 1; j < n; j += 1) {
      // Edge-to-edge arc-length gap along the loop (0 for edges sharing a vertex, incl. the wrap).
      const forwardGap = cum[j]! - cum[i + 1]!;
      const backwardGap = perimeter - cum[j + 1]! + cum[i]!;
      const arcGap = Math.min(forwardGap, backwardGap);
      if (arcGap <= gapMin) continue; // same corner / neighboring corners — not a fold-back
      const b1 = poly[j]!;
      const b2 = poly[(j + 1) % n]!;
      if (segSegDistance(a1, a2, b1, b2) < clearance) return false;
    }
  }
  return true;
}

/** Signed area (>0 = CCW). */
function signedArea(poly: StreetVec2[]): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

/** Index of the polygon edge with the greatest length (the start/finish straight candidate). */
function longestEdge(poly: StreetVec2[]): { index: number; length: number } {
  let index = 0;
  let length = 0;
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > length) {
      length = l;
      index = i;
    }
  }
  return { index, length };
}

/**
 * Synthesize one closed track polygon: scatter seeded points, take their convex hull, then fold it into
 * a real circuit by displacing hull-edge midpoints INWARD toward the centroid — a random subset pushed
 * DEEP (each deep push is a reflex vertex / concave lobe), the rest left straight so corners pop against
 * straights — keeping the longest edge straight for a start/finish, then carving guaranteed
 * chicane/ess/hairpin corner templates. `aggression` (1 = full depth, decaying on retries) scales fold
 * depth and template count so a clearing layout is found before the safe fallback. Returns the polygon
 * vertices (not duplicated), or null if the hull was degenerate.
 */
function synthTrack(
  rules: StreetNetworkRules,
  hx: number,
  hz: number,
  rng: () => number,
  aggression = 1,
): StreetVec2[] | null {
  const rx = hx * 0.9;
  const rz = hz * 0.9;
  const perimeter = Math.PI * (rx + rz);
  const target = Math.max(6, Math.min(Math.round(perimeter / (rules.segmentLength * 1.4)), 18));
  const scatter = Math.max(12, Math.min(target * 2, 40));
  const pts: StreetVec2[] = [];
  for (let i = 0; i < scatter; i += 1) {
    const ang = rng() * TAU;
    const rad = Math.sqrt(rng());
    pts.push([Math.cos(ang) * rx * rad, Math.sin(ang) * rz * rad]);
  }
  const hull = convexHull(pts);
  if (hull.length < 4) return null;
  let cx = 0;
  let cz = 0;
  for (const p of hull) {
    cx += p[0];
    cz += p[1];
  }
  cx /= hull.length;
  cz /= hull.length;
  const straightEdge = longestEdge(hull).index;
  // Probability an edge gets a DEEP inward fold (a real concave lobe) vs a shallow dent vs left straight.
  const pDeep = 0.2 + rules.winding * 0.4;
  const pDent = pDeep + 0.3;
  const poly: StreetVec2[] = [];
  for (let k = 0; k < hull.length; k += 1) {
    const p = hull[k]!;
    const q = hull[(k + 1) % hull.length]!;
    poly.push([p[0], p[1]]);
    if (k === straightEdge) continue; // keep the start/finish edge straight — no midpoint
    const mx = (p[0] + q[0]) / 2;
    const mz = (p[1] + q[1]) / 2;
    const dx = cx - mx;
    const dz = cz - mz;
    const d = Math.hypot(dx, dz);
    const edgeLen = Math.hypot(q[0] - p[0], q[1] - p[1]);
    // Fold class for this edge. DEEP pushes travel a large fraction of the way to the centroid so the
    // loop genuinely folds (multiple reflex lobes); DENT is a shallow concavity; STRAIGHT leaves the
    // edge alone so real straights survive. Depth scales with `aggression` so retries relax to clear.
    const roll = rng();
    let frac = 0;
    if (roll < pDeep) frac = (0.4 + rng() * 0.3) * aggression;
    else if (roll < pDent) frac = (0.1 + rng() * 0.16) * aggression;
    const amt = Math.min(edgeLen * 0.7, d * Math.min(0.72, frac));
    if (d > 1e-3 && amt > 1e-3) {
      poly.push([mx + (dx / d) * amt, mz + (dz / d) * amt]);
    } else {
      poly.push([mx, mz]);
    }
  }
  applyCornerTemplates(poly, rules, rng, aggression);
  // Clamp everything back inside the footprint.
  for (let i = 0; i < poly.length; i += 1) {
    poly[i] = [Math.max(-hx + 1, Math.min(hx - 1, poly[i]![0])), Math.max(-hz + 1, Math.min(hz - 1, poly[i]![1]))];
  }
  return poly;
}

/**
 * Carve chicane/ess/hairpin corner templates into a track polygon in place — the corner-VARIETY quota.
 * When `winding ≥ 0.4` the first two templates are a guaranteed HAIRPIN (a deep, narrow inward finger
 * that reverses direction over a short arc — a genuine ~180° U-turn, not a shallow apex) and a
 * guaranteed ESS (alternating left/right corners); further templates (count scaling with `winding` and
 * `aggression`) are random hairpin/ess/chicane. Every template is a LOCAL edit — an inward finger or a
 * pair of opposite perpendicular offsets — so the loop's global self-clearance survives for the
 * reject-and-retry check. Fingers point inward (toward the centroid) so the track folds without leaving
 * the footprint.
 */
function applyCornerTemplates(poly: StreetVec2[], rules: StreetNetworkRules, rng: () => number, aggression = 1): void {
  const forceVariety = rules.winding >= 0.4;
  const count = Math.max(forceVariety ? 2 : 0, Math.round(rules.winding * 3 * aggression));
  if (count <= 0 || poly.length < 6) return;
  const step = rules.segmentLength;
  let cx = 0;
  let cz = 0;
  for (const p of poly) {
    cx += p[0];
    cz += p[1];
  }
  cx /= poly.length;
  cz /= poly.length;
  for (let c = 0; c < count; c += 1) {
    const n = poly.length;
    const i = 1 + Math.floor(rng() * (n - 2));
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    if (l < step * 0.35) continue; // too little room for a legible corner
    const ux = dx / l;
    const uz = dz / l;
    // Inward normal (points toward the loop centroid so fingers fold in, never out of the footprint).
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    let nx = -uz;
    let nz = ux;
    if ((cx - mx) * nx + (cz - mz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const at = (i + 1) % n === 0 ? n : i + 1;
    const roll = rng();
    const kind = forceVariety && c === 0 ? "hairpin" : forceVariety && c === 1 ? "ess" : roll < 0.34 ? "hairpin" : roll < 0.67 ? "ess" : "chicane";
    if (kind === "hairpin") {
      // Deep, narrow inward finger: enter, cross a short tip, exit → a real U-turn over a short arc.
      const depth = Math.min(l * 0.85, step * (0.6 + rng() * 0.35) * aggression + step * 0.28);
      const tip = Math.min(l * 0.45, Math.max(step * 0.1, rules.width * 1.4));
      const base = l * (0.34 + rng() * 0.12);
      const t1: StreetVec2 = [a[0] + ux * base + nx * depth, a[1] + uz * base + nz * depth];
      const t2: StreetVec2 = [a[0] + ux * (base + tip) + nx * depth, a[1] + uz * (base + tip) + nz * depth];
      poly.splice(at, 0, t1, t2);
    } else if (kind === "ess") {
      // Ess: two opposite offsets flanking the edge — alternating corners.
      const off = step * (0.2 + rng() * 0.26) * aggression;
      const t1: StreetVec2 = [a[0] + ux * l * 0.32 + nx * off, a[1] + uz * l * 0.32 + nz * off];
      const t2: StreetVec2 = [a[0] + ux * l * 0.68 - nx * off, a[1] + uz * l * 0.68 - nz * off];
      poly.splice(at, 0, t1, t2);
    } else {
      // Chicane: a quick left-right-left kink (3 points).
      const off = step * (0.16 + rng() * 0.2) * aggression;
      const t1: StreetVec2 = [a[0] + ux * l * 0.25 + nx * off, a[1] + uz * l * 0.25 + nz * off];
      const t2: StreetVec2 = [a[0] + ux * l * 0.5 - nx * off, a[1] + uz * l * 0.5 - nz * off];
      const t3: StreetVec2 = [a[0] + ux * l * 0.75 + nx * off, a[1] + uz * l * 0.75 + nz * off];
      poly.splice(at, 0, t1, t2, t3);
    }
  }
}

/** A safe convex fallback track (an inset ellipse with one shallow inward dent) with a long straight. */
function fallbackTrack(rules: StreetNetworkRules, hx: number, hz: number): StreetVec2[] {
  const rx = hx * 0.82;
  const rz = hz * 0.82;
  const k = Math.max(8, Math.min(Math.round((Math.PI * (rx + rz)) / rules.segmentLength), 24));
  const poly: StreetVec2[] = [];
  for (let i = 0; i < k; i += 1) {
    const ang = (i / k) * TAU;
    // One gentle inward dent so the fallback is not a perfect star-convex blob.
    const dent = i === Math.floor(k / 2) ? 0.72 : 1;
    poly.push([Math.cos(ang) * rx * dent, Math.sin(ang) * rz * dent]);
  }
  return poly;
}

/** Circumradius of a point triple = the local fitted radius (∞ for a collinear/straight triple). This is
 *  the SAME metric the curvature clamp enforces and the tests measure, so a clamped loop has no triple
 *  under the floor. @internal */
function circumRadius(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  if (area < 1e-9) return Infinity;
  return (ab * bc * ca) / (4 * area);
}

/** Drop consecutive (and wrap) near-coincident vertices so a control ring has well-defined tangents. */
function dedupeRing(pts: StreetVec2[], eps = 1e-3): StreetVec2[] {
  const out: StreetVec2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last === undefined || Math.hypot(last[0] - p[0], last[1] - p[1]) > eps) out.push([p[0], p[1]]);
  }
  while (out.length > 3 && Math.hypot(out[0]![0] - out[out.length - 1]![0], out[0]![1] - out[out.length - 1]![1]) < eps) {
    out.pop();
  }
  return out;
}

/**
 * Designate 1–3 control-polygon edges as genuine STRAIGHTS (start/finish is always the longest edge) and
 * collinearize each into a run of on-chord control points, so the fitted spline passes through real
 * straight runs that CONTRAST with an otherwise continuously-curving lap. The inserted interior points are
 * flagged `straight` (they define the dead-straight middle and are protected from the curvature clamp); the
 * original control points stay unflagged so the spline's parabolic entry/exit at each straight end is free
 * to curve and be floored. More straights when `winding` is low (a windy lap curves more).
 * @internal
 */
function designateStraights(
  control: StreetVec2[],
  rules: StreetNetworkRules,
  rng: () => number,
): { pts: StreetVec2[]; straight: boolean[] } {
  const m = control.length;
  const lens = control.map((p, i) => {
    const q = control[(i + 1) % m]!;
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const order = lens.map((_, i) => i).sort((a, b) => lens[b]! - lens[a]!);
  const chosen = new Set<number>();
  chosen.add(order[0]!); // start/finish = the longest edge
  // Fewer extra straights as `winding` rises (a windy lap should curve nearly everywhere); at winding ≥ 0.5
  // the lap is usually just the start/finish straight so curves dominate the arc length.
  const extra =
    rules.winding >= 0.5
      ? rng() < 0.35
        ? 1
        : 0
      : Math.max(0, Math.min(2, Math.round((1 - rules.winding) * 2)));
  for (let r = 1; r < order.length && chosen.size < 1 + extra; r += 1) {
    const e = order[r]!;
    if (lens[e]! < rules.segmentLength * 1.2) break; // remaining edges too short to read as a straight
    if (chosen.has((e + 1) % m) || chosen.has((e - 1 + m) % m)) continue; // keep straights apart
    if (rng() < 0.75) chosen.add(e);
  }
  const pts: StreetVec2[] = [];
  const straight: boolean[] = [];
  for (let i = 0; i < m; i += 1) {
    const p = control[i]!;
    const q = control[(i + 1) % m]!;
    pts.push([p[0], p[1]]);
    straight.push(false); // original control points are transition anchors, never protected
    if (chosen.has(i)) {
      // Subdivide the edge into on-chord interior points; the CR spline through ≥3 collinear points runs
      // dead straight between them (only the first/last sub-segment bends toward the adjacent curve).
      const sub = Math.max(4, Math.round(lens[i]! / rules.segmentLength) + 2);
      for (let s = 1; s < sub; s += 1) {
        const t = s / sub;
        pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        straight.push(true);
      }
    }
  }
  return { pts, straight };
}

/** Evaluate a centripetal Catmull-Rom segment P1→P2 at parameter `u` (Barry–Goldman pyramid). */
function catmullPoint(
  p0: StreetVec2,
  p1: StreetVec2,
  p2: StreetVec2,
  p3: StreetVec2,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  u: number,
): StreetVec2 {
  const lerp = (a: StreetVec2, b: StreetVec2, ta: number, tb: number): StreetVec2 => {
    const d = tb - ta;
    if (Math.abs(d) < 1e-9) return [a[0], a[1]];
    const w = (u - ta) / d;
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/**
 * Fit a periodic CENTRIPETAL Catmull-Rom spline through the closed control points and sample it densely
 * (≤ `sampleStep` chord spacing) so it flows through every point without cusps. Centripetal (α=0.5)
 * parameterization avoids the self-intersections/overshoot of uniform CR. Each sample inherits the
 * `straight` flag of its segment (a segment is straight only when BOTH its control endpoints are flagged),
 * so the protected dead-straight middles are known downstream. @internal
 */
function fitClosedSpline(
  control: StreetVec2[],
  straightControl: boolean[],
  sampleStep: number,
): { pts: StreetVec2[]; straight: boolean[] } {
  const m = control.length;
  const pts: StreetVec2[] = [];
  const straight: boolean[] = [];
  const knot = (a: StreetVec2, b: StreetVec2): number => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i < m; i += 1) {
    const p0 = control[(i - 1 + m) % m]!;
    const p1 = control[i]!;
    const p2 = control[(i + 1) % m]!;
    const p3 = control[(i + 2) % m]!;
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(1, Math.ceil(chord / sampleStep));
    const segStraight = straightControl[i]! && straightControl[(i + 1) % m]!;
    for (let s = 0; s < k; s += 1) {
      const u = t1 + ((t2 - t1) * s) / k; // s=0 → u=t1 → exactly p1, so the spline hits every control point
      pts.push(catmullPoint(p0, p1, p2, p3, t0, t1, t2, t3, u));
      straight.push(segStraight);
    }
  }
  return { pts, straight };
}

/** Resample a closed polyline to (near-)UNIFORM arc-length spacing `step`. Uniform spacing is what makes a
 *  narrow Laplacian curvature clamp both effective and STABLE: a densely-clustered cusp (where the raw
 *  spline crawls) otherwise defeats a narrow stencil (steps shrink with segment length) and a wide stencil
 *  reaches across the loop's neck and folds it. A sample is flagged straight only when the source segment
 *  it lands on is fully straight, so straight runs are preserved. @internal */
function resampleClosedUniform(
  pts: StreetVec2[],
  straight: boolean[],
  step: number,
): { pts: StreetVec2[]; straight: boolean[] } {
  const P = pts.length;
  if (P < 4) return { pts: pts.map((p) => [p[0], p[1]] as StreetVec2), straight: straight.slice() };
  const cum: number[] = [0];
  let total = 0;
  for (let i = 0; i < P; i += 1) {
    const b = pts[(i + 1) % P]!;
    total += Math.hypot(b[0] - pts[i]![0], b[1] - pts[i]![1]);
    cum.push(total);
  }
  const count = Math.max(8, Math.round(total / Math.max(1e-3, step)));
  const outP: StreetVec2[] = [];
  const outS: boolean[] = [];
  let j = 0;
  for (let s = 0; s < count; s += 1) {
    const target = (total * s) / count;
    while (j < P && cum[j + 1]! < target) j += 1;
    const seg = cum[j + 1]! - cum[j]!;
    const f = seg > 1e-9 ? (target - cum[j]!) / seg : 0;
    const a = pts[j % P]!;
    const b = pts[(j + 1) % P]!;
    outP.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    outS.push(straight[j % P]! && straight[(j + 1) % P]!);
  }
  return { pts: outP, straight: outS };
}

/** One Jacobi Laplacian smoothing pass over a closed loop: each selected sample moves `lambda` toward the
 *  midpoint of its two immediate neighbors. Diffusion only lowers curvature. Straight runs are NOT specially
 *  protected — a collinear run is already a Laplacian fixpoint (midpoint of collinear neighbors is the point
 *  itself), so straight interiors never move, while the sample where a straight meets a curve is free to
 *  ease the junction (a frozen straight there would leave an un-openable kink). @internal */
function smoothLoopPass(pts: StreetVec2[], lambda: number, sel: (i: number) => boolean): void {
  const P = pts.length;
  const nx = new Array<number>(P);
  const nz = new Array<number>(P);
  for (let i = 0; i < P; i += 1) {
    if (!sel(i)) {
      nx[i] = pts[i]![0];
      nz[i] = pts[i]![1];
      continue;
    }
    const a = pts[(i - 1 + P) % P]!;
    const b = pts[(i + 1) % P]!;
    nx[i] = pts[i]![0] + lambda * ((a[0] + b[0]) * 0.5 - pts[i]![0]);
    nz[i] = pts[i]![1] + lambda * ((a[1] + b[1]) * 0.5 - pts[i]![1]);
  }
  for (let i = 0; i < P; i += 1) pts[i] = [nx[i]!, nz[i]!];
}

/**
 * CURVATURE CLAMP (not a corner fillet), on a UNIFORMLY-sampled loop so a narrow stencil is stable: relax
 * the loop so every point respects the radius floor `minR`, preserving flow. Phase A runs a few light
 * global passes that smooth the small curvature steps a C1 Catmull-Rom leaves at its knots (the lap reads
 * as one continuous curve). Phase B iteratively Laplacian-smooths ONLY the samples whose fitted radius is
 * under the floor (and their immediate neighbors), so tight corners open toward ~minR while medium/large
 * curves, sweepers and protected straights are left alone — hairpins settle right at the floor. Diffusion
 * only lowers curvature, so it converges and stops the instant the floor holds. Phase C re-smooths the
 * seam of relaxed regions. Closed loop, no fixed endpoints. @internal
 */
function relaxCurvature(pts: StreetVec2[], minR: number): void {
  const P = pts.length;
  if (P < 8) return;
  const radiusAt = (i: number): number => circumRadius(pts[(i - 1 + P) % P]!, pts[i]!, pts[(i + 1) % P]!);
  // Relax to a target comfortably ABOVE the floor so the smooth output spline re-fitted through these
  // points still clears `minR` where it dips between them, while still leaving the tightest corners as
  // legal hairpins near the floor.
  const floor = minR * 1.12;
  const violators = (): boolean[] | null => {
    const need = new Array<boolean>(P).fill(false);
    let any = false;
    for (let i = 0; i < P; i += 1) {
      if (radiusAt(i) < floor) {
        need[i] = true;
        any = true;
      }
    }
    return any ? need : null;
  };
  for (let it = 0; it < 4; it += 1) smoothLoopPass(pts, 0.2, () => true);
  // Phase B — targeted: smooth each violator and its immediate neighbors until the floor holds. Because a
  // violator may land ON a straight sample at a straight↔curve junction, its curve-side neighbor (never a
  // fixpoint) is included so the junction actually eases.
  for (let it = 0; it < 1500; it += 1) {
    const need = violators();
    if (need === null) break;
    const sel = new Array<boolean>(P).fill(false);
    for (let i = 0; i < P; i += 1) {
      if (need[i]) {
        sel[i] = true;
        sel[(i - 1 + P) % P] = true;
        sel[(i + 1) % P] = true;
      }
    }
    smoothLoopPass(pts, 0.5, (i) => sel[i]!);
    if (it % 20 === 19) smoothLoopPass(pts, 0.1, () => true); // periodic global nudge frees cusps
  }
  // Phase B2 — escalating global erosion for any stubborn deep-finger cusp the targeted pass can't open
  // (a finger too thin to round to `minR` in place); runs only while a violator survives, so a legal lap
  // is untouched. Straight interiors are collinear Laplacian fixpoints, so they stay crisp under it.
  for (let guard = 0; guard < 400 && violators() !== null; guard += 1) {
    smoothLoopPass(pts, 0.25, () => true);
  }
  for (let it = 0; it < 2; it += 1) smoothLoopPass(pts, 0.12, () => true);
}

/** Rotate a sampled loop (and its straight flags) so index 0 is the start of the LONGEST straight run —
 *  the start/finish straight — so distribution can emit it as a single edge. @internal */
function rotateToStraight(pts: StreetVec2[], straight: boolean[]): void {
  const P = pts.length;
  let bestStart = -1;
  let bestLen = 0;
  let k = 0;
  while (k < P) {
    if (!straight[k]) {
      k += 1;
      continue;
    }
    const start = k;
    let len = 0;
    while (k < P && straight[k]) {
      k += 1;
      len += 1;
    }
    if (len > bestLen) {
      bestLen = len;
      bestStart = start;
    }
  }
  // A run may wrap the seam (straight at both ends of the array) — stitch it and prefer if longer.
  if (P > 0 && straight[0] && straight[P - 1]) {
    let head = 0;
    while (head < P && straight[head]) head += 1;
    let tail = 0;
    while (tail < P && straight[P - 1 - tail]) tail += 1;
    if (head + tail > bestLen) {
      bestLen = head + tail;
      bestStart = P - tail;
    }
  }
  if (bestStart <= 0) return;
  const rp = pts.slice(bestStart).concat(pts.slice(0, bestStart));
  const rs = straight.slice(bestStart).concat(straight.slice(0, bestStart));
  for (let j = 0; j < P; j += 1) {
    pts[j] = rp[j]!;
    straight[j] = rs[j]!;
  }
}

/** Arc length of the longest straight run in a sampled loop (measures the start/finish straight). */
function longestStraightRun(loop: StreetVec2[], straight: boolean[]): number {
  const P = loop.length;
  if (P < 2) return 0;
  const segLen = (i: number): number => Math.hypot(loop[(i + 1) % P]![0] - loop[i]![0], loop[(i + 1) % P]![1] - loop[i]![1]);
  let best = 0;
  let run = 0;
  for (let k = 0; k < 2 * P; k += 1) {
    const i = k % P;
    if (straight[i]) {
      run += segLen(i);
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best; // arc length; a seam-wrapping run is captured by the 2P sweep
}

/**
 * Distribute a sampled circuit loop into the `{nodes, edges}` graph contract: nodes land ON the spline at
 * every straight↔curve boundary and every ~`segmentLength` of arc inside curved runs; each straight run
 * stays a single edge (the deliberate straight). Every edge carries its exact sampled sub-arc, so the
 * curved centerline survives assembly instead of being rebuilt as a straight chord. @internal
 */
function distributeLoopEdges(
  loop: StreetVec2[],
  straight: boolean[],
  segmentLength: number,
): { nodes: StreetVec2[]; edges: RawEdge[] } {
  const P = loop.length;
  const isNode = new Array<boolean>(P).fill(false);
  isNode[0] = true;
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
  const K = nodeIdx.length;
  const edges: RawEdge[] = [];
  for (let e = 0; e < K; e += 1) {
    const from = nodeIdx[e]!;
    const to = nodeIdx[(e + 1) % K]!;
    const points: StreetVec2[] = [[loop[from]![0], loop[from]![1]]];
    let idx = from;
    do {
      idx = (idx + 1) % P;
      points.push([loop[idx]![0], loop[idx]![1]]);
    } while (idx !== to);
    edges.push({ a: e, b: (e + 1) % K, lane: false, points });
  }
  return { nodes, edges };
}

/**
 * The corridor PITCH for the grid-cycle layout: the world spacing between anti-parallel loop strands and
 * the diameter of a leaf hairpin. Sized so, AFTER the curvature floor bulges tight corners, (a) two
 * parallel corridors keep their centrelines ≥ ~1.5·trackWidth apart (well clear) and (b) a hairpin
 * U-turn around a tree leaf has radius pitch/2 ≥ minCurveRadius. The `1.2·minR` term is the
 * post-smoothing bulge budget; the `2.4·minR` floor guarantees the hairpin radius margin. @internal
 */
function gridCorridorPitch(rules: StreetNetworkRules): number {
  const trackWidth = rules.width * WIDTH_MULT.avenue;
  const minR = Math.max(1, rules.minCurveRadius);
  return Math.max(2 * trackWidth + 1.2 * minR, 2.4 * minR);
}

/** Blob coverage fraction for the grid cycle: ~45% of cells at compactness 0.5, ~85% at 1, tapering to a
 *  near-ring at low compactness so the dial's low end reads as an open GP track. @internal */
function gridCoverage(compactness: number): number {
  return Math.max(0.18, Math.min(0.9, 0.05 + compactness * 0.8));
}

/**
 * SPACE-FILLING grid-cycle LAYOUT — the `compactness` construction. Overlay a coarse grid on the usable
 * footprint (node spacing = 2·{@link gridCorridorPitch} so corridors clear after smoothing), grow a
 * seeded connected blob of cells from the centre (fraction `coverage`), build a seeded random spanning
 * tree over the blob with a DIRECTION-PERSISTENCE bias (longer straight corridors as compactness falls),
 * then trace the single closed wall-follower loop AROUND the tree (the boundary of the tree thickened by
 * half a corridor on each side). That loop is provably one self-avoiding cycle that folds back through
 * the interior: straight tree branches → straights, leaves → hairpins, parallel branches → switchback
 * esses. Its rectilinear corners (collinear runs collapsed, small seeded jitter to de-grid) are returned
 * as CONTROL POINTS for the same curve-first centerline pipeline the hull layout feeds. Returns null on a
 * degenerate footprint or blob. @internal
 */
function buildGridCycleControl(
  rules: StreetNetworkRules,
  hx: number,
  hz: number,
  rng: () => number,
  compactness: number,
  coverage: number,
): StreetVec2[] | null {
  const pitch = gridCorridorPitch(rules);
  // Keep the ENTIRE loop (its corner span plus the spline's convex overshoot) clear of the footprint rim
  // so the final centerline's footprint clamp never flattens an arc into a sharp corner (which would
  // defeat the curvature floor). The corner half-span for N node columns is (N − 0.5)·pitch, so the
  // largest N with (N − 0.5)·pitch ≤ margin·hx is floor(margin·hx/pitch + 0.5).
  const margin = 0.84;
  const N = Math.max(2, Math.min(12, Math.floor((margin * hx) / pitch + 0.5)));
  const M = Math.max(2, Math.min(12, Math.floor((margin * hz) / pitch + 0.5)));
  if (N < 2 || M < 2) return null;
  const total = N * M;
  const dirs: readonly [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const cellId = (i: number, j: number): number => j * N + i;
  const inGrid = (i: number, j: number): boolean => i >= 0 && i < N && j >= 0 && j < M;
  const ci = Math.floor(N / 2);
  const cj = Math.floor(M / 2);

  // 1. Blob growth — a connected random cell subset from the centre cell.
  const target = Math.max(3, Math.min(total, Math.round(Math.max(0.18, Math.min(0.9, coverage)) * total)));
  const selected = new Set<number>([cellId(ci, cj)]);
  let guard = 0;
  while (selected.size < target && guard < total * 12) {
    guard += 1;
    const arr = Array.from(selected);
    const from = arr[Math.floor(rng() * arr.length)]!;
    const d = dirs[Math.floor(rng() * 4)]!;
    const ni = (from % N) + d[0];
    const nj = Math.floor(from / N) + d[1];
    if (!inGrid(ni, nj)) continue;
    selected.add(cellId(ni, nj));
  }
  if (selected.size < 3) return null;

  // 2. Direction-biased random spanning tree (recursive-backtracker DFS). Persisting the entry direction
  //    with probability `pPersist` (higher as compactness falls) grows long straight corridors.
  const start = cellId(ci, cj);
  const visited = new Set<number>([start]);
  const enterDir = new Map<number, number>();
  const treeEdges: [number, number][] = [];
  const stack = [start];
  // Direction-persistence probability: high everywhere so corridors run straight for a while (real
  // straights survive), and higher still as compactness falls so low-compactness laps read as open GP
  // tracks with a couple of interior excursions rather than a dense maze.
  const pPersist = 0.55 + (1 - compactness) * 0.35;
  while (stack.length > 0) {
    const cur = stack[stack.length - 1]!;
    const cfi = cur % N;
    const cfj = Math.floor(cur / N);
    const opts: { cell: number; dir: number }[] = [];
    for (let d = 0; d < 4; d += 1) {
      const ni = cfi + dirs[d]![0];
      const nj = cfj + dirs[d]![1];
      if (!inGrid(ni, nj)) continue;
      const nc = cellId(ni, nj);
      if (!selected.has(nc) || visited.has(nc)) continue;
      opts.push({ cell: nc, dir: d });
    }
    if (opts.length === 0) {
      stack.pop();
      continue;
    }
    let choice = opts[Math.floor(rng() * opts.length)]!;
    const pref = enterDir.get(cur);
    if (pref !== undefined) {
      const straightOpt = opts.find((o) => o.dir === pref);
      if (straightOpt !== undefined && rng() < pPersist) choice = straightOpt;
    }
    visited.add(choice.cell);
    enterDir.set(choice.cell, choice.dir);
    treeEdges.push([cur, choice.cell]);
    stack.push(choice.cell);
  }

  // 3. Thin-tree occupancy on the DOUBLED grid: node cell (i,j) → pixel (2i,2j); a tree edge → the pixel
  //    between its endpoints. No pixel ever lands on (odd,odd), so the set has no 2×2 block (no ambiguous
  //    saddle) and, being a tree, no hole — its boundary is a single clean rectilinear loop.
  const W = 2 * N - 1;
  const H = 2 * M - 1;
  const occ = new Set<number>();
  const pix = (x: number, y: number): number => y * W + x;
  const has = (x: number, y: number): boolean => x >= 0 && x < W && y >= 0 && y < H && occ.has(pix(x, y));
  for (const c of visited) occ.add(pix(2 * (c % N), 2 * Math.floor(c / N)));
  for (const [a, b] of treeEdges) {
    occ.add(pix((a % N) + (b % N), Math.floor(a / N) + Math.floor(b / N)));
  }

  // 4. Trace the boundary as directed unit edges with the occupied region on the LEFT (→ CCW), keyed by
  //    start corner. Non-saddle thin region ⇒ the map is a permutation ⇒ chaining yields one closed loop.
  const nextC = new Map<number, [number, number]>();
  const ckey = (x: number, y: number): number => y * (W + 2) + x;
  let sx = Infinity;
  let sy = Infinity;
  for (const p of occ) {
    const x = p % W;
    const y = Math.floor(p / W);
    if (!has(x, y - 1)) nextC.set(ckey(x, y), [x + 1, y]);
    if (!has(x + 1, y)) nextC.set(ckey(x + 1, y), [x + 1, y + 1]);
    if (!has(x, y + 1)) nextC.set(ckey(x + 1, y + 1), [x, y + 1]);
    if (!has(x - 1, y)) nextC.set(ckey(x, y + 1), [x, y]);
    if (y < sy || (y === sy && x < sx)) {
      sx = x;
      sy = y;
    }
  }
  if (!Number.isFinite(sx)) return null;
  const trace: [number, number][] = [];
  let curX = sx;
  let curY = sy;
  let steps = 0;
  const limit = (W + 2) * (H + 2) * 4;
  do {
    trace.push([curX, curY]);
    const nx = nextC.get(ckey(curX, curY));
    if (nx === undefined) break;
    curX = nx[0];
    curY = nx[1];
    steps += 1;
  } while ((curX !== sx || curY !== sy) && steps < limit);
  if (trace.length < 4) return null;

  // 5. Keep only turn corners (collapse collinear runs so straights survive as one edge), map to world,
  //    and add a small seeded jitter (well under a corridor pitch) to de-grid the look.
  const T = trace.length;
  const halfX = (2 * N - 1) / 2;
  const halfY = (2 * M - 1) / 2;
  const jAmp = compactness * pitch * 0.06;
  const out: StreetVec2[] = [];
  for (let i = 0; i < T; i += 1) {
    const prev = trace[(i - 1 + T) % T]!;
    const c = trace[i]!;
    const nxt = trace[(i + 1) % T]!;
    const cross = (c[0] - prev[0]) * (nxt[1] - c[1]) - (c[1] - prev[1]) * (nxt[0] - c[0]);
    if (cross === 0) continue; // collinear pass-through — drop it, keeping the straight run one edge
    const jx = jAmp > 0 ? (rng() - 0.5) * 2 * jAmp : 0;
    const jz = jAmp > 0 ? (rng() - 0.5) * 2 * jAmp : 0;
    const wx = (c[0] - halfX) * pitch + jx;
    const wz = (c[1] - halfY) * pitch + jz;
    out.push([Math.max(-hx + 1, Math.min(hx - 1, wx)), Math.max(-hz + 1, Math.min(hz - 1, wz))]);
  }
  return out.length >= 6 ? out : null;
}

/**
 * Grow a closed race CIRCUIT as a CURVE-FIRST centerline, not a filleted polygon. The global layout
 * synthesis (hull + deep inward displacement + control-point corner templates) is kept, but its polygon
 * is treated as CONTROL POINTS: 1–3 edges are collapsed onto lines as deliberate straights, then a
 * periodic centripetal Catmull-Rom spline is fitted through the points and sampled densely, and a
 * curvature CLAMP relaxes any spot tighter than `minCurveRadius` — so the lap is MOSTLY continuous curve
 * (long sweepers, flowing esses, parabolic entries) with straights as exceptions, instead of straight
 * chords joined by small corner caps. Self-clearance is checked on the final sampled spline with the same
 * bounded, deterministic reject-and-retry (decaying fold aggression, safe fallback). The sampled loop is
 * distributed into many node-to-node edges (nodes ON the spline), then a lane-level pit spur leaves and
 * rejoins the loop beside the start/finish straight.
 */
function buildCircuit(
  rules: StreetNetworkRules,
  hx: number,
  hz: number,
  streams: (s: string) => () => number,
): { nodes: StreetVec2[]; edges: RawEdge[] } {
  const trackWidth = rules.width * WIDTH_MULT.avenue;
  const clearance = trackWidth * 1.5;
  const gapMin = trackWidth * 5; // arc-length beyond which two nearby segments count as a fold-back
  const axisExtent = Math.max(hx, hz) * 2 * 0.9;
  const straightMin = axisExtent * 0.18;
  const minR = Math.max(1, rules.minCurveRadius);
  // Sample fine enough that, once the clamp guarantees radius ≥ minR, no discrete turn between samples
  // exceeds ~6° (step/minR ≤ 0.10 rad). The 8 m cap only lowers the ratio for large-radius tracks.
  const sampleStep = Math.min(minR * 0.1, 8);

  // Fit a smooth curve-first centerline from a folded control polygon and floor its curvature.
  const centerline = (control: StreetVec2[], rng: () => number): { loop: StreetVec2[]; straight: boolean[] } | null => {
    const ded = dedupeRing(control);
    if (ded.length < 4) return null;
    const designated = designateStraights(ded, rules, rng);
    // Two-stage smoothing so the curvature clamp is fast AND the output is finely, continuously sampled:
    // (1) fit a dense spline and resample to a COARSE uniform working loop (~minR/2 spacing) — coarse
    // spacing lets a stable narrow Laplacian clamp converge quickly (fine spacing makes each pass a
    // sagitta-sized crumb); (2) relax that loop to the radius floor; (3) re-fit a dense spline through the
    // relaxed points for the smooth, ≤~6°/sample output centerline.
    const fitted = fitClosedSpline(designated.pts, designated.straight, sampleStep * 0.4);
    if (fitted.pts.length < 8) return null;
    const coarse = resampleClosedUniform(fitted.pts, fitted.straight, Math.max(sampleStep, minR * 0.4));
    if (coarse.pts.length < 8) return null;
    relaxCurvature(coarse.pts, minR);
    const out = fitClosedSpline(coarse.pts, coarse.straight, sampleStep);
    const loop = out.pts;
    const straight = out.straight;
    if (loop.length < 8) return null;
    // A few light narrow passes iron out the small curvature STEP a C1 Catmull-Rom leaves at each knot, so
    // curvature reads continuous ("flows"), not corner-capped — at dense spacing this barely moves points
    // and only lowers curvature, so the radius floor still holds and straights (collinear fixpoints) stay
    // crisp.
    for (let it = 0; it < 8; it += 1) smoothLoopPass(loop, 0.1, () => true);
    // Safety lift: if the re-fit's C1 overshoot left any sample just under the floor, ease those samples
    // (and their neighbors) until the floor holds with margin. Mild + local, so it converges quickly and
    // leaves the flowing shape intact.
    const liftFloor = minR * 0.98;
    for (let it = 0; it < 250; it += 1) {
      const sel = new Array<boolean>(loop.length).fill(false);
      let any = false;
      for (let i = 0; i < loop.length; i += 1) {
        const R = circumRadius(loop[(i - 1 + loop.length) % loop.length]!, loop[i]!, loop[(i + 1) % loop.length]!);
        if (R < liftFloor) {
          sel[i] = sel[(i - 1 + loop.length) % loop.length] = sel[(i + 1) % loop.length] = true;
          any = true;
        }
      }
      if (!any) break;
      smoothLoopPass(loop, 0.5, (i) => sel[i]!);
    }
    // Bounded global fallback for a stubborn residual dip at small minR / dense spacing (targeted passes
    // crawl there); runs only while a sub-floor sample survives, so a clean lap is untouched.
    const stillUnder = (): boolean => {
      for (let i = 0; i < loop.length; i += 1) {
        if (circumRadius(loop[(i - 1 + loop.length) % loop.length]!, loop[i]!, loop[(i + 1) % loop.length]!) < liftFloor) return true;
      }
      return false;
    };
    for (let guard = 0; guard < 120 && stillUnder(); guard += 1) smoothLoopPass(loop, 0.15, () => true);
    // Keep the folded lobes inside the footprint (the clamp only contracts, but a fold can still touch the rim).
    for (let i = 0; i < loop.length; i += 1) {
      loop[i] = [Math.max(-hx + 1, Math.min(hx - 1, loop[i]![0])), Math.max(-hz + 1, Math.min(hz - 1, loop[i]![1]))];
    }
    return { loop, straight };
  };

  // The `compactness` dial swaps the LAYOUT source: 0 keeps the hull synthesis (byte-identical), rising
  // values switch to the space-filling grid spanning-tree cycle. Everything below (spline fit, curvature
  // floor, straights, clearance, edges) is shared verbatim so only the control-polygon source changes.
  const compactness = Math.max(0, Math.min(1, rules.compactness ?? 0));
  const baseCoverage = gridCoverage(compactness);
  // A space-filling grid lap should still carry a deliberate main straight of ~3 corridor pitches (a
  // straight tree branch) alongside the base axis-fraction floor.
  const compactStraightGate = compactness > 0 ? Math.max(straightMin, 3 * gridCorridorPitch(rules)) : straightMin;
  let chosen: { loop: StreetVec2[]; straight: boolean[] } | null = null;
  // Fallback compact candidate (the FIRST clearing one, i.e. the densest / most space-filling, since
  // coverage only shrinks over attempts): used if no attempt also lands the preferred main straight, so a
  // seed that never grows a long straight still keeps a folded lap instead of collapsing to the hull.
  let denseCompact: { loop: StreetVec2[]; straight: boolean[] } | null = null;
  // Each compact attempt runs the full dense curvature-floored centerline, so cap retries tighter than the
  // hull path; taking the densest clearing candidate with a real straight usually stops in 1–3 attempts.
  const maxTries = compactness > 0 ? 8 : MAX_CIRCUIT_TRIES;
  // A densely-folded compact candidate can clear spatially yet still hide a tight spot the bounded
  // curvature-floor relaxation couldn't fully open; reject those so an accepted lap always holds the floor.
  const floorHolds = (loop: StreetVec2[]): boolean => {
    const L = loop.length;
    for (let i = 0; i < L; i += 1) {
      if (circumRadius(loop[(i - 1 + L) % L]!, loop[i]!, loop[(i + 1) % L]!) < minR * 0.95) return false;
    }
    return true;
  };
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    if (compactness > 0) {
      // Shrink blob coverage gently per retry so a curvature-floor clearance violation resolves
      // deterministically (a sparser grid folds less tightly) without sacrificing space-filling density.
      const coverage = Math.max(0.4, baseCoverage - attempt * 0.03);
      const candidate = buildGridCycleControl(rules, hx, hz, streams(`circuit:grid:${attempt}`), compactness, coverage);
      if (candidate === null || candidate.length < 6) continue;
      const cl = centerline(candidate, streams(`circuit:grid-straight:${attempt}`));
      if (cl === null) continue;
      if (!loopSelfClearing(cl.loop, clearance, gapMin)) continue;
      if (!floorHolds(cl.loop)) continue; // curvature floor must hold on the final spline
      const sr = longestStraightRun(cl.loop, cl.straight);
      if (sr < straightMin) continue; // no readable straight at all — reject
      if (denseCompact === null) denseCompact = cl; // first clearing candidate = densest
      if (sr >= compactStraightGate) {
        chosen = cl; // densest clearing lap that also lands the preferred main straight
        break;
      }
      continue;
    }
    // Fold aggression decays over retries: early attempts push deep folds (a cool, folded circuit);
    // if none clear, later attempts relax toward a gentler layout so the safe fallback stays rare.
    const aggression = Math.max(0.42, 1 - attempt * 0.075);
    const candidate = synthTrack(rules, hx, hz, streams(`circuit:try:${attempt}`), aggression);
    if (candidate === null || candidate.length < 6) continue;
    const cl = centerline(candidate, streams(`circuit:straight:${attempt}`));
    if (cl === null) continue;
    if (longestStraightRun(cl.loop, cl.straight) < straightMin) continue;
    if (!loopSelfClearing(cl.loop, clearance, gapMin)) continue;
    chosen = cl;
    break;
  }
  // Keep the densest clearing space-filling lap when none also met the preferred main-straight length;
  // only the total absence of a clearing compact candidate drops through to the hull fallback below.
  if (chosen === null && denseCompact !== null) chosen = denseCompact;
  if (chosen === null) chosen = centerline(fallbackTrack(rules, hx, hz), streams("circuit:fallback"));
  if (chosen === null) {
    // Degenerate footprint — a bare inset ellipse keeps the loop contract alive.
    const fb = fallbackTrack(rules, hx, hz);
    chosen = { loop: fb, straight: new Array<boolean>(fb.length).fill(false) };
  }

  const loop = chosen.loop;
  const straight = chosen.straight;
  // Orient CCW for a stable outward pit normal, then park index 0 on the start/finish straight.
  if (signedArea(loop) < 0) {
    loop.reverse();
    straight.reverse();
  }
  rotateToStraight(loop, straight);
  const { nodes, edges } = distributeLoopEdges(loop, straight, rules.segmentLength);
  const k = nodes.length;

  // Pit lane: a lane-level chain that leaves the loop one node before the start/finish straight and
  // rejoins one node after it — two degree-3 junctions on the loop, never a dead-end stub.
  if (rules.branching > 0.25 && k >= 4 && nodes.length + 2 <= MAX_NODES) {
    const pitRng = streams("circuit:pit");
    const si = longestEdge(nodes).index;
    const leaveIdx = (si - 1 + k) % k;
    const rejoinIdx = (si + 2) % k;
    if (leaveIdx !== rejoinIdx && leaveIdx !== si && rejoinIdx !== (si + 1) % k) {
      const s0 = nodes[si]!;
      const s1 = nodes[(si + 1) % k]!;
      const dx = s1[0] - s0[0];
      const dz = s1[1] - s0[1];
      const l = Math.hypot(dx, dz) || 1;
      // Outward normal (away from the loop centroid) so the pit lane sits beside the main straight.
      let nx = -dz / l;
      let nz = dx / l;
      const mx = (s0[0] + s1[0]) / 2;
      const mz = (s0[1] + s1[1]) / 2;
      if (mx * nx + mz * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const off = trackWidth * (1.8 + pitRng() * 0.6);
      const leave = nodes[leaveIdx]!;
      const rejoin = nodes[rejoinIdx]!;
      const pitA: StreetVec2 = [leave[0] + nx * off, leave[1] + nz * off];
      const pitB: StreetVec2 = [rejoin[0] + nx * off, rejoin[1] + nz * off];
      if (
        Math.abs(pitA[0]) < hx - 1 &&
        Math.abs(pitA[1]) < hz - 1 &&
        Math.abs(pitB[0]) < hx - 1 &&
        Math.abs(pitB[1]) < hz - 1
      ) {
        const idA = nodes.length;
        nodes.push(pitA);
        const idB = nodes.length;
        nodes.push(pitB);
        edges.push({ a: leaveIdx, b: idA, lane: true });
        edges.push({ a: idA, b: idB, lane: true });
        edges.push({ a: idB, b: rejoinIdx, lane: true });
      }
    }
  }
  return { nodes, edges };
}

/** Decide which topology family the sliders call for. Circuit wins when loops dominate and both
 *  branching and mesh connectivity are low — exactly the "race track" corner of the slider space.
 *  @internal */
export function streetNetworkMode(rules: StreetNetworkRules): StreetNetworkMode {
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
  rules: StreetNetworkRules,
  rng: () => number,
  ctx: LevelContext,
): StreetLevel[] {
  const levels = new Array<StreetLevel>(chains.length).fill("street");
  // Centrality score per non-lane chain: sum of endpoint-node betweenness weighted by chain length.
  // A chain that DEAD-ENDS (an endpoint no other chain reaches — residential branches, cul-de-sacs)
  // is never arterial: arterials are through-routes, and a bulb-capped boulevard reads absurd.
  const score = chains.map((c) => {
    if (c.lane) return -1;
    if (!c.loop) {
      const first = c.nodes[0]!;
      const last = c.nodes[c.nodes.length - 1]!;
      if ((ctx.chainsAt.get(first)?.length ?? 0) <= 1 || (ctx.chainsAt.get(last)?.length ?? 0) <= 1) return -1;
    }
    let s = 0;
    for (const nid of c.nodes) s += ctx.bt[nid] ?? 0;
    return s * Math.max(1, c.length);
  });
  const nonLane = chains.map((_, i) => i).filter((i) => !chains[i]!.lane);
  const arterial = new Set<number>();
  const ranked = nonLane.slice().sort((a, b) => score[b]! - score[a]!);
  const arterialCut = Math.max(1, Math.ceil(nonLane.length * 0.28));
  for (let r = 0; r < ranked.length && arterial.size < arterialCut; r += 1) arterial.add(ranked[r]!);

  // Connectivity repair: an arterial chain must not terminate at an interior junction whose other
  // chains are all non-arterial. Extend through the most-central neighbor, or demote if impossible.
  const bestNeighborAt = (node: number, self: number): number => {
    const here = ctx.chainsAt.get(node) ?? [];
    let best = -1;
    let bestScore = -Infinity;
    for (const ci of here) {
      if (ci === self || chains[ci]!.lane || arterial.has(ci)) continue;
      if (score[ci]! < 0) continue; // never extend an artery into a dead-ending branch
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
      for (const endNode of [chain.nodes[0]!, chain.nodes[chain.nodes.length - 1]!]) {
        if (ctx.isRim(endNode)) continue; // rim endpoints are fine
        if ((ctx.degree[endNode] ?? 0) < 2) continue; // a genuine cul-de-sac terminus is fine
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
  if (arterial.size === 0 && ranked.length > 0) arterial.add(ranked[0]!);

  for (let ci = 0; ci < chains.length; ci += 1) {
    if (chains[ci]!.lane) {
      levels[ci] = "lane";
    } else if (arterial.has(ci)) {
      levels[ci] = rng() < rules.boulevards ? "boulevard" : "avenue";
    }
  }
  return levels;
}

/** Nearest distance from a point to a polyline (for keeping sidewalk vertices off the road surface). */
function pointPolylineDist(px: number, pz: number, line: readonly StreetVec2[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const l2 = abx * abx + abz * abz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / l2));
    const d = Math.hypot(px - (a[0] + abx * t), pz - (a[1] + abz * t));
    if (d < best) best = d;
  }
  return best;
}

/** 2D segment/segment proper-intersection test (shared endpoints don't count). */
function segmentsCross(p1: StreetVec2, p2: StreetVec2, p3: StreetVec2, p4: StreetVec2): boolean {
  const d = (a: StreetVec2, b: StreetVec2, c: StreetVec2): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
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
    if (pointPolylineDist(pts[i]![0], pts[i]![1], centerline) < floor) continue; // welded away
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

/**
 * Resolve a full path network from its rules inside a volume of half-extents `hx`×`hz`. Deterministic
 * per `(rules.seed, hx, hz, context)`. Pass a {@link StreetNetworkContext} with a ground sampler to turn
 * water gaps into bridges and ridges into tunnels. Coordinates are volume-local; the caller maps to
 * world space.
 *
 * @capability street-generator build a deterministic street/track graph (nodes, edges, streets, junctions, sidewalks, bridges, tunnels) from sliders
 */
export function generateStreets(
  rules: StreetNetworkRules,
  hx: number,
  hz: number,
  context: StreetNetworkContext = {},
): StreetNetwork {
  const streams = seededStreams(`pathnet:${rules.seed}:${Math.round(hx)}:${Math.round(hz)}`);
  const mode = streetNetworkMode(rules);
  const raw = mode === "circuit" ? buildCircuit(rules, hx, hz, streams) : buildNet(rules, hx, hz, streams);
  const rawNodes = raw.nodes;
  const rawEdges = raw.edges.filter((e) => e.a !== e.b);

  // --- degrees + adjacency over the atomic graph ---
  const degree = new Array<number>(rawNodes.length).fill(0);
  const adj: { edge: number; other: number }[][] = rawNodes.map(() => []);
  const adjNodes: number[][] = rawNodes.map(() => []);
  rawEdges.forEach((e, i) => {
    degree[e.a] += 1;
    degree[e.b] += 1;
    adj[e.a]!.push({ edge: i, other: e.b });
    adj[e.b]!.push({ edge: i, other: e.a });
    adjNodes[e.a]!.push(e.b);
    adjNodes[e.b]!.push(e.a);
  });

  // --- level per edge: chain length drives the hierarchy, so compute chains first (topology only). ---
  // A synthesized circuit loop carries its OWN pre-sampled smooth-spline centerline per edge (the
  // curve-first construction), so those edges are used verbatim; only the pit-lane chords (and every
  // city-net edge) get wandered. Circuit pit chords straighten (winding 0) — their corners come from the
  // fillet at the pit entry/exit, not sine wander.
  const wanderRules: StreetNetworkRules = mode === "circuit" ? { ...rules, winding: 0 } : rules;
  const edgeWander: StreetVec2[][] = rawEdges.map((e) =>
    // Clamp crests to the footprint so a curve near the rim never bulges outside the volume.
    (e.points ?? wanderEdge(rawNodes[e.a]!, rawNodes[e.b]!, streams(`edge:${e.a}:${e.b}`), wanderRules)).map(
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
  const elevationDial = rules.elevation ?? 0;
  const maxGrade = rules.maxGrade ?? 0.07;
  // A seeded smooth field draped over the network. Wholly separate from the `context.heightAt` TERRAIN
  // sampler that drives bridges/tunnels — this shapes the road surface, that is the world ground.
  const elevationAt =
    elevationDial > 0
      ? makeElevationField(
          streams("elevation"),
          Math.max(hx, hz) * 2,
          // dial 1 ≈ 22 m relief across a ~520 m volume, scaled to this footprint.
          elevationDial * Math.max(hx, hz) * 2 * (22 / 520),
        )
      : undefined;

  // --- assemble atomic edges ---
  const minRad = (rules.minTurnAngle * Math.PI) / 180;
  const maxRad = (rules.maxTurnAngle * Math.PI) / 180;
  const sidewalkWidth = rules.sidewalkWidth ?? DEFAULT_SIDEWALK_WIDTH;
  const edges: StreetEdge[] = rawEdges.map((e, i) => {
    const edge: StreetEdge = {
      id: i,
      a: e.a,
      b: e.b,
      points: edgeWander[i]!,
      width: rules.width * WIDTH_MULT[edgeLevel[i]!],
      level: edgeLevel[i]!,
      loop: mode === "circuit" && !e.lane,
    };
    // Raw (uncapped) field samples for continuity; the grade-limited profile lives on the owning street.
    if (elevationAt) edge.heights = edge.points.map((p) => elevationAt(p[0], p[1]));
    return edge;
  });

  // --- assemble chained streets (smoothed geometry for rendering) ---
  const heightAt = context.heightAt;
  const streets: Street[] = [];
  chains.forEach((chain, ci) => {
    if (streets.length >= MAX_STREETS) return;
    const level = levels[ci]!;
    const width = rules.width * WIDTH_MULT[level];
    // Concatenate the chain's atomic wander polylines (dropping duplicated shared vertices).
    const pts: StreetVec2[] = [];
    chain.edges.forEach((ei, k) => {
      const e = rawEdges[ei]!;
      let seg = edgeWander[ei]!;
      // Orient the segment so it continues the chain's node order.
      const wantStart = chain.nodes[k]!;
      if (e.b === wantStart && e.a !== wantStart) seg = [...seg].reverse();
      for (let s = 0; s < seg.length; s += 1) {
        if (pts.length > 0 && s === 0) continue;
        pts.push(seg[s]!);
      }
    });
    // The circuit LOOP is already a smooth, curvature-floored spline (curve-first construction) — its
    // concatenated edge samples ARE the final centerline, so it skips the polygon fillet entirely.
    // City nets and circuit pit lanes still fillet their corners at `minCurveRadius`.
    const isCircuitLoop = mode === "circuit" && chain.loop;
    const smooth = isCircuitLoop
      ? pts.map((p) => [p[0], p[1]] as StreetVec2)
      : clampTurns(pts, minRad, maxRad, rules.minCurveRadius, chain.loop);
    const street: Street = {
      id: streets.length,
      nodes: chain.nodes,
      points: smooth,
      width,
      level,
      loop: chain.loop,
      features: [],
    };
    // Grade-limited road-surface heights sampled from the shared field (loops stay continuous at the seam).
    if (elevationAt) {
      street.heights = gradeCapHeights(smooth, smooth.map((p) => elevationAt(p[0], p[1])), maxGrade, chain.loop);
    }
    // Flanking pedestrian bands on paved streets (not service lanes).
    if (level !== "lane" && smooth.length >= 2) {
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
      street.features = detectFeatures(smooth, heightAt, context);
    }
    streets.push(street);
  });

  // --- junctions from degree≥3 nodes; arms from incident edge tangents ---
  const junctions: StreetJunction[] = [];
  for (let n = 0; n < rawNodes.length; n += 1) {
    if (degree[n] < 3) continue;
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

  const network: StreetNetwork = { mode, nodes, edges, streets, junctions, deadEnds, bridges, tunnels, loops };
  // Expose the shared field only when elevation is on, so a flat network stays byte-identical.
  if (elevationAt) network.elevationAt = elevationAt;
  return network;
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
  context: StreetNetworkContext,
): StreetFeatureSpan[] {
  const minEl = context.minElevation ?? -2;
  const clearance = context.tunnelClearance ?? 6;
  const wantBridge = context.bridges === true;
  const wantTunnel = context.tunnels === true;
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
