/**
 * The unified, seed-driven procedural PATH NETWORK — one generator that grows an entire road/track
 * graph inside a box volume and answers to sliders instead of hardcoded geometry. It is deliberately
 * genre-agnostic: a city street net and a closed race circuit are the *same* engine at opposite
 * slider extremes, not two code paths. Drop a volume, pick a seed, and turn the dials:
 *
 * - `gridness` — 1 lays nodes on a regular lattice (Manhattan); 0 scatters them (organic hills).
 * - `loopiness` — 0 grows a tree that dead-ends; 1 collapses to a single closed loop (a circuit).
 * - `connectivity` — extra chord edges between neighbors → mesh density (a dense city grid).
 * - `branching` — spur lanes forking off the mains, ending in cul-de-sacs.
 * - `deadEnds` — fraction of dangling ends KEPT as cul-de-sacs vs reconnected into loops.
 * - `winding` — sideways wander amplitude of every edge, capped so curvature never exceeds
 *   `1 / minCurveRadius`; `minTurnAngle`/`maxTurnAngle` are HARD clamps on the corner a street may
 *   take at any vertex (shallow wiggles straightened, hairpins beveled away).
 * - `bridges` / `tunnels` (with a ground sampler) — a span that dives under `minElevation` becomes a
 *   BRIDGE deck; a span buried under a ridge becomes a TUNNEL bore. Both are path FEATURES on a
 *   continuous edge, so a circuit stays closed as it crosses water or pierces a hill.
 *
 * Output is two coupled views of the graph: atomic node-to-node {@link PathEdge}s (fed straight into
 * the block/parcel fabric — a race circuit is many edges between distinct nodes, never one fragile
 * self-loop) and chained {@link PathStreet}s (through-streets for rendering, furniture, and
 * junctions). Pure deterministic math — same rules + seed + volume ⇒ identical network — with bounded
 * work caps so a huge volume can never generate unbounded content. Local (volume-centered) coords;
 * the caller rotates/translates into world space.
 *
 * @capability path-network seed-driven procedural roads and race circuits from one slider-driven engine
 */
import { seededStreams } from "../random/rng";

/** A path vertex in the volume-local XZ frame. */
export type PathVec2 = readonly [number, number];

/** Road hierarchy, widest to narrowest — shared by the city fabric and the renderer. */
export type PathLevel = "boulevard" | "avenue" | "street" | "lane";

/** A path feature spanning part of an edge/street: a bridge deck over a gap or a tunnel bore under a ridge. */
export type PathFeatureKind = "bridge" | "tunnel";

/** The generator's chosen topology family: an open street `net`, or a closed `circuit` loop. */
export type PathNetworkMode = "net" | "circuit";

/** One graph node: a junction, a dead end, or a mid-street bend, with its connection count. */
export interface PathNode {
  id: number;
  x: number;
  z: number;
  degree: number;
}

/** One atomic node-to-node edge — the fabric graph consumes these (welds at shared node coords). */
export interface PathEdge {
  id: number;
  /** Endpoint node ids. */
  a: number;
  b: number;
  /** Sampled centerline; `points[0]` sits exactly on node `a`, the last on node `b`. */
  points: PathVec2[];
  width: number;
  level: PathLevel;
  /** True when this edge belongs to the main closed loop (circuit mode). */
  loop: boolean;
}

/** A feature span carried by a street: a `[from, to]` index window into the street's `points`. */
export interface PathFeatureSpan {
  kind: PathFeatureKind;
  from: number;
  to: number;
  /** Ground height at each bank/portal — the deck/floor reference the renderer drapes to. */
  bankHeight: number;
}

/** One chained through-street: a maximal run of edges through degree-2 nodes, for rendering + furniture. */
export interface PathStreet {
  id: number;
  /** Ordered node ids the chain visits; first === last when `loop`. */
  nodes: number[];
  /** Smoothed, turn-clamped centerline. */
  points: PathVec2[];
  width: number;
  level: PathLevel;
  /** Closed chain (a circuit lap or an inner ring). */
  loop: boolean;
  /** Cul-de-sac turning bulb when the street ends at a dangling node. */
  bulb?: PathVec2;
  /** Bridge/tunnel spans along this street, if any. */
  features: PathFeatureSpan[];
}

