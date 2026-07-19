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
 * - `winding` — sideways wander amplitude of every edge (and, in a circuit, how many corner templates
 *   — chicanes, esses, hairpins — get carved), capped so curvature never exceeds `1 / minCurveRadius`;
 *   `minTurnAngle`/`maxTurnAngle` are HARD clamps on the corner a street may take at any vertex —
 *   shallow wiggles are straightened, and every real corner is replaced with a sampled circular-arc
 *   fillet of radius `minCurveRadius` so corners read as CURVES, never single bevels, and no discrete
 *   turn between consecutive samples exceeds `maxTurnAngle`.
 * - `bridges` / `tunnels` (with a ground sampler) — a span that dives under `minElevation` becomes a
 *   BRIDGE deck; a span buried under a ridge becomes a TUNNEL bore. Both are path FEATURES on a
 *   continuous edge, so a circuit stays closed as it crosses water or pierces a hill.
 * - `sidewalkWidth` — pedestrian band paved on both edges of every boulevard/avenue/street (not lanes),
 *   emitted as offset polylines on each {@link Street}.
 *
 * Hierarchy is STRUCTURAL, not a length percentile: an approximate edge-betweenness centrality over the
 * grown graph elects a connected arterial skeleton (avenues/boulevards) that never dead-ends at an
 * interior junction of lesser roads; everything else is a local street, spurs are lanes.
 *
 * Circuit mode is REAL track synthesis, not a wobbly ellipse: seeded points are scattered, hulled, and
 * their hull-edge midpoints displaced inward (the classic random-track method) into a self-avoiding,
 * non-star-shaped closed polygon that can fold inward; at least one start/finish straight is guaranteed;
 * selected vertices grow chicane/ess/hairpin corner templates; `minCurveRadius` is enforced by the arc
 * fillets and self-clearance (the centerline never runs within ~1.5 track widths of a non-adjacent part
 * of itself) by bounded deterministic reject-and-retry, falling back to a safe simple layout; and when
 * branching is meaningful a lane-level PIT LANE offsets parallel to the start/finish straight, leaving
 * the loop at one node and rejoining at another (two degree-3 junctions, never a dead-end stub).
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
const MAX_CIRCUIT_TRIES = 12;
const BETWEENNESS_SOURCES = 40;
const DEFAULT_SIDEWALK_WIDTH = 2;
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
 * @internal
 */
export function clampTurns(
  points: readonly StreetVec2[],
  minRad: number,
  maxRad: number,
  curveRadius = 0,
  closed = false,
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
  return filletCorners(pts, curveRadius, maxRad, closed);
}

/**
 * Round the corners of a polyline into sampled circular arcs. Each interior corner sharper than a
 * small threshold (or above the `maxRad` ceiling) is replaced by an arc tangent to both legs of radius
 * `curveRadius` (clamped to half the shorter leg; a non-positive radius rounds as large as the legs
 * allow). The arc is sampled uniformly in angle so the turn between consecutive samples is exactly the
 * sweep divided by the sample count — kept at or below `maxRad`. Open endpoints are preserved exactly;
 * a `closed` ring keeps `first === last`.
 * @internal
 */