/** One crossing of three or more streets: patch center/radius plus outgoing arm directions. */
export interface PathJunction {
  x: number;
  z: number;
  radius: number;
  level: PathLevel;
  /** Outgoing arm directions (radians) with the crossing street width, for crosswalks/patches. */
  arms: { angle: number; width: number }[];
}

/** One dangling street end kept as a cul-de-sac: node position plus the heading pointing off the road. */
export interface PathDeadEnd {
  node: number;
  x: number;
  z: number;
  /** Yaw (radians) facing outward, away from the network. */
  heading: number;
  width: number;
}

/** A resolved path feature in world-of-the-volume space: a bridge deck or tunnel bore centerline. */
export interface PathFeature {
  kind: PathFeatureKind;
  points: PathVec2[];
  width: number;
  bankHeight: number;
}

/** The fully-resolved network in volume-local coords. */
export interface PathNetwork {
  mode: PathNetworkMode;
  nodes: PathNode[];
  /** Atomic edges — feed to the block/parcel fabric. */
  edges: PathEdge[];
  /** Chained through-streets — feed to the renderer, furniture, and analysis. */
  streets: PathStreet[];
  junctions: PathJunction[];
  deadEnds: PathDeadEnd[];
  bridges: PathFeature[];
  tunnels: PathFeature[];
  /** Independent cycle count (E − V + components): 0 = pure tree, ≥1 = has loops. */
  loops: number;
}

/** Fully-defaulted slider set the generator reads. */
export interface PathNetworkRules {
  seed: string;
  /** 1 = regular lattice nodes; 0 = organic scatter. */
  gridness: number;
  /** 0 = tree (dead-ends); 1 = a single closed circuit. */
  loopiness: number;
  /** Extra chord edges between neighbors → mesh density. */
  connectivity: number;
  /** Spur-lane density forking off the mains. */
  branching: number;
  /** Fraction of dangling ends kept as cul-de-sacs (vs reconnected). */
  deadEnds: number;
  /** Target node spacing / block size, world units. */
  segmentLength: number;
  /** Cross-axis spacing multiplier (≥1 = long skinny Manhattan blocks). */
  aspect: number;
  /** Sideways wander amplitude, 0..1. */
  winding: number;
  /** Minimum curve radius (m) — caps wander curvature and corner tightness. */
  minCurveRadius: number;
  /** Shallowest corner (degrees) a street keeps — gentler bends are straightened. */
  minTurnAngle: number;
  /** Sharpest corner (degrees) a street may take — tighter ones are beveled away. */
  maxTurnAngle: number;
  /** Base street width; the hierarchy scales off it. */
  width: number;
  /** Share of avenues upgraded to boulevards, 0..1. */
  boulevards: number;
}

/** Ground sampler + feature toggles enabling bridges/tunnels; omit for a flat, feature-free network. */
export interface PathNetworkContext {
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
const LEVEL_RANK: Record<PathLevel, number> = { boulevard: 3, avenue: 2, street: 1, lane: 0 };
const WIDTH_MULT: Record<PathLevel, number> = { boulevard: 2.2, avenue: 1.5, street: 1, lane: 0.65 };

/** Turn angle (radians, 0..π) at `b` going a→b→c; 0 = straight, π = full reversal. */
function turnAngle(a: PathVec2, b: PathVec2, c: PathVec2): number {
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
 * Hard turn-angle clamp on a polyline with fixed endpoints: interior corners gentler than `minRad`
 * are straightened away (deliberate winding only, no micro-wiggle) and corners sharper than `maxRad`
 * are beveled — the corner vertex is replaced by two points pulled back along each leg, which
 * strictly reduces the angle. Endpoints never move, so a graph node stays welded.
 */
export function clampTurns(points: readonly PathVec2[], minRad: number, maxRad: number): PathVec2[] {
  if (points.length < 3) return points.map((p) => [p[0], p[1]] as PathVec2);
  // 1. straighten pass — drop interior vertices whose corner is shallower than the minimum.
  let pts: PathVec2[] = points.map((p) => [p[0], p[1]] as PathVec2);
  if (minRad > 0) {
    let changed = true;
    let guard = 0;
    while (changed && guard < 40) {
      changed = false;
      guard += 1;
      const out: PathVec2[] = [pts[0]!];
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
  // 2. bevel pass — repeatedly cut the sharpest over-max corner until all corners obey the ceiling.
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    let worst = -1;
    let worstAngle = maxRad;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const angle = turnAngle(pts[i - 1]!, pts[i]!, pts[i + 1]!);
      if (angle > worstAngle) {
        worstAngle = angle;
        worst = i;
      }
    }
    if (worst < 0) break;
    const a = pts[worst - 1]!;
    const v = pts[worst]!;
    const b = pts[worst + 1]!;
    const la = Math.hypot(a[0] - v[0], a[1] - v[1]) || 1;
    const lb = Math.hypot(b[0] - v[0], b[1] - v[1]) || 1;
    const cut = 0.42;
    const p0: PathVec2 = [v[0] + ((a[0] - v[0]) / la) * la * cut, v[1] + ((a[1] - v[1]) / la) * la * cut];
    const p1: PathVec2 = [v[0] + ((b[0] - v[0]) / lb) * lb * cut, v[1] + ((b[1] - v[1]) / lb) * lb * cut];
    pts.splice(worst, 1, p0, p1);
  }
  return pts;
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
function windingAmplitude(rules: PathNetworkRules, wavelength: number): number {
  const want = rules.winding * rules.segmentLength * 0.34;
  // Peak curvature of A·sin(2πt/λ) is A·(2π/λ)²; keep radius ≥ minCurveRadius (0.35 covers the octave mix).
  const cap = (0.35 * wavelength * wavelength) / (4 * Math.PI * Math.PI * Math.max(1, rules.minCurveRadius));
  return Math.max(0, Math.min(want, cap));
}

/** Sample a straight chord a→b into a wandered polyline (endpoints pinned exactly on the nodes). */
function wanderEdge(a: PathVec2, b: PathVec2, rng: () => number, rules: PathNetworkRules): PathVec2[] {
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
  const out: PathVec2[] = [];
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
  nodes: PathVec2[];
  cols: number;
  rows: number;
  index: (i: number, j: number) => number;
}

/** Lay seed nodes: a regular lattice at `gridness` 1, jittered toward organic scatter as it drops. */
function seedLattice(rules: PathNetworkRules, hx: number, hz: number, rng: () => number): Lattice {
  const spacingX = rules.segmentLength * Math.max(1, rules.aspect);
  const spacingZ = rules.segmentLength;
  const cols = Math.max(2, Math.min(Math.round((hx * 2) / spacingX), 30));
  const rows = Math.max(2, Math.min(Math.round((hz * 2) / spacingZ), 30));
  const dx = (hx * 2) / cols;
  const dz = (hz * 2) / rows;
  const jitter = (1 - rules.gridness) * 0.42;
  const nodes: PathVec2[] = [];
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
  rules: PathNetworkRules,
  hx: number,
  hz: number,
  streams: (s: string) => () => number,
): { nodes: PathVec2[]; edges: RawEdge[] } {
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

/** Grow a closed CIRCUIT: nodes ordered around the volume centroid into one loop, radii smoothed so
 *  no corner exceeds the turn ceiling, with an optional pit-lane spur when branching is up. */
function buildCircuit(
  rules: PathNetworkRules,
  hx: number,
  hz: number,
  streams: (s: string) => () => number,
): { nodes: PathVec2[]; edges: RawEdge[] } {
  const rng = streams("circuit");
  const rx = hx * 0.86;
  const rz = hz * 0.86;
  const perimeter = Math.PI * (rx + rz);
  const k = Math.max(6, Math.min(Math.round(perimeter / rules.segmentLength), 40));
  // Per-node radius factor: winding pulls the loop in and out to carve corners and chicanes.
  const radii: number[] = [];
  for (let i = 0; i < k; i += 1) {
    const wobble = 1 - rules.winding * (0.12 + rng() * 0.4) * (0.5 + 0.5 * Math.sin(i * 1.7));
    radii.push(Math.max(0.45, wobble));
  }
  // Smooth the radii so consecutive corners can't be sharper than the ceiling allows.
  const smoothPasses = 2 + Math.round((1 - rules.maxTurnAngle / 180) * 4);
  for (let pass = 0; pass < smoothPasses; pass += 1) {
    const next = radii.slice();
    for (let i = 0; i < k; i += 1) {
      const prev = radii[(i - 1 + k) % k]!;
      const cur = radii[i]!;
      const nxt = radii[(i + 1) % k]!;
      next[i] = cur * 0.5 + (prev + nxt) * 0.25;
    }
    for (let i = 0; i < k; i += 1) radii[i] = next[i]!;
  }
  const nodes: PathVec2[] = [];
  for (let i = 0; i < k; i += 1) {
    const angle = (i / k) * TAU;
    const f = radii[i]!;
    nodes.push([Math.cos(angle) * rx * f, Math.sin(angle) * rz * f]);
  }
  const edges: RawEdge[] = [];
  for (let i = 0; i < k; i += 1) edges.push({ a: i, b: (i + 1) % k, lane: false });
  // Optional pit-lane spur: a short dead-end tap off one node (only when branching is meaningful).
  if (rules.branching > 0.25 && nodes.length < MAX_NODES) {
    const host = Math.floor(rng() * k);
    const hp = nodes[host]!;
    const toCenter = Math.atan2(-hp[1], -hp[0]);
    const len = rules.segmentLength * (0.8 + rng() * 0.6);
    const nx = hp[0] + Math.cos(toCenter) * len;
    const nz = hp[1] + Math.sin(toCenter) * len;
    if (Math.abs(nx) < hx - 1 && Math.abs(nz) < hz - 1) {
      const id = nodes.length;
      nodes.push([nx, nz]);
      edges.push({ a: host, b: id, lane: true });
    }
  }
  return { nodes, edges };
}

/** Decide which topology family the sliders call for. Circuit wins when loops dominate and both
 *  branching and mesh connectivity are low — exactly the "race track" corner of the slider space. */
export function pathNetworkMode(rules: PathNetworkRules): PathNetworkMode {
  const score = rules.loopiness * (1 - rules.branching * 0.7) * (1 - rules.connectivity * 0.7);
  return score >= 0.45 ? "circuit" : "net";
}

/** Assign a hierarchy level per chained street: spurs are lanes, the longest runs become avenues,
 *  and a share of those upgrade to boulevards. */
function levelForStreets(
  chains: { nodes: number[]; length: number; lane: boolean }[],
  rules: PathNetworkRules,
  rng: () => number,
): PathLevel[] {
  const order = chains
    .map((c, i) => ({ i, length: c.length, lane: c.lane }))
    .sort((a, b) => b.length - a.length);
  const levels = new Array<PathLevel>(chains.length).fill("street");
  const avenueCut = Math.max(1, Math.ceil(order.filter((o) => !o.lane).length * 0.28));
  let ranked = 0;
  for (const o of order) {
    if (o.lane) {
      levels[o.i] = "lane";
      continue;
    }
    if (ranked < avenueCut) {
      levels[o.i] = rng() < rules.boulevards ? "boulevard" : "avenue";
    }
    ranked += 1;
  }
  return levels;
}

/**
 * Resolve a full path network from its rules inside a volume of half-extents `hx`×`hz`. Deterministic
 * per `(rules.seed, hx, hz, context)`. Pass a {@link PathNetworkContext} with a ground sampler to turn
 * water gaps into bridges and ridges into tunnels. Coordinates are volume-local; the caller maps to
 * world space.
 *
 * @capability path-network build a deterministic road/track graph (nodes, edges, streets, junctions, bridges, tunnels) from sliders
 */
export function buildPathNetwork(
  rules: PathNetworkRules,
  hx: number,
  hz: number,
  context: PathNetworkContext = {},
): PathNetwork {
  const streams = seededStreams(`pathnet:${rules.seed}:${Math.round(hx)}:${Math.round(hz)}`);
  const mode = pathNetworkMode(rules);
  const raw = mode === "circuit" ? buildCircuit(rules, hx, hz, streams) : buildNet(rules, hx, hz, streams);
  const rawNodes = raw.nodes;
  const rawEdges = raw.edges.filter((e) => e.a !== e.b);

  // --- degrees + adjacency over the atomic graph ---
  const degree = new Array<number>(rawNodes.length).fill(0);
  const adj: { edge: number; other: number }[][] = rawNodes.map(() => []);
  rawEdges.forEach((e, i) => {
    degree[e.a] += 1;
    degree[e.b] += 1;
    adj[e.a]!.push({ edge: i, other: e.b });
    adj[e.b]!.push({ edge: i, other: e.a });
  });

  // --- level per edge: chain length drives the hierarchy, so compute chains first (topology only). ---
  const edgeWander: PathVec2[][] = rawEdges.map((e) =>
    // Clamp wander crests to the footprint so a curve near the rim never bulges outside the volume.
    wanderEdge(rawNodes[e.a]!, rawNodes[e.b]!, streams(`edge:${e.a}:${e.b}`), rules).map(
      ([x, z]) => [Math.max(-hx, Math.min(hx, x)), Math.max(-hz, Math.min(hz, z))] as PathVec2,
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

  const levels = levelForStreets(chains, rules, streams("levels"));
  const edgeLevel = new Array<PathLevel>(rawEdges.length).fill("street");
  chains.forEach((chain, ci) => {
    for (const ei of chain.edges) edgeLevel[ei] = levels[ci]!;
  });

  // --- assemble atomic edges ---
  const minRad = (rules.minTurnAngle * Math.PI) / 180;
  const maxRad = (rules.maxTurnAngle * Math.PI) / 180;
  const edges: PathEdge[] = rawEdges.map((e, i) => ({
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
  const streets: PathStreet[] = [];
  chains.forEach((chain, ci) => {
    if (streets.length >= MAX_STREETS) return;
    const level = levels[ci]!;
    const width = rules.width * WIDTH_MULT[level];
    // Concatenate the chain's atomic wander polylines (dropping duplicated shared vertices).
    const pts: PathVec2[] = [];
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
    const smooth = clampTurns(pts, minRad, maxRad);
    const street: PathStreet = {
      id: streets.length,
      nodes: chain.nodes,
      points: smooth,
      width,
      level,
      loop: chain.loop,
      features: [],
    };
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
  const junctions: PathJunction[] = [];
  for (let n = 0; n < rawNodes.length; n += 1) {
    if (degree[n] < 3) continue;
    const arms: { angle: number; width: number }[] = [];
    let radius = 0;
    let level: PathLevel = "lane";
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
  const deadEnds: PathDeadEnd[] = [];
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
  const bridges: PathFeature[] = [];
  const tunnels: PathFeature[] = [];
  for (const street of streets) {
    for (const span of street.features) {
      const slice = street.points.slice(span.from, span.to + 1);
      if (slice.length < 2) continue;
      const feature: PathFeature = { kind: span.kind, points: slice, width: street.width, bankHeight: span.bankHeight };
      (span.kind === "bridge" ? bridges : tunnels).push(feature);
    }
  }

  const components = countComponents(rawNodes.length, rawEdges);
  const loops = Math.max(0, rawEdges.length - rawNodes.length + components);

  // Compact node list with final degrees.
  const nodes: PathNode[] = rawNodes.map((p, i) => ({ id: i, x: p[0], z: p[1], degree: degree[i]! }));

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
  points: readonly PathVec2[],
  heightAt: (x: number, z: number) => number,
  context: PathNetworkContext,
): PathFeatureSpan[] {
  const minEl = context.minElevation ?? -2;
  const clearance = context.tunnelClearance ?? 6;
  const wantBridge = context.bridges === true;
  const wantTunnel = context.tunnels === true;
  if (!wantBridge && !wantTunnel) return [];
  const spans: PathFeatureSpan[] = [];
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