function filletCorners(points: StreetVec2[], curveRadius: number, maxRad: number, closed: boolean): StreetVec2[] {
  const n0 = points.length;
  if (n0 < 3) return points.map((p) => [p[0], p[1]] as StreetVec2);
  const isClosed =
    closed && Math.hypot(points[0]![0] - points[n0 - 1]![0], points[0]![1] - points[n0 - 1]![1]) < 1e-6;
  const verts = isClosed ? points.slice(0, n0 - 1) : points;
  const n = verts.length;
  if (n < 3) return points.map((p) => [p[0], p[1]] as StreetVec2);
  // Fillet corners above this deflection; clamp to the ceiling so anything over `maxRad` is always
  // rounded (and anything left un-filleted is already under the ceiling).
  const fmin = Math.min(0.14, Math.max(1e-4, maxRad));
  const step = maxRad > 1e-3 ? maxRad : Math.PI;
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
    // Tangent length from the corner: `curveRadius·tan(θ/2)`, clamped to half each leg so adjacent
    // fillets can meet but never overlap. A non-positive radius rounds as large as the legs allow.
    let t = curveRadius > 0 ? curveRadius * tanHalf : Math.min(la, lb) * 0.5;
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
    const segs = Math.max(4, Math.min(48, Math.ceil(Math.abs(delta) / step)));
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
      if (m === n || adj.get(n)?.has(m)) continue;
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

  // 4. branching — spur lanes forking outward off existing nodes, ending in a fresh cul-de-sac node.
  const laneCount = Math.min(Math.round(rules.branching * nodes.length * 0.6), MAX_LANES);
  const branchRng = streams("branches");
  for (let b = 0; b < laneCount && nodes.length < MAX_NODES; b += 1) {
    const host = Math.floor(branchRng() * nodes.length);
    const hp = nodes[host]!;
    const angle = branchRng() * TAU;
    const len = rules.segmentLength * (0.6 + branchRng() * 0.7);
    const nx = hp[0] + Math.cos(angle) * len;
    const nz = hp[1] + Math.sin(angle) * len;
    if (Math.abs(nx) > hx - 1 || Math.abs(nz) > hz - 1) continue;
    // Reject spurs that would spawn on top of an existing node.
    let clash = false;
    for (let m = 0; m < nodes.length; m += 1) {
      if (Math.hypot(nodes[m]![0] - nx, nodes[m]![1] - nz) < rules.segmentLength * 0.45) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    const id = nodes.length;
    nodes.push([nx, nz]);
    edges.push({ a: host, b: id, lane: true });
  }
  return { nodes, edges: edges.slice(0, MAX_EDGES) };
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
 * Synthesize one closed track polygon: scatter seeded points, take their convex hull, displace
 * hull-edge midpoints inward (keeping the longest edge straight for a start/finish), then carve a few
 * chicane/ess/hairpin corner templates. Returns the polygon vertices (not duplicated), or null if the
 * hull was degenerate.
 */
function synthTrack(rules: StreetNetworkRules, hx: number, hz: number, rng: () => number): StreetVec2[] | null {
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
    // Push the midpoint inward by a seeded amount — this is what folds the hull into a real track.
    // Kept modest so dents create concavities without pinching the loop into a self-crossing.
    const amt = Math.min(edgeLen * (0.08 + rng() * (0.14 + rules.winding * 0.14)), d * 0.28);
    if (d > 1e-3 && amt > 1e-3) {
      poly.push([mx + (dx / d) * amt, mz + (dz / d) * amt]);
    } else {
      poly.push([mx, mz]);
    }
  }
  applyCornerTemplates(poly, rules, rng);
  // Clamp everything back inside the footprint.
  for (let i = 0; i < poly.length; i += 1) {
    poly[i] = [Math.max(-hx + 1, Math.min(hx - 1, poly[i]![0])), Math.max(-hz + 1, Math.min(hz - 1, poly[i]![1]))];
  }
  return poly;
}

/**
 * Carve chicane/ess/hairpin corner templates into a track polygon in place. Templates are seeded and
 * their count scales with `winding`; hairpins only appear when `maxTurnAngle` admits a tight reversal.
 * Each template offsets an edge midpoint perpendicular to travel (chicane/ess) or deepens a vertex
 * inward (hairpin) — all local, so self-clearance is preserved for the reject-and-retry check.
 */
function applyCornerTemplates(poly: StreetVec2[], rules: StreetNetworkRules, rng: () => number): void {
  const count = Math.round(rules.winding * 3);
  if (count <= 0 || poly.length < 6) return;
  const allowHairpin = rules.maxTurnAngle >= 110;
  const step = rules.segmentLength;
  for (let c = 0; c < count; c += 1) {
    const n = poly.length;
    const i = 1 + Math.floor(rng() * (n - 2));
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) continue;
    const nx = -dz / l;
    const nz = dx / l;
    const at = (i + 1) % n === 0 ? n : i + 1;
    const roll = rng();
    if (allowHairpin && roll < 0.3) {
      // Hairpin: a single deep outward apex → the tight turn `maxTurnAngle` permits.
      const off = step * (0.6 + rng() * 0.3);
      poly.splice(at, 0, [mx + nx * off, mz + nz * off]);
    } else if (roll < 0.65) {
      // Chicane: two opposite offsets flanking the midpoint (an S).
      const off = step * (0.18 + rng() * 0.22);
      const t1: StreetVec2 = [a[0] + dx * 0.33 + nx * off, a[1] + dz * 0.33 + nz * off];
      const t2: StreetVec2 = [a[0] + dx * 0.66 - nx * off, a[1] + dz * 0.66 - nz * off];
      poly.splice(at, 0, t1, t2);
    } else {
      // Ess: a single gentle perpendicular nudge at the midpoint.
      const off = step * (0.14 + rng() * 0.18) * (rng() < 0.5 ? 1 : -1);
      poly.splice(at, 0, [mx + nx * off, mz + nz * off]);
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

/**
 * Grow a closed race CIRCUIT via real track synthesis: hull-and-inward-displacement layout with
 * corner templates, enforcing `minCurveRadius` (via the downstream arc fillets) and self-clearance by
 * bounded, deterministic reject-and-retry, then a lane-level pit spur that leaves and rejoins the loop.
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
  const minRad = (rules.minTurnAngle * Math.PI) / 180;
  const maxRad = (rules.maxTurnAngle * Math.PI) / 180;
  // A candidate must be self-clearing on the actual FILLETED centerline (what gets driven/rendered),
  // not just on the raw node polygon — so fillet it the same way the street assembly will.
  const filletedClearing = (candidate: StreetVec2[]): boolean => {
    const closed = clampTurns([...candidate, candidate[0]!], minRad, maxRad, rules.minCurveRadius, true);
    return loopSelfClearing(closed.slice(0, -1), clearance, gapMin);
  };

  let poly: StreetVec2[] | null = null;
  for (let attempt = 0; attempt < MAX_CIRCUIT_TRIES; attempt += 1) {
    const candidate = synthTrack(rules, hx, hz, streams(`circuit:try:${attempt}`));
    if (candidate === null || candidate.length < 6) continue;
    if (longestEdge(candidate).length < straightMin) continue;
    if (!loopSelfClearing(candidate, clearance, gapMin)) continue;
    if (!filletedClearing(candidate)) continue;
    poly = candidate;
    break;
  }
  if (poly === null) poly = fallbackTrack(rules, hx, hz);

  // Orient CCW for a stable outward normal, then build the ring nodes/edges.
  if (signedArea(poly) < 0) poly.reverse();
  const nodes: StreetVec2[] = poly.map((p) => [p[0], p[1]] as StreetVec2);
  const k = nodes.length;
  const edges: RawEdge[] = [];
  for (let i = 0; i < k; i += 1) edges.push({ a: i, b: (i + 1) % k, lane: false });

  // Pit lane: a lane-level chain that leaves the loop one node before the start/finish straight and
  // rejoins one node after it — two degree-3 junctions on the loop, never a dead-end stub.
  if (rules.branching > 0.25 && nodes.length + 2 <= MAX_NODES) {
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

  // Connectivity repair: an arterial chain must not terminate at an interior junction whose other
  // chains are all non-arterial. Extend through the most-central neighbor, or demote if impossible.
  const bestNeighborAt = (node: number, self: number): number => {
    const here = ctx.chainsAt.get(node) ?? [];
    let best = -1;
    let bestScore = -Infinity;
    for (const ci of here) {
      if (ci === self || chains[ci]!.lane || arterial.has(ci)) continue;
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

/** Offset a polyline sideways by `dist` (positive = left of travel) with a per-vertex miter, clamped
 *  so sharp corners don't blow the offset out into a self-intersecting spike. */
function offsetPolyline(points: readonly StreetVec2[], dist: number): StreetVec2[] {
  const n = points.length;
  if (n < 2) return points.map((p) => [p[0], p[1]] as StreetVec2);
  const out: StreetVec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(n - 1, i + 1)]!;
    const tx = next[0] - prev[0];
    const tz = next[1] - prev[1];
    const l = Math.hypot(tx, tz) || 1;
    // Left normal of the local tangent.
    const nx = -tz / l;
    const nz = tx / l;
    out.push([points[i]![0] + nx * dist, points[i]![1] + nz * dist]);
  }
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
  // A synthesized circuit is fully authored by its polygon + arc fillets — random sine wander would
  // just reintroduce the old "wobbly ellipse", so straighten every circuit chord (corners come from
  // the track templates and fillets, not wander).
  const wanderRules: StreetNetworkRules = mode === "circuit" ? { ...rules, winding: 0 } : rules;
  const edgeWander: StreetVec2[][] = rawEdges.map((e) =>
    // Clamp wander crests to the footprint so a curve near the rim never bulges outside the volume.
    wanderEdge(rawNodes[e.a]!, rawNodes[e.b]!, streams(`edge:${e.a}:${e.b}`), wanderRules).map(
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

  // --- assemble atomic edges ---
  const minRad = (rules.minTurnAngle * Math.PI) / 180;
  const maxRad = (rules.maxTurnAngle * Math.PI) / 180;
  const sidewalkWidth = rules.sidewalkWidth ?? DEFAULT_SIDEWALK_WIDTH;
  const edges: StreetEdge[] = rawEdges.map((e, i) => ({
    id: i,
    a: e.a,
    b: e.b,
    points: edgeWander[i]!,
    width: rules.width * WIDTH_MULT[edgeLevel[i]!],
    level: edgeLevel[i]!,
    loop: mode === "circuit" && !e.lane,
  }));

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
    const smooth = clampTurns(pts, minRad, maxRad, rules.minCurveRadius, chain.loop);
    const street: Street = {
      id: streets.length,
      nodes: chain.nodes,
      points: smooth,
      width,
      level,
      loop: chain.loop,
      features: [],
    };
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

  return { mode, nodes, edges, streets, junctions, deadEnds, bridges, tunnels, loops };
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
