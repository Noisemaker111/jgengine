/**
 * The CIRCUIT DESIGNER: composes a closed race circuit the way a track designer does, instead of
 * smoothing a random blob. A lap is a cyclic program of straights and corner COMPLEXES drawn from a
 * corner grammar — hairpin, slow 90°, medium, fast sweeper, kink, banked carousel, double-apex, and the
 * zero-net-turn inserts chicane, esses and kink pair — each built from clothoid-entered constant-radius
 * arcs (radii ~10 m to 300 m+), so curvature flows and every corner has a real radius and type.
 *
 * Layout: a seeded skeleton polygon (a star with folded-in bays as `compactness` rises, edges pulled
 * toward the axes as `gridness` rises, or a bowtie of two lobes for a figure-8) gives the headings. Its
 * two longest edges become long straights, each ending in a heavy-braking corner (the overtaking
 * spots); every vertex gets a corner complex chosen by its turn and the dials, and edges take inserts
 * until the lap carries 3–6 corners per km with a real spread of slow and fast corners. Because every
 * heading is fixed by the skeleton, the closing condition and the lap length are LINEAR in the
 * straight lengths and corner scales: one small weighted least-squares solve (with bounds) closes the
 * loop at exactly `lapLength`. Several candidates per seed are scored by a point-mass lap simulation
 * (flow, rhythm, variety, overtaking, full-throttle share, footprint) after hard checks (no
 * self-intersection, no near-parallel stretch inside a safe gap, fits the volume after the best
 * rotation); the best one is dressed: elevation within the grade cap with a grade-separated crossover
 * for a figure-8, banking in fast corners, track width that opens on the pit straight and into braking
 * zones, run-off on the outside of corners, tyre walls and armco beyond it, a pit lane that splits off
 * and rejoins the start straight with its garages and pit wall, grandstand spots, and timing-sector
 * break points at significant corner exits.
 *
 * Pure deterministic math: same input and seed streams give the identical design. Volume-local XZ,
 * centered. Model code only — no rendering, browser or backend dependency.
 *
 * @capability circuit-designer compose a closed race circuit from a corner grammar, fitted to a lap length and a volume
 */
import { simulateLap } from "./circuitSim";
import type { StreetVec2 } from "./streetGenerator";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** The corner grammar. Inserts (`chicane`, `esses`, and paired `kink`s) have zero net turn. */
export type CircuitCornerKind = "hairpin" | "slow" | "medium" | "sweeper" | "kink" | "carousel" | "double-apex" | "chicane" | "esses";

/** The lap-length dial a closed circuit is designed to (and a street race searches for). */
export const CIRCUIT_LAP_LENGTH_FIELD = {
  type: "range",
  key: "lapLength",
  label: "lap length",
  min: 80,
  max: 12000,
  step: 10,
  default: 2400,
  unit: "m",
  explore: [400, 6000],
} as const;

/** What the designer reads. Dials are the street generator's, read the circuit way. */
export interface CircuitDesignInput {
  /** Target lap length, m. Shortened only when the volume cannot hold it. */
  lapLength: number;
  /** Volume half extents, m. */
  halfX: number;
  halfZ: number;
  /** Nominal track width, m. */
  width: number;
  /** 0 = few, fast corners (high-speed) … 1 = many, slow ones (technical). */
  winding: number;
  /** 0 = free headings … 1 = headings pulled to the axes, 90° street corners. */
  gridness: number;
  /** 0 = an open lap round its footprint … 1 = folded back into bays, packed tight. */
  compactness: number;
  /** Tightest corner radius, m (the hairpins sit just above it). */
  minRadius: number;
  /** Figure-8: the lap crosses itself once, grade-separated. */
  crossover: boolean;
  /** Build a pit lane beside the start straight. */
  pitLane: boolean;
  /** Steepest road grade (rise/run). */
  maxGrade: number;
  /** Road-surface relief field, when the network has elevation. */
  elevationAt?: ((x: number, z: number) => number) | undefined;
  /** Seeded random streams. */
  streams: (stream: string) => () => number;
}

/** One designed corner (one arc of a complex), positions as arc length from the start of the start straight. */
export interface CircuitDesignCorner {
  kind: CircuitCornerKind;
  entry: number;
  apex: number;
  exit: number;
  /** Arc radius, m. */
  radius: number;
  /** Signed turn, radians: positive turns left of travel. */
  turn: number;
  /** Complex this arc belongs to (arcs of one chicane share it). */
  complex: number;
  /** True for the heavy-braking corner at the end of a long straight. */
  heavy: boolean;
}

/** A run of zero curvature, positions as arc length. */
export interface CircuitDesignStraight {
  from: number;
  to: number;
  length: number;
  /** One of the long overtaking straights. */
  long: boolean;
}

/** A garage box beside the pit lane. */
export interface CircuitGarage {
  x: number;
  z: number;
  /** Yaw (radians) the open door faces — toward the pit lane. */
  heading: number;
}

/** The pit lane: splits off the start straight, runs parallel behind the pit wall, rejoins before turn 1. */
export interface CircuitPitLane {
  /** Centerline from the split (on the lap) to the merge (on the lap). */
  points: StreetVec2[];
  heights?: number[];
  width: number;
  /** Arc length on the lap where it splits off and rejoins. */
  entry: number;
  exit: number;
  /** Which side of travel it runs on: -1 left, 1 right. */
  side: -1 | 1;
  garages: CircuitGarage[];
  /** Pit speed limit, m/s. */
  speedLimit: number;
}

/** A run-off area on one side of the track: gravel trap or asphalt. */
export interface CircuitRunoff {
  from: number;
  to: number;
  side: -1 | 1;
  /** Strip width across, m (from the road edge out). */
  depth: number;
  surface: "gravel" | "asphalt";
  /** Strip centerline (road edge + depth/2). */
  points: StreetVec2[];
}

/** A permanent wall run beside the track: tyre wall, armco or concrete (pit) wall. */
export interface CircuitWall {
  kind: "tyres" | "armco" | "wall";
  side: -1 | 1;
  points: StreetVec2[];
}

/** A grandstand spot facing the track. */
export interface CircuitGrandstand {
  x: number;
  z: number;
  /** Yaw (radians) the seats face. */
  heading: number;
  /** Stand length along the track, m. */
  length: number;
}

/** A grade-separated crossing of a figure-8: one pass bridges over the other. */
export interface CircuitCrossing {
  x: number;
  z: number;
  /** Arc length of the upper and lower pass. */
  over: number;
  under: number;
  overHeight: number;
  underHeight: number;
}

/** One braking zone of the simulated lap, as arc lengths. */
export interface CircuitDesignBrake {
  from: number;
  to: number;
  entrySpeed: number;
  exitSpeed: number;
}

/** A designed lap and its dressing. Index 0 is the start of the start straight; arrays are per centerline sample. */
export interface CircuitDesign {
  centerline: StreetVec2[];
  /** Arc spacing of the samples, m. */
  step: number;
  length: number;
  /** Signed curvature per sample, 1/m (positive = left). */
  curvature: number[];
  /** True on zero-curvature samples. */
  straight: boolean[];
  widths: number[];
  /** Road-surface height per sample — present with elevation or a crossover. */
  heights?: number[];
  /** Road roll per sample, radians: positive raises the right edge (banked into a left-hander). */
  banking: number[];
  /** Nominal track width. */
  width: number;
  corners: CircuitDesignCorner[];
  straights: CircuitDesignStraight[];
  /** The start/finish straight, as arc lengths (from is 0). */
  startStraight: { from: number; to: number };
  /** Simulated elapsed time per sample, s, and the lap time. */
  time: number[];
  lapTime: number;
  brakingZones: CircuitDesignBrake[];
  /** Arc lengths just past significant corner exits — where timing sectors read best. */
  sectorBreaks: number[];
  pit?: CircuitPitLane;
  runoff: CircuitRunoff[];
  walls: CircuitWall[];
  grandstands: CircuitGrandstand[];
  crossings: CircuitCrossing[];
}

// ---------------------------------------------------------------------------------------------------
// Corner grammar → curvature pieces

interface ArcSpec {
  r: number;
  turn: number;
  spiral: number;
}
type Piece = { arc: ArcSpec } | { gap: number };
interface ComplexSpec {
  kind: CircuitCornerKind;
  pieces: Piece[];
  heavy: boolean;
}
/** A curvature segment: linear curvature from k0 to k1 over len (constant = arc, ramp = clothoid). */
interface Seg {
  len: number;
  k0: number;
  k1: number;
  arc: number;
}

function complexSegs(spec: ComplexSpec): Seg[] {
  const segs: Seg[] = [];
  let arc = 0;
  for (const piece of spec.pieces) {
    if ("gap" in piece) {
      if (piece.gap > 0) segs.push({ len: piece.gap, k0: 0, k1: 0, arc: -1 });
      continue;
    }
    const { r, turn, spiral } = piece.arc;
    const total = Math.abs(turn);
    const k = Math.sign(turn) / r;
    // Clothoids at least 8 m long (or the whole arc), so curvature never jumps between samples even on
    // a short flick of a chicane.
    const ls = Math.min(r * total, Math.max(2 * r * spiral * total, 8));
    const la = r * total - ls;
    if (ls > 0) segs.push({ len: ls, k0: 0, k1: k, arc });
    if (la > 0) segs.push({ len: la, k0: k, k1: k, arc });
    if (ls > 0) segs.push({ len: ls, k0: k, k1: 0, arc });
    arc += 1;
  }
  return segs;
}

function arcsOf(spec: ComplexSpec): ArcSpec[] {
  const out: ArcSpec[] = [];
  for (const piece of spec.pieces) if ("arc" in piece) out.push(piece.arc);
  return out;
}

const SPIRAL: Record<CircuitCornerKind, number> = {
  hairpin: 0.12,
  slow: 0.15,
  medium: 0.22,
  sweeper: 0.3,
  kink: 0.38,
  carousel: 0.08,
  "double-apex": 0.18,
  chicane: 0.13,
  esses: 0.28,
};

/** Corner records count arcs of at least this much turn. */
const CORNER_MIN_TURN = 10 * DEG;
/** Radius at or below which a corner counts as tight, and at or above which as fast. */
const TIGHT_R = 14.4;
const FAST_R = 126;

function single(kind: CircuitCornerKind, r: number, turn: number, heavy = false): ComplexSpec {
  return { kind, heavy, pieces: [{ arc: { r, turn, spiral: SPIRAL[kind] } }] };
}

// ---------------------------------------------------------------------------------------------------
// Integration

interface Walker {
  x: number;
  y: number;
  h: number;
  s: number;
}
interface Dense {
  x: number[];
  y: number[];
  s: number[];
  k: number[];
  tag: number[];
  item: number[];
}

/** Advance along one segment (scaled), optionally recording sub-step end points. */
function walkSeg(seg: Seg, scale: number, at: Walker, maxSub: number, out?: Dense, tag = -1, item = -1): void {
  const len = seg.len * scale;
  if (len <= 0) return;
  const k0 = seg.k0 / scale;
  const k1 = seg.k1 / scale;
  const turn = Math.abs((len * (k0 + k1)) / 2);
  const flat = seg.k0 === 0 && seg.k1 === 0;
  // Sub-step counts are discrete: shaved below the ceiling so a turn of exactly 90° (± an ulp of libm
  // noise) never flips between two counts.
  let n = flat ? 1 : Math.max(2, Math.ceil(turn / (0.5 * DEG) - 1e-6));
  if (Number.isFinite(maxSub)) n = Math.max(n, Math.ceil(len / maxSub - 1e-6));
  const h = len / n;
  const dk = (k1 - k0) / len;
  for (let i = 0; i < n; i += 1) {
    const sm = (i + 0.5) * h;
    const hm = at.h + k0 * sm + (dk * sm * sm) / 2;
    at.x += h * Math.cos(hm);
    at.y += h * Math.sin(hm);
    if (out !== undefined) {
      const se = (i + 1) * h;
      out.x.push(at.x);
      out.y.push(at.y);
      out.s.push(at.s + se);
      // The last sub-step lands exactly on k1, so a clothoid easing out to a straight ends at exactly 0.
      out.k.push(flat ? 0 : i === n - 1 ? k1 : k0 + dk * se);
      out.tag.push(seg.arc >= 0 ? tag + seg.arc : -1);
      out.item.push(item);
    }
  }
  at.h += (len * (k0 + k1)) / 2;
  at.s += len;
}

// ---------------------------------------------------------------------------------------------------
// Linear closure solve

interface Var {
  vx: number;
  vy: number;
  l: number;
  x0: number;
  min: number;
  max: number;
  flex: number;
}

/** Solve a 3×3 (or 2×2 when `n` = 2) linear system in place; null when singular. */
function solveSmall(m: number[][], r: number[], n: number): number[] | null {
  const a = m.map((row, i) => [...row.slice(0, n), r[i]!]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let i = c + 1; i < n; i += 1) if (Math.abs(a[i]![c]!) > Math.abs(a[p]![c]!)) p = i;
    if (Math.abs(a[p]![c]!) < 1e-12) return null;
    [a[c], a[p]] = [a[p]!, a[c]!];
    for (let i = 0; i < n; i += 1) {
      if (i === c) continue;
      const f = a[i]![c]! / a[c]![c]!;
      for (let j = c; j <= n; j += 1) a[i]![j] = a[i]![j]! - f * a[c]![j]!;
    }
  }
  return a.map((row, i) => row[n]! / row[i]!);
}

/**
 * Closest values (relative weighted least squares) to each var's `x0` with Σ x·v = 0 (the loop closes)
 * and, when `length` is given, Σ x·l = length. Bounds by an active set: a var that leaves its range is
 * pinned there and the rest re-solved. Null when no bounded solution exists.
 */
function solveClosure(vars: Var[], length: number | null): number[] | null {
  const eqs = length === null ? 2 : 3;
  const fixed = new Array<number | null>(vars.length).fill(null);
  for (let iter = 0; iter < 16; iter += 1) {
    const r = [0, 0, length ?? 0];
    const m = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const rows = (v: Var): number[] => [v.vx, v.vy, v.l];
    let free = 0;
    vars.forEach((v, i) => {
      const value = fixed[i] ?? v.x0;
      const row = rows(v);
      for (let e = 0; e < eqs; e += 1) r[e] = r[e]! - row[e]! * value;
      if (fixed[i] !== null) return;
      free += 1;
      const w = (Math.max(1, v.x0) * v.flex) ** 2;
      for (let e = 0; e < eqs; e += 1) for (let f = 0; f < eqs; f += 1) m[e]![f] = m[e]![f]! + row[e]! * row[f]! * w;
    });
    if (free < eqs) return null;
    const lambda = solveSmall(m, r, eqs);
    if (lambda === null) return null;
    const out = vars.map((v, i) => {
      if (fixed[i] !== null) return fixed[i]!;
      const row = rows(v);
      const w = (Math.max(1, v.x0) * v.flex) ** 2;
      let dot = 0;
      for (let e = 0; e < eqs; e += 1) dot += row[e]! * lambda[e]!;
      return v.x0 + w * dot;
    });
    let violated = false;
    vars.forEach((v, i) => {
      if (fixed[i] !== null) return;
      if (out[i]! < v.min - 1e-9) {
        fixed[i] = v.min;
        violated = true;
      } else if (out[i]! > v.max + 1e-9) {
        fixed[i] = v.max;
        violated = true;
      }
    });
    if (!violated) return out;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Skeletons

interface Skeleton {
  headings: number[];
  lengths: number[];
  /** Edges that cross (figure-8). */
  crossing: number[];
}

function wrapAngle(a: number): number {
  let d = a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

function segmentsCross(a: StreetVec2, b: StreetVec2, c: StreetVec2, d: StreetVec2): boolean {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

/** Turn vertices into edge vectors, merging near-collinear neighbours; null if degenerate. */
function skeletonFromVectors(vectors: [number, number][], crossingPolygon: boolean): Skeleton | null {
  let vecs = vectors.filter((v) => Math.hypot(v[0], v[1]) > 1e-6);
  for (let guard = 0; guard < 24; guard += 1) {
    const n = vecs.length;
    if (n < 4) return null;
    let merged = false;
    for (let i = 0; i < n; i += 1) {
      const a = vecs[i]!;
      const b = vecs[(i + 1) % n]!;
      const turn = Math.abs(wrapAngle(Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0])));
      if (turn < 7 * DEG) {
        const sum: [number, number] = [a[0] + b[0], a[1] + b[1]];
        if (i === n - 1) vecs = [...vecs.slice(1, n - 1), sum];
        else vecs = [...vecs.slice(0, i), sum, ...vecs.slice(i + 2)];
        merged = true;
        break;
      }
    }
    if (!merged) break;
  }
  const n = vecs.length;
  if (n < 4) return null;
  const headings = vecs.map((v) => Math.atan2(v[1], v[0]));
  const lengths = vecs.map((v) => Math.hypot(v[0], v[1]));
  for (let i = 0; i < n; i += 1) {
    if (Math.abs(wrapAngle(headings[(i + 1) % n]! - headings[i]!)) > 168 * DEG) return null;
  }
  // Polygon crossings: none for a loop, exactly one for a figure-8.
  const pts: StreetVec2[] = [[0, 0]];
  for (let i = 0; i + 1 < n; i += 1) pts.push([pts[i]![0] + vecs[i]![0], pts[i]![1] + vecs[i]![1]]);
  const crossings: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) crossings.push([i, j]);
    }
  }
  if (crossingPolygon ? crossings.length !== 1 : crossings.length !== 0) return null;
  return { headings, lengths, crossing: crossings.length === 1 ? [crossings[0]![0], crossings[0]![1]] : [] };
}

function starSkeleton(rng: () => number, count: number, aspect: number, compactness: number, gridness: number): Skeleton | null {
  const phase = rng() * TAU;
  const radii: number[] = [];
  const angles: number[] = [];
  for (let k = 0; k < count; k += 1) {
    angles.push(phase + (TAU * k) / count + (rng() - 0.5) * (TAU / count) * 0.55);
    radii.push(0.6 + rng() * 0.4);
  }
  // Folded-in bays: compactness pushes vertices deep toward the middle (reflex corners).
  const bays = Math.min(count >= 7 ? 2 : 1, Math.floor(compactness * 2.2 + rng() * 0.8));
  const used = new Set<number>();
  for (let b = 0; b < bays; b += 1) {
    const k = Math.floor(rng() * count);
    if (used.has(k) || used.has((k + 1) % count) || used.has((k - 1 + count) % count)) continue;
    used.add(k);
    radii[k] = 0.22 + rng() * 0.22;
  }
  const pts: [number, number][] = angles.map((a, k) => [Math.cos(a) * radii[k]! * aspect, Math.sin(a) * radii[k]!]);
  let vecs: [number, number][] = pts.map((p, k) => {
    const q = pts[(k + 1) % count]!;
    return [q[0] - p[0], q[1] - p[1]];
  });
  const pull = Math.min(1, gridness * 1.4);
  if (pull > 0) {
    // Pull headings toward the axes, then re-close the polygon on its edge lengths.
    const heads = vecs.map((v) => {
      const h = Math.atan2(v[1], v[0]);
      const snapped = Math.round(h / (Math.PI / 2)) * (Math.PI / 2);
      return h + pull * wrapAngle(snapped - h);
    });
    const lens = vecs.map((v) => Math.hypot(v[0], v[1]));
    const mean = lens.reduce((s, l) => s + l, 0) / count;
    const solved = solveClosure(
      heads.map((h, k) => ({ vx: Math.cos(h), vy: Math.sin(h), l: 1, x0: lens[k]!, min: mean * 0.12, max: Infinity, flex: 0.5 })),
      null,
    );
    if (solved === null) return null;
    vecs = heads.map((h, k) => [Math.cos(h) * solved[k]!, Math.sin(h) * solved[k]!]);
  }
  return skeletonFromVectors(vecs, false);
}

/**
 * A street-circuit skeleton: a rectangle with notches cut out of its corners (L-steps) and edges
 * (U-bays), so the lap runs around city blocks — all 90° turns, several of them against the lap.
 */
function orthogonalSkeleton(rng: () => number, aspect: number, compactness: number, maxVertices: number): Skeleton | null {
  const rect: [number, number][] = [
    [0, 0],
    [aspect, 0],
    [aspect, 1],
    [0, 1],
  ];
  // Corner c sits between edge c-1 and edge c; a notch reserves its neighbours so cuts never overlap.
  const cornerCut = [false, false, false, false];
  const edgeCut = [false, false, false, false];
  const notches = Math.max(1, Math.min(3, 1 + Math.floor(compactness * 2 + rng() * 0.9)));
  let vertices = 4;
  for (let k = 0; k < notches; k += 1) {
    const i = Math.floor(rng() * 4);
    const corner = rng() < 0.55;
    // A notch adds vertices (corners): a short lap keeps few, so it stays inside 6 corners per km.
    if (vertices + (corner ? 2 : 4) > Math.max(6, maxVertices)) continue;
    if (corner) {
      if (cornerCut[i] || edgeCut[i] || edgeCut[(i + 3) % 4]) continue;
      cornerCut[i] = true;
      vertices += 2;
    } else {
      if (edgeCut[i] || cornerCut[i] || cornerCut[(i + 1) % 4]) continue;
      edgeCut[i] = true;
      vertices += 4;
    }
  }
  const ring: [number, number][] = [];
  for (let c = 0; c < 4; c += 1) {
    const p = rect[c]!;
    const prev = rect[(c + 3) % 4]!;
    const next = rect[(c + 1) % 4]!;
    const ul = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const u: [number, number] = [(p[0] - prev[0]) / ul, (p[1] - prev[1]) / ul];
    const vl = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const v: [number, number] = [(next[0] - p[0]) / vl, (next[1] - p[1]) / vl];
    if (cornerCut[c]) {
      // L-step: stop short on the incoming edge, step inward along the outgoing direction, then out.
      const a = ul * uni(rng, 0.22, 0.42);
      const b = vl * uni(rng, 0.22, 0.42);
      const q1: [number, number] = [p[0] - u[0] * a, p[1] - u[1] * a];
      ring.push(q1, [q1[0] + v[0] * b, q1[1] + v[1] * b], [p[0] + v[0] * b, p[1] + v[1] * b]);
    } else {
      ring.push([p[0], p[1]]);
    }
    if (edgeCut[c]) {
      // U-bay into the middle of edge c (inward = left of travel on a CCW ring).
      const n: [number, number] = [-v[1], v[0]];
      const t1 = uni(rng, 0.25, 0.4);
      const t2 = uni(rng, 0.6, 0.75);
      const depth = Math.min(aspect, 1) * uni(rng, 0.25, 0.42);
      const a1: [number, number] = [p[0] + v[0] * vl * t1, p[1] + v[1] * vl * t1];
      const a2: [number, number] = [p[0] + v[0] * vl * t2, p[1] + v[1] * vl * t2];
      ring.push(a1, [a1[0] + n[0] * depth, a1[1] + n[1] * depth], [a2[0] + n[0] * depth, a2[1] + n[1] * depth], a2);
    }
  }
  const vecs: [number, number][] = ring.map((p, k) => {
    const q = ring[(k + 1) % ring.length]!;
    return [q[0] - p[0], q[1] - p[1]];
  });
  return skeletonFromVectors(vecs, false);
}

function figure8Skeleton(rng: () => number): Skeleton | null {
  const alpha = (26 + rng() * 16) * DEG;
  const lobe = (radius: number, betaQ: number, interior: number, mirror: boolean): [number, number][] => {
    const cx = radius * (Math.sin(betaQ) / Math.tan(alpha) - Math.cos(betaQ));
    const out: [number, number][] = [];
    // From β = βq clockwise to −βq around the lobe center (right lobe), mirrored for the left.
    for (let k = 0; k <= interior + 1; k += 1) {
      const t = k / (interior + 1);
      const jitter = k === 0 || k === interior + 1 ? 0 : (rng() - 0.5) * 0.35 * ((2 * betaQ) / (interior + 1));
      const beta = betaQ - t * 2 * betaQ + jitter;
      const r = k === 0 || k === interior + 1 ? radius : radius * (0.78 + rng() * 0.36);
      const x = cx + r * Math.cos(beta);
      const y = r * Math.sin(beta);
      out.push(mirror ? [-x, y] : [x, y]);
    }
    return out;
  };
  const rRight = 0.8 + rng() * 0.4;
  const rLeft = rRight * (0.62 + rng() * 0.38);
  const flip = rng() < 0.5;
  const right = lobe(flip ? rLeft : rRight, (105 + rng() * 25) * DEG, 2 + Math.floor(rng() * 2), false);
  // The left lobe is the mirror image of a right-hand construction: it starts upper-left (S) and ends
  // lower-left (P), traversed counter-clockwise.
  const left = lobe(flip ? rRight : rLeft, (105 + rng() * 25) * DEG, 2 + Math.floor(rng() * 2), true);
  // Path: right lobe Q…R, crossing straight R→S, left lobe S…P, crossing straight P→Q.
  const ring = [...right, ...left];
  const vecs: [number, number][] = ring.map((p, k) => {
    const q = ring[(k + 1) % ring.length]!;
    return [q[0] - p[0], q[1] - p[1]];
  });
  return skeletonFromVectors(vecs, true);
}

// ---------------------------------------------------------------------------------------------------
// Candidates

interface Dials {
  minR: number;
  winding: number;
  gridness: number;
  compactness: number;
  width: number;
  /** Radius scale for every corner above the hairpins: 1 on a full-size lap (≥ 2.4 km), smaller on a
   *  short lap so its sweepers still fit between the straights. */
  scale: number;
  /** Radius from which a corner counts as fast (scaled with the lap). */
  fastR: number;
}

interface CornerMeta {
  kind: CircuitCornerKind;
  r: number;
  turn: number;
  item: number;
  complex: number;
  heavy: boolean;
}

type Item =
  | { type: "straight"; heading: number; value: number; role: "long" | "normal" | "pre" | "post" }
  | { type: "complex"; heading: number; value: number; spec: ComplexSpec; segs: Seg[]; tag: number };

interface Candidate {
  items: Item[];
  corners: CornerMeta[];
  dense: Dense;
  length: number;
  rotation: number;
  fitRatio: number;
  score: number;
  longItems: number[];
  crossing: boolean;
}

const uni = (rng: () => number, a: number, b: number): number => a + (b - a) * rng();

function pick<T>(rng: () => number, options: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of options) total += Math.max(0, w);
  let roll = rng() * total;
  for (const [value, w] of options) {
    roll -= Math.max(0, w);
    if (roll < 0) return value;
  }
  return options[options.length - 1]![0];
}

function tightRadius(rng: () => number, minR: number): number {
  return minR <= TIGHT_R ? Math.min(TIGHT_R, minR * uni(rng, 1, 1.2)) : minR * uni(rng, 1, 1.15);
}

/** The corner complex a skeleton vertex gets, from its turn, its role and the dials. */
function vertexComplex(rng: () => number, turn: number, heavy: boolean, d: Dials): ComplexSpec {
  const deg = Math.abs(turn) / DEG;
  const g = d.gridness;
  if (heavy) {
    if (deg >= 130) return single("hairpin", tightRadius(rng, d.minR), turn, true);
    if (deg >= 70) return single("slow", tightRadius(rng, d.minR), turn, true);
    if (deg >= 45) return single("slow", uni(rng, Math.max(d.minR, 18), 32), turn, true);
    // A shallow bend at the end of a long straight becomes a braking chicane: flick away, then in.
    const away = -(Math.sign(turn) || 1) * uni(rng, 38, 50) * DEG;
    return {
      kind: "chicane",
      heavy: true,
      pieces: [
        { arc: { r: tightRadius(rng, d.minR), turn: turn + away, spiral: SPIRAL.chicane } },
        { gap: uni(rng, 5, 12) },
        { arc: { r: tightRadius(rng, d.minR), turn: -away, spiral: SPIRAL.chicane } },
      ],
    };
  }
  if (deg >= 140) {
    const kind = pick(rng, [
      ["hairpin", 1],
      ["carousel", 0.4 * (1 - g)],
    ] as const);
    return kind === "hairpin" ? single("hairpin", tightRadius(rng, d.minR), turn) : single("carousel", uni(rng, 34, 58) * d.scale, turn);
  }
  if (deg >= 95) {
    const kind = pick(rng, [
      ["slow", 1],
      ["double-apex", 0.55 * (1 - g)],
      ["carousel", 0.15 * (1 - g)],
    ] as const);
    if (kind === "slow") return single("slow", d.minR * uni(rng, 1.3, 2.4), turn);
    if (kind === "carousel") return single("carousel", uni(rng, 34, 55) * d.scale, turn);
    return doubleApex(rng, turn, d);
  }
  if (deg >= 60) {
    const kind = pick(rng, [
      ["medium", 1],
      ["sweeper", 0.45 * (1 - d.winding) * (1 - g)],
      ["double-apex", 0.3 * (1 - g)],
    ] as const);
    if (kind === "sweeper") return single("sweeper", uni(rng, 130, 200) * d.scale, turn);
    if (kind === "double-apex") return doubleApex(rng, turn, d);
    return single("medium", g > 0.5 ? d.minR * uni(rng, 1.3, 2.4) : Math.max(d.minR * 1.3, uni(rng, 28, 72) * d.scale), turn);
  }
  if (deg >= 30) {
    const kind = pick(rng, [
      ["sweeper", (1.3 - d.winding) * (1 - 0.6 * g)],
      ["medium", 0.5 + d.winding],
    ] as const);
    return kind === "sweeper" ? single("sweeper", uni(rng, 130, 240) * d.scale, turn) : single("medium", Math.max(d.minR * 1.5, uni(rng, 45, 110) * d.scale), turn);
  }
  return single("kink", uni(rng, 150, 320) * d.scale, turn);
}

function doubleApex(rng: () => number, turn: number, d: Dials): ComplexSpec {
  const share = uni(rng, 0.4, 0.6);
  const r1 = Math.max(d.minR * 1.6, uni(rng, 22, 45) * d.scale);
  const r2 = Math.max(d.minR * 1.6, uni(rng, 22, 45) * d.scale);
  return {
    kind: "double-apex",
    heavy: false,
    pieces: [{ arc: { r: r1, turn: turn * share, spiral: SPIRAL["double-apex"] } }, { gap: uni(rng, 0.5, 1.3) * (r1 + r2) * 0.5 }, { arc: { r: r2, turn: turn * (1 - share), spiral: SPIRAL["double-apex"] } }],
  };
}

type InsertKind = "chicane" | "esses" | "kinks";

function insertComplex(rng: () => number, kind: InsertKind, d: Dials): ComplexSpec {
  const side = rng() < 0.5 ? 1 : -1;
  if (kind === "chicane") {
    const r = tightRadius(rng, d.minR);
    const phi = uni(rng, 32, 50) * DEG * side;
    return { kind: "chicane", heavy: false, pieces: [{ arc: { r, turn: phi, spiral: SPIRAL.chicane } }, { gap: uni(rng, 4, 12) }, { arc: { r: tightRadius(rng, d.minR), turn: -phi, spiral: SPIRAL.chicane } }] };
  }
  if (kind === "esses") {
    const r = Math.max(d.minR * 2, uni(rng, 48, 105) * d.scale);
    const a = uni(rng, 24, 38) * DEG * side;
    return {
      kind: "esses",
      heavy: false,
      pieces: [{ arc: { r, turn: a, spiral: SPIRAL.esses } }, { arc: { r, turn: -2 * a, spiral: SPIRAL.esses } }, { arc: { r, turn: a, spiral: SPIRAL.esses } }],
    };
  }
  const r = uni(rng, 150, 240) * d.scale;
  const phi = uni(rng, 12, 19) * DEG * side;
  return { kind: "kink", heavy: false, pieces: [{ arc: { r, turn: phi, spiral: SPIRAL.kink } }, { gap: uni(rng, 25, 70) }, { arc: { r, turn: -phi, spiral: SPIRAL.kink } }] };
}

/** Displacement, length and end heading of a complex at unit scale, entry heading 0. */
function unitShape(segs: readonly Seg[]): { dx: number; dy: number; len: number } {
  const at: Walker = { x: 0, y: 0, h: 0, s: 0 };
  for (const seg of segs) walkSeg(seg, 1, at, Infinity);
  return { dx: at.x, dy: at.y, len: at.s };
}

function longThreshold(lap: number): number {
  return Math.min(400, Math.max(140, 0.15 * lap));
}

function countArcs(specs: readonly (ComplexSpec | null)[], fastR: number): { total: number; tight: number; fast: number } {
  let total = 0;
  let tight = 0;
  let fast = 0;
  for (const spec of specs) {
    if (spec === null) continue;
    for (const arc of arcsOf(spec)) {
      if (Math.abs(arc.turn) < CORNER_MIN_TURN) continue;
      total += 1;
      if (arc.r <= TIGHT_R) tight += 1;
      if (arc.r >= fastR) fast += 1;
    }
  }
  return { total, tight, fast };
}

/** Build, close and integrate one candidate lap at length `lap`; null when it cannot close. */
function buildCandidate(rng: () => number, lap: number, dials: Dials, figure8: boolean, aspect: number): Candidate | null {
  const radiusScale = Math.max(0.4, Math.min(1, lap / 2400));
  const d: Dials = { ...dials, scale: radiusScale, fastR: FAST_R * radiusScale };
  const lapKm = lap / 1000;
  const cornerTarget = Math.round(lapKm * (3.5 + 2 * d.winding));
  const cMin = Math.ceil(3.2 * lapKm);
  const cMax = Math.max(cMin, Math.floor(5.8 * lapKm));
  const target = Math.max(cMin, Math.min(cMax, cornerTarget));
  const skeleton = figure8
    ? figure8Skeleton(rng)
    : d.gridness >= 0.6
      ? orthogonalSkeleton(rng, aspect, d.compactness, Math.floor(cMax * 0.75))
      : starSkeleton(rng, Math.max(4, Math.min(10, Math.round(target * 0.62 + rng() * 1.5))), aspect, d.compactness, d.gridness);
  if (skeleton === null) return null;
  const { headings, lengths } = skeleton;
  const k = headings.length;
  const perimeter = lengths.reduce((s, l) => s + l, 0);
  const turnAt = (v: number): number => wrapAngle(headings[v]! - headings[(v - 1 + k) % k]!);

  // Long straights: the two longest edges (ties by index), apart from each other where possible.
  // Quantized so edges equal by construction (a figure-8's two crossing straights) tie by index, not by
  // libm noise.
  const key = lengths.map((l) => Math.round(l * 1e6));
  const order = lengths.map((_, i) => i).sort((a, b) => key[b]! - key[a]! || a - b);
  // The start straight prefers an edge that is not a figure-8 crossing (room for the pit lane and grid).
  const crossingEdges = new Set(skeleton.crossing);
  const e1 = order.find((e) => !crossingEdges.has(e) && key[e]! >= key[order[0]!]! * 0.4) ?? order[0]!;
  const e2 = order.find((e) => e !== e1 && e !== (e1 + 1) % k && e !== (e1 - 1 + k) % k) ?? order[1]!;
  const long = new Set([e1, e2]);
  const crossing = new Set(skeleton.crossing);

  const vertex: ComplexSpec[] = [];
  for (let v = 0; v < k; v += 1) vertex.push(vertexComplex(rng, turnAt(v), long.has((v - 1 + k) % k), d));
  const inserts: (ComplexSpec | null)[] = new Array<ComplexSpec | null>(k).fill(null);

  // Quotas: a real spread of tight and fast corners, and 3–6 corners per km.
  const scaleGuess = lap / perimeter;
  const eligible = (e: number): boolean => !long.has(e) && !crossing.has(e) && inserts[e] === null && lengths[e]! * scaleGuess > 150;
  const addInsert = (kind: InsertKind): boolean => {
    const options = lengths.map((l, e) => [e, eligible(e) ? l : 0] as const).filter(([, w]) => w > 0);
    if (options.length === 0) return false;
    const e = pick(rng, options);
    inserts[e] = insertComplex(rng, kind, d);
    return true;
  };
  for (let guard = 0; guard < 14; guard += 1) {
    const counts = countArcs([...vertex, ...inserts], d.fastR);
    const need = Math.floor(0.1 * (Math.max(counts.total, target) - 1)) + 2;
    if (counts.tight < need && d.minR <= TIGHT_R) {
      if (addInsert("chicane")) continue;
      const v = vertex.findIndex((c, i) => !c.heavy && Math.abs(turnAt(i)) >= 60 * DEG && arcsOf(c)[0]!.r > TIGHT_R);
      if (v >= 0) {
        vertex[v] = single("slow", tightRadius(rng, d.minR), turnAt(v));
        continue;
      }
    }
    if (counts.fast < need) {
      const v = vertex.findIndex((c, i) => !c.heavy && Math.abs(turnAt(i)) <= 65 * DEG && arcsOf(c).every((a) => a.r < d.fastR));
      if (v >= 0) {
        const t = turnAt(v);
        vertex[v] = Math.abs(t) <= 30 * DEG ? single("kink", uni(rng, 150, 300) * d.scale, t) : single("sweeper", uni(rng, 130, 220) * d.scale, t);
        continue;
      }
      if (addInsert("kinks")) continue;
    }
    if (counts.total < target) {
      const kind = pick(rng, [
        ["esses", 0.4 + d.winding],
        ["chicane", 0.5],
        ["kinks", 0.9 - d.winding * 0.6],
        ["double-apex", 0.4 * (1 - d.gridness)],
      ] as const);
      if (kind === "double-apex") {
        const v = vertex.findIndex((c, i) => !c.heavy && c.kind !== "double-apex" && Math.abs(turnAt(i)) >= 70 * DEG);
        if (v >= 0) {
          vertex[v] = doubleApex(rng, turnAt(v), d);
          continue;
        }
      } else if (addInsert(kind)) continue;
      if (addInsert("esses") || addInsert("kinks")) continue;
    }
    if (counts.total > cMax) {
      // Drop the insert whose loss the quotas can best afford (esses first, then kinks, then chicanes).
      const affordable = (e: number): boolean => {
        const without = countArcs([...vertex, ...inserts.map((c, i) => (i === e ? null : c))], d.fastR);
        const needNow = Math.floor(0.1 * (without.total - 1)) + 2;
        return (without.tight >= needNow || d.minR > TIGHT_R) && without.fast >= needNow;
      };
      const rank: Partial<Record<CircuitCornerKind, number>> = { esses: 0, kink: 1, chicane: 2 };
      const drop = inserts
        .map((c, e) => ({ c, e }))
        .filter(({ c, e }) => c !== null && affordable(e))
        .sort((a, b) => (rank[a.c!.kind] ?? 3) - (rank[b.c!.kind] ?? 3) || a.e - b.e)[0];
      if (drop !== undefined) {
        inserts[drop.e] = null;
        continue;
      }
    }
    break;
  }

  // Corner cut-backs on the skeleton edges, then the skeleton scale that lands the lap length.
  const shapes = vertex.map((spec) => {
    const segs = complexSegs(spec);
    return { spec, segs, ...unitShape(segs) };
  });
  const insertShapes = inserts.map((spec) => {
    if (spec === null) return null;
    const segs = complexSegs(spec);
    return { spec, segs, ...unitShape(segs) };
  });
  const cutIn = new Array<number>(k).fill(0);
  const cutOut = new Array<number>(k).fill(0);
  for (let v = 0; v < k; v += 1) {
    const hin = headings[(v - 1 + k) % k]!;
    const hout = headings[v]!;
    const shape = shapes[v]!;
    const c = Math.cos(hin);
    const s = Math.sin(hin);
    const dx = shape.dx * c - shape.dy * s;
    const dy = shape.dx * s + shape.dy * c;
    const ux = Math.cos(hin);
    const uy = Math.sin(hin);
    const wx = Math.cos(hout);
    const wy = Math.sin(hout);
    const det = ux * wy - uy * wx;
    if (Math.abs(det) < 0.03) return null;
    cutIn[v] = (dx * wy - dy * wx) / det;
    cutOut[v] = (ux * dy - uy * dx) / det;
  }
  let fixedCut = 0;
  let fixedLen = 0;
  for (let v = 0; v < k; v += 1) {
    fixedCut += cutIn[v]! + cutOut[v]!;
    fixedLen += shapes[v]!.len;
  }
  for (const ins of insertShapes) {
    if (ins === null) continue;
    fixedCut += ins.dx;
    fixedLen += ins.len;
  }
  const scale = (lap - fixedLen + fixedCut) / perimeter;
  if (!(scale > 0)) return null;
  const threshold = longThreshold(lap) * 1.04;

  // Items in lap order, starting on the main straight e1.
  const items: Item[] = [];
  const vars: Var[] = [];
  const corners: CornerMeta[] = [];
  let tagBase = 0;
  const longItems: number[] = [];
  const pushStraight = (heading: number, value: number, role: "long" | "normal" | "pre" | "post"): void => {
    if (role === "long") longItems.push(items.length);
    items.push({ type: "straight", heading, value, role });
    const min = role === "long" ? threshold : role === "pre" ? 35 : role === "post" ? 10 : 8;
    vars.push({ vx: Math.cos(heading), vy: Math.sin(heading), l: 1, x0: Math.max(value, 1), min, max: Infinity, flex: role === "long" ? 0.4 : role === "post" ? 0.2 : 0.6 });
  };
  const pushComplex = (heading: number, spec: ComplexSpec, segs: Seg[], shape: { dx: number; dy: number; len: number }): void => {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const arcs = arcsOf(spec);
    const minArc = Math.min(...arcs.map((a) => a.r));
    let min = Math.max(0.85, d.minR / minArc);
    let max = spec.heavy ? 1.12 : 1.3;
    if (minArc <= TIGHT_R && d.minR <= TIGHT_R) max = Math.min(max, TIGHT_R / minArc);
    if (minArc >= d.fastR) min = Math.max(min, (d.fastR + 0.5) / minArc);
    if (max < min) max = min;
    const complex = items.length;
    arcs.forEach((arc, i) => corners.push({ kind: spec.kind, r: arc.r, turn: arc.turn, item: complex, complex, heavy: spec.heavy && i === 0 }));
    items.push({ type: "complex", heading, value: 1, spec, segs, tag: tagBase });
    tagBase += arcs.length;
    vars.push({ vx: shape.dx * c - shape.dy * s, vy: shape.dx * s + shape.dy * c, l: shape.len, x0: 1, min, max, flex: spec.heavy ? 0.04 : 0.08 });
  };
  for (let step = 0; step < k; step += 1) {
    const e = (e1 + step) % k;
    const heading = headings[e]!;
    const edgeLen = scale * lengths[e]! - cutOut[e]! - cutIn[(e + 1) % k]!;
    const ins = insertShapes[e];
    if (ins === null || ins === undefined) {
      pushStraight(heading, edgeLen, long.has(e) ? "long" : "normal");
    } else {
      const room = edgeLen - ins.dx;
      const post = ins.spec.kind === "chicane" ? Math.min(room * 0.35, uni(rng, 25, 55)) : room * uni(rng, 0.35, 0.55);
      pushStraight(heading, room - post, "pre");
      pushComplex(heading, ins.spec, ins.segs, ins);
      pushStraight(heading, post, "post");
    }
    const v = (e + 1) % k;
    pushComplex(heading, shapes[v]!.spec, shapes[v]!.segs, shapes[v]!);
  }
  // A skeleton whose corners eat their edges is not worth closing.
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    if (item.type === "straight" && item.value < (item.role === "long" ? threshold * 0.55 : -20)) return null;
  }
  const solved = solveClosure(vars, lap);
  if (solved === null) return null;
  items.forEach((item, i) => (item.value = solved[i]!));

  // Integrate densely, then spread the (tiny) closing residual along the lap.
  const dense: Dense = { x: [0], y: [0], s: [0], k: [0], tag: [-1], item: [0] };
  const at: Walker = { x: 0, y: 0, h: headings[e1]!, s: 0 };
  items.forEach((item, i) => {
    if (item.type === "straight") {
      walkSeg({ len: item.value, k0: 0, k1: 0, arc: -1 }, 1, at, 2, dense, -1, i);
    } else {
      for (const seg of item.segs) walkSeg(seg, item.value, at, 2, dense, item.tag, i);
    }
  });
  const total = at.s;
  const ex = dense.x[dense.x.length - 1]!;
  const ey = dense.y[dense.y.length - 1]!;
  if (Math.hypot(ex, ey) > Math.max(5, total * 0.01)) return null;
  for (let i = 0; i < dense.x.length; i += 1) {
    const f = dense.s[i]! / total;
    dense.x[i] = dense.x[i]! - ex * f;
    dense.y[i] = dense.y[i]! - ey * f;
  }
  // Drop the closing duplicate.
  dense.x.pop();
  dense.y.pop();
  dense.s.pop();
  dense.k.pop();
  dense.tag.pop();
  dense.item.pop();
  corners.forEach((corner) => {
    const item = items[corner.item]!;
    corner.r *= item.value;
  });
  return { items, corners, dense, length: total, rotation: 0, fitRatio: Infinity, score: -Infinity, longItems, crossing: figure8 };
}

// ---------------------------------------------------------------------------------------------------
// Sampling helpers

interface Sampled {
  x: number[];
  y: number[];
  k: number[];
  tag: number[];
  item: number[];
  step: number;
}

/** Resample the dense lap to a uniform arc step (index 0 at arc 0). */
function resampleDense(dense: Dense, length: number, step: number): Sampled {
  const n = Math.max(16, Math.floor(length / step + SAMPLE_ROUND));
  const spacing = length / n;
  const out: Sampled = { x: [], y: [], k: [], tag: [], item: [], step: spacing };
  const m = dense.s.length;
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const s = i * spacing;
    while (j + 1 < m && dense.s[j + 1]! <= s) j += 1;
    const s0 = dense.s[j]!;
    const s1 = j + 1 < m ? dense.s[j + 1]! : length;
    const t = s1 > s0 ? Math.max(0, Math.min(1, (s - s0) / (s1 - s0))) : 0;
    const nx = j + 1 < m ? j + 1 : 0;
    out.x.push(dense.x[j]! + (dense.x[nx]! - dense.x[j]!) * t);
    out.y.push(dense.y[j]! + (dense.y[nx]! - dense.y[j]!) * t);
    const ka = dense.k[j]!;
    const kb = dense.k[nx]!;
    // A sample landing on the end of a clothoid (within noise) is on the straight: snap the residue.
    const k = ka + (kb - ka) * t;
    out.k.push(Math.abs(k) < 1e-9 ? 0 : k);
    const near = t < 0.5 ? j : nx;
    out.tag.push(dense.tag[near]!);
    out.item.push(dense.item[near]!);
  }
  return out;
}

/** Spatial hash over sample indices. */
class PointGrid {
  private readonly cells = new Map<number, number[]>();
  constructor(
    private readonly xs: readonly number[],
    private readonly ys: readonly number[],
    private readonly cell: number,
  ) {
    for (let i = 0; i < xs.length; i += 1) {
      const key = this.key(Math.floor(xs[i]! / cell), Math.floor(ys[i]! / cell));
      const bucket = this.cells.get(key);
      if (bucket === undefined) this.cells.set(key, [i]);
      else bucket.push(i);
    }
  }
  private key(ix: number, iy: number): number {
    return (ix + 4096) * 8192 + (iy + 4096);
  }
  /** Visit every indexed point within `radius` of (x, y). */
  near(x: number, y: number, radius: number, visit: (i: number, d: number) => void): void {
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let ix = cx - r; ix <= cx + r; ix += 1) {
      for (let iy = cy - r; iy <= cy + r; iy += 1) {
        const bucket = this.cells.get(this.key(ix, iy));
        if (bucket === undefined) continue;
        for (const i of bucket) {
          const d = Math.hypot(this.xs[i]! - x, this.ys[i]! - y);
          if (d <= radius) visit(i, d);
        }
      }
    }
  }
}

const arcGap = (a: number, b: number, length: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, length - d);
};

/** The one designed crossing of a figure-8 (segment pair), or every crossing found. */
function findCrossings(xs: readonly number[], ys: readonly number[], step: number): { i: number; j: number; x: number; y: number; angle: number }[] {
  const n = xs.length;
  const grid = new PointGrid(xs, ys, 20);
  const found: { i: number; j: number; x: number; y: number; angle: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const a: StreetVec2 = [xs[i]!, ys[i]!];
    const b: StreetVec2 = [xs[(i + 1) % n]!, ys[(i + 1) % n]!];
    grid.near(a[0], a[1], step * 2.5, (j) => {
      if (j <= i + 1 || (i === 0 && j === n - 1)) return;
      const c: StreetVec2 = [xs[j]!, ys[j]!];
      const e: StreetVec2 = [xs[(j + 1) % n]!, ys[(j + 1) % n]!];
      if (!segmentsCross(a, b, c, e)) return;
      if (found.some((f) => f.i === i && f.j === j)) return;
      const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const h2 = Math.atan2(e[1] - c[1], e[0] - c[0]);
      const angle = Math.abs(wrapAngle(h1 - h2));
      found.push({ i, j, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, angle: Math.min(angle, Math.PI - angle) });
    });
  }
  return found;
}

/**
 * Hard geometry check: no two stretches of road far apart along the lap come within a safe gap (a
 * near-parallel pass or a fold), apart from the designed figure-8 crossing. Returns the worst margin
 * (negative = fail).
 */
function clearanceMargin(sampled: Sampled, length: number, width: number, crossings: readonly { i: number; j: number }[]): number {
  const { x, y, step } = sampled;
  const n = x.length;
  const grid = new PointGrid(x, y, 30);
  const safe = Math.max(14, width);
  const near = width * 1.15 + safe;
  let worst = Infinity;
  const zone = 70 + width;
  const inZone = (i: number, j: number): boolean =>
    crossings.some((c) => {
      const si = i * step;
      const sj = j * step;
      const ci = c.i * step;
      const cj = c.j * step;
      return (arcGap(si, ci, length) < zone && arcGap(sj, cj, length) < zone) || (arcGap(si, cj, length) < zone && arcGap(sj, ci, length) < zone);
    });
  for (let i = 0; i < n; i += 1) {
    grid.near(x[i]!, y[i]!, near, (j, d) => {
      if (j <= i) return;
      const gap = arcGap(i * step, j * step, length);
      if (gap < 50) return;
      const need = width * 1.15 + (gap >= 160 ? safe : 4);
      const margin = d - need;
      if (margin >= worst) return;
      if (inZone(i, j)) return;
      worst = margin;
    });
  }
  return worst;
}

/** Best rotation to fit the volume: the smallest bbox/usable ratio over 48 headings. */
function bestFit(xs: readonly number[], ys: readonly number[], ux: number, uy: number): { rotation: number; ratio: number; cx: number; cy: number } {
  let best = { rotation: 0, ratio: Infinity, cx: 0, cy: 0 };
  for (let r = 0; r < 48; r += 1) {
    const a = (r / 48) * Math.PI;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < xs.length; i += 1) {
      const X = xs[i]! * c - ys[i]! * s;
      const Y = xs[i]! * s + ys[i]! * c;
      if (X < minX) minX = X;
      if (X > maxX) maxX = X;
      if (Y < minY) minY = Y;
      if (Y > maxY) maxY = Y;
    }
    // Quantized: a symmetric lap ties between headings, and the tie must not hang on libm noise.
    const ratio = Math.round(Math.max((maxX - minX) / (2 * ux), (maxY - minY) / (2 * uy)) * 1e6) / 1e6;
    if (ratio < best.ratio) best = { rotation: a, ratio, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }
  return best;
}

function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}

/** Score a candidate (higher is better); acceptance failures cost heavily but stay comparable. */
/** Coarse check that a pit lane fits beside the start straight on at least one side. */
function pitFits(cand: Candidate, sampled: Sampled, width: number): boolean {
  const start = cand.items[0]!;
  const length = start.type === "straight" ? start.value : 0;
  if (length < 140) return false;
  const grid = new PointGrid(sampled.x, sampled.y, 30);
  const offset = width * 0.56 + 2.5 + Math.max(8, width * 0.75) / 2;
  const need = Math.max(8, width * 0.75) / 2 + width * 0.6 + 6;
  for (const side of [1, -1]) {
    let ok = true;
    for (let s = 10; s <= length - 20 && ok; s += 10) {
      const i = Math.round(s / sampled.step);
      const [nx, ny] = rightNormal(sampled.x, sampled.y, i);
      for (const extra of [0, 14]) {
        const px = sampled.x[i]! + nx * side * (offset + extra);
        const py = sampled.y[i]! + ny * side * (offset + extra);
        grid.near(px, py, need, (j) => {
          if (arcGap(j * sampled.step, s, cand.length) > length / 2 + 60) ok = false;
        });
      }
    }
    if (ok) return true;
  }
  return false;
}

function scoreCandidate(cand: Candidate, sampled: Sampled, d: Dials, lapTarget: number, clearance: number, pitLane: boolean): number {
  const L = cand.length;
  const lapKm = L / 1000;
  const spacing = new Array<number>(sampled.x.length).fill(sampled.step);
  const sim = simulateLap(sampled.k, spacing);
  const counted = cand.corners.filter((c) => Math.abs(c.turn) >= CORNER_MIN_TURN);
  const radii = counted.map((c) => c.r);
  let score = 0;
  const perKm = counted.length / lapKm;
  if (perKm < 3 || perKm > 6) score -= 20;
  if (d.minR <= TIGHT_R && quantile(radii, 0.1) > 15) score -= 20;
  if (quantile(radii, 0.9) < 120) score -= 20;
  if (Math.abs(L - lapTarget) / lapTarget > 0.02) score -= 5;
  // Overtaking: a long straight into a braking zone shedding ≥ 80 km/h.
  let overtakes = 0;
  for (const zone of sim.brakingZones) {
    if (zone.entrySpeed - zone.exitSpeed < 22) continue;
    const before = sampled.item[(zone.from - 2 + sampled.item.length) % sampled.item.length]!;
    if (cand.longItems.includes(before) || cand.longItems.includes(sampled.item[zone.from]!)) overtakes += 1;
  }
  if (overtakes < 1) score -= 20;
  score += 1.5 * Math.min(overtakes, 3);
  // Variety and rhythm.
  const kinds = new Set(counted.map((c) => c.kind));
  score += 3 * Math.min(1, kinds.size / 6);
  const cornerSpeeds: number[] = [];
  const minSpeedOf = new Map<number, number>();
  sampled.tag.forEach((tag, i) => {
    if (tag < 0) return;
    minSpeedOf.set(tag, Math.min(minSpeedOf.get(tag) ?? Infinity, sim.speed[i]!));
  });
  for (const v of minSpeedOf.values()) cornerSpeeds.push(v);
  if (cornerSpeeds.length > 1) {
    const mean = cornerSpeeds.reduce((s, v) => s + v, 0) / cornerSpeeds.length;
    const sd = Math.sqrt(cornerSpeeds.reduce((s, v) => s + (v - mean) ** 2, 0) / cornerSpeeds.length);
    score += 2 * Math.min(1, sd / mean);
  }
  // Flow: slow corner straight after slow corner (different complexes) reads stop-start.
  for (let i = 0; i < cand.items.length; i += 1) {
    const a = cand.items[i]!;
    const b = cand.items[(i + 1) % cand.items.length]!;
    const c = cand.items[(i + 2) % cand.items.length]!;
    if (a.type !== "complex" || c.type !== "complex" || b.type !== "straight") continue;
    const slowA = arcsOf(a.spec).some((x) => x.r * a.value < 30);
    const slowC = arcsOf(c.spec).some((x) => x.r * c.value < 30);
    if (slowA && slowC && b.value < 70) score -= 0.8;
  }
  const targetThrottle = 0.5 + 0.2 * (1 - d.winding);
  score -= 4 * Math.abs(sim.fullThrottle - targetThrottle);
  // Direction mix: a loop with no counter-corner drives like an oval.
  if (!cand.crossing) {
    const sign = Math.sign(counted.reduce((s, c) => s + c.turn, 0));
    if (!counted.some((c) => Math.sign(c.turn) === -sign)) score -= 1.5;
  }
  // Footprint: compactness asks for a lap packed into less ground.
  const footprintTarget = 0.3 - 0.11 * d.compactness;
  score -= 3 * Math.abs(cand.fitRatio / footprintTarget - 1);
  score += 0.5 * Math.min(1, clearance / 20);
  if (pitLane && !pitFits(cand, sampled, d.width)) score -= 8;
  return score;
}

// ---------------------------------------------------------------------------------------------------
// Dressing

/** Unit right-of-travel normal at sample i: (dz, −dx) of the local tangent. */
function rightNormal(xs: readonly number[], ys: readonly number[], i: number): [number, number] {
  const n = xs.length;
  const dx = xs[(i + 1) % n]! - xs[(i - 1 + n) % n]!;
  const dy = ys[(i + 1) % n]! - ys[(i - 1 + n) % n]!;
  const l = Math.hypot(dx, dy) || 1;
  return [dy / l, -dx / l];
}

function circularSmooth(values: number[], window: number): number[] {
  const n = values.length;
  if (window <= 1) return values.slice();
  const half = Math.floor(window / 2);
  const out = new Array<number>(n);
  let sum = 0;
  for (let k = -half; k <= half; k += 1) sum += values[(k + n * 4) % n]!;
  for (let i = 0; i < n; i += 1) {
    out[i] = sum / (2 * half + 1);
    sum += values[(i + half + 1) % n]! - values[(i - half + n * 4) % n]!;
  }
  return out;
}

/** Raise-only grade cap on a closed profile: the smallest Lipschitz-`grade` profile above `h`. */
function gradeEnvelope(h: number[], step: number, grade: number): number[] {
  const n = h.length;
  const out = h.slice();
  const rise = grade * step;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let k = 0; k < n * 2; k += 1) {
      const i = k % n;
      const j = (i + 1) % n;
      if (out[i]! - rise > out[j]!) out[j] = out[i]! - rise;
    }
    for (let k = n * 2; k > 0; k -= 1) {
      const i = k % n;
      const j = (i - 1 + n) % n;
      if (out[i]! - rise > out[j]!) out[j] = out[i]! - rise;
    }
  }
  return out;
}

const BRIDGE_CLEARANCE = 7.5;

/** Where a metres → samples conversion rounds up: off the half-step, so nice numbers never tie. */
export const SAMPLE_ROUND = 0.4321;

/**
 * Design one circuit. Always returns a closed lap: when no candidate fits the volume at the requested
 * length the lap is shortened step by step, ending at a simple fallback that fits anything.
 */
export function designCircuit(input: CircuitDesignInput): CircuitDesign {
  const width = Math.max(4, input.width);
  const d: Dials = {
    minR: Math.max(4, input.minRadius),
    winding: Math.max(0, Math.min(1, input.winding)),
    gridness: Math.max(0, Math.min(1, input.gridness)),
    compactness: Math.max(0, Math.min(1, input.compactness)),
    width,
    scale: 1,
    fastR: FAST_R,
  };
  const margin = width * 0.6 + 12;
  const ux = Math.max(20, input.halfX - margin);
  const uy = Math.max(20, input.halfZ - margin);
  const aspectBox = Math.max(ux, uy) / Math.min(ux, uy);
  // How much lap a volume holds: a real circuit's bounding box is ~0.2–0.3 × its length on a side.
  const footprint = 0.3 - 0.11 * d.compactness;
  const capacity = Math.sqrt(4 * ux * uy) / footprint;
  let lap = Math.max(500, Math.min(input.lapLength, capacity));
  const step = Math.max(0.5, Math.min(2.5, d.minR * 0.1));

  let best: Candidate | null = null;
  for (let round = 0; round < 6 && best === null; round += 1) {
    let valid = 0;
    for (let attempt = 0; attempt < 40 && valid < 6; attempt += 1) {
      // One stream per attempt: a rejected attempt never shifts the draws of the next.
      const rng = input.streams(`circuit:design:${round}:${attempt}`);
      const aspect = Math.min(3, Math.max(1.1, aspectBox * uni(rng, 0.9, 1.35)));
      const cand = buildCandidate(rng, lap, d, input.crossover, aspect);
      if (cand === null) continue;
      const coarse = resampleDense(cand.dense, cand.length, 5);
      const fit = bestFit(coarse.x, coarse.y, ux, uy);
      if (fit.ratio > 1) continue;
      cand.rotation = fit.rotation;
      cand.fitRatio = Math.sqrt(fit.ratio * fit.ratio * 4 * ux * uy) / cand.length;
      const crossings = findCrossings(coarse.x, coarse.y, coarse.step);
      if (input.crossover) {
        if (crossings.length !== 1 || crossings[0]!.angle < 35 * DEG) continue;
      } else if (crossings.length !== 0) continue;
      const clearance = clearanceMargin(coarse, cand.length, width, crossings);
      if (clearance < 0) continue;
      valid += 1;
      cand.score = Math.round(scoreCandidate(cand, coarse, d, lap, clearance, input.pitLane) * 1e6) / 1e6;
      if (best === null || cand.score > best.score) best = cand;
    }
    if (best === null) lap *= 0.86;
  }
  if (best === null) best = fallbackCandidate(lap, d, ux, uy);
  return dressDesign(best, input, d, step);
}

/** A rounded rectangle that fits anything: shrinks until it fits the usable box. */
function fallbackCandidate(lap: number, d: Dials, ux: number, uy: number): Candidate {
  let length = Math.min(lap, 2 * (ux + uy) * 1.6);
  for (let guard = 0; guard < 30; guard += 1) {
    const r = Math.max(d.minR, Math.min(ux, uy) * 0.35);
    const straightTotal = length - TAU * r;
    const a = Math.max(10, straightTotal * (ux / (ux + uy)) * 0.5);
    const b = Math.max(10, straightTotal * (uy / (ux + uy)) * 0.5);
    const items: Item[] = [];
    const corners: CornerMeta[] = [];
    const lens = [a, b, a, b];
    for (let e = 0; e < 4; e += 1) {
      items.push({ type: "straight", heading: (e * Math.PI) / 2, value: lens[e]!, role: e === 0 ? "long" : "normal" });
      const spec = single("medium", r, Math.PI / 2);
      corners.push({ kind: "medium", r, turn: Math.PI / 2, item: items.length, complex: items.length, heavy: false });
      items.push({ type: "complex", heading: (e * Math.PI) / 2, value: 1, spec, segs: complexSegs(spec), tag: e });
    }
    const dense: Dense = { x: [0], y: [0], s: [0], k: [0], tag: [-1], item: [0] };
    const at: Walker = { x: 0, y: 0, h: 0, s: 0 };
    items.forEach((item, i) => {
      if (item.type === "straight") walkSeg({ len: item.value, k0: 0, k1: 0, arc: -1 }, 1, at, 2, dense, -1, i);
      else for (const seg of item.segs) walkSeg(seg, 1, at, 2, dense, item.tag, i);
    });
    const ex = dense.x[dense.x.length - 1]!;
    const ey = dense.y[dense.y.length - 1]!;
    for (let i = 0; i < dense.x.length; i += 1) {
      const f = dense.s[i]! / at.s;
      dense.x[i] = dense.x[i]! - ex * f;
      dense.y[i] = dense.y[i]! - ey * f;
    }
    for (const key of ["x", "y", "s", "k", "tag", "item"] as const) dense[key].pop();
    const fit = bestFit(dense.x, dense.y, ux, uy);
    if (fit.ratio <= 1 || guard === 29) {
      return { items, corners, dense, length: at.s, rotation: fit.rotation, fitRatio: fit.ratio, score: 0, longItems: [0], crossing: false };
    }
    length *= 0.85;
  }
  throw new Error("unreachable");
}

function dressDesign(cand: Candidate, input: CircuitDesignInput, d: Dials, step: number): CircuitDesign {
  const rng = input.streams("circuit:dress");
  const width = d.width;
  const sampled = resampleDense(cand.dense, cand.length, step);
  const n = sampled.x.length;
  const spacing = sampled.step;
  const L = cand.length;
  // Place: best rotation, centred, and a seeded travel direction (mirror flips every turn).
  const mirror = rng() < 0.5 ? -1 : 1;
  const c = Math.cos(cand.rotation);
  const s = Math.sin(cand.rotation);
  const rx = sampled.x.map((x, i) => x * c - sampled.y[i]! * s);
  const ry = sampled.x.map((x, i) => x * s + sampled.y[i]! * c);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    minX = Math.min(minX, rx[i]!);
    maxX = Math.max(maxX, rx[i]!);
    minY = Math.min(minY, ry[i]!);
    maxY = Math.max(maxY, ry[i]!);
  }
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  const xs = rx.map((x) => x - ox);
  const zs = ry.map((y) => (y - oy) * mirror);
  const curvature = sampled.k.map((k) => (k === 0 ? 0 : k * mirror));
  const straight = curvature.map((k) => k === 0);
  const centerline: StreetVec2[] = xs.map((x, i) => [x, zs[i]!]);
  // Metres → whole samples. The rounding point sits off the half-step so that "nice" lengths over a
  // "nice" spacing (15 m over 1.2 m) never land on a tie that libm noise could flip.
  const steps = (meters: number): number => Math.floor(meters / spacing + SAMPLE_ROUND);
  const at = (sArc: number): number => ((steps(sArc) % n) + n) % n;

  // Corners from the arc tags.
  const tagFirst = new Map<number, number>();
  const tagLast = new Map<number, number>();
  for (let i = 0; i < n; i += 1) {
    const tag = sampled.tag[i]!;
    if (tag < 0) continue;
    if (!tagFirst.has(tag)) tagFirst.set(tag, i);
    tagLast.set(tag, i);
  }
  const corners: CircuitDesignCorner[] = [];
  for (const item of cand.items) {
    if (item.type !== "complex") continue;
    const arcs = arcsOf(item.spec);
    arcs.forEach((arc, k) => {
      const id = item.tag + k;
      if (Math.abs(arc.turn) < CORNER_MIN_TURN) return;
      const first = tagFirst.get(id);
      const last = tagLast.get(id);
      if (first === undefined || last === undefined) return;
      corners.push({
        kind: item.spec.kind,
        entry: first * spacing,
        // The middle sample, chosen in integers: a half-step arc length would round either way.
        apex: Math.floor((first + last) / 2) * spacing,
        exit: last * spacing,
        radius: arc.r * item.value,
        turn: arc.turn * mirror,
        complex: cand.items.indexOf(item),
        heavy: item.spec.heavy && k === 0,
      });
    });
  }

  // Straights: zero-curvature runs.
  const straights: CircuitDesignStraight[] = [];
  {
    let i0 = 0;
    while (i0 < n && straight[i0]) i0 += 1;
    if (i0 >= n) i0 = 0;
    let k = 0;
    while (k < n) {
      const i = (i0 + k) % n;
      if (!straight[i]) {
        k += 1;
        continue;
      }
      let len = 0;
      while (len < n && straight[(i0 + k + len) % n]) len += 1;
      const from = i * spacing;
      const length = len * spacing;
      if (len >= steps(30)) {
        const items = new Set<number>();
        for (let q = 0; q < len; q += 1) items.add(sampled.item[(i + q) % n]!);
        straights.push({ from, to: (from + length) % L, length, long: cand.longItems.some((li) => items.has(li)) });
      }
      k += len;
    }
  }
  const startItem = cand.items[0]!;
  const startLength = startItem.type === "straight" ? startItem.value : 0;

  // Width: wider on the pit straight and into heavy braking, narrower through tight technical corners.
  const widthFactor = new Array<number>(n).fill(1);
  for (let i = 0; i <= Math.min(n - 1, steps(startLength)); i += 1) widthFactor[i] = 1.12;
  for (const corner of corners) {
    if (corner.heavy) {
      for (let k = steps(corner.entry) - steps(140); k <= steps(corner.exit); k += 1) {
        const i = ((k % n) + n) % n;
        widthFactor[i] = Math.max(widthFactor[i]!, 1.1);
      }
    } else if (corner.radius <= 30) {
      for (let k = steps(corner.entry); k <= steps(corner.exit); k += 1) {
        const i = ((k % n) + n) % n;
        widthFactor[i] = Math.min(widthFactor[i]!, 0.92);
      }
    }
  }
  const widths = circularSmooth(widthFactor, Math.max(3, steps(60))).map((f) => width * f);

  // Banking: fast corners lean in, peaking at the arc (ramps follow the clothoids).
  const BANK: Partial<Record<CircuitCornerKind, number>> = { carousel: 0.14, sweeper: 0.08, medium: 0.05, "double-apex": 0.05, esses: 0.04, kink: 0.03 };
  const banking = new Array<number>(n).fill(0);
  for (const corner of corners) {
    const peak = BANK[corner.kind];
    if (peak === undefined || corner.radius < 30) continue;
    const apex = steps(corner.apex);
    const span = Math.floor((steps(corner.exit) - steps(corner.entry)) / 2) + steps(20);
    for (let q = apex - span; q <= apex + span; q += 1) {
      const i = ((q % n) + n) % n;
      const k = curvature[i]!;
      if (k === 0 || Math.sign(k) !== Math.sign(corner.turn)) continue;
      banking[i] = Math.sign(k) * peak * Math.min(1, Math.abs(k) * corner.radius);
    }
  }

  // Lap simulation on the finished line.
  const sim = simulateLap(curvature, new Array<number>(n).fill(spacing), {}, banking);
  const brakingZones: CircuitDesignBrake[] = sim.brakingZones.map((z) => ({ from: z.from * spacing, to: z.to * spacing, entrySpeed: z.entrySpeed, exitSpeed: z.exitSpeed }));
  const top = Math.max(...sim.speed);
  const sectorBreaks = corners
    .filter((corner) => {
      const v = sim.speed[at(corner.apex)]!;
      return v < top * 0.7 && corner.exit + 15 < L - 20;
    })
    .map((corner) => Math.min(L - 1, corner.exit + 15));

  // Elevation: the shared relief field along the lap, a flyover for a figure-8, then a raise-only grade cap.
  const crossings: CircuitCrossing[] = [];
  let heights: number[] | undefined;
  const grade = Math.max(0.005, input.maxGrade) * 0.995;
  const crossFound = cand.crossing ? findCrossings(xs, zs, spacing) : [];
  if (input.elevationAt !== undefined || crossFound.length > 0) {
    const field = input.elevationAt;
    let h = xs.map((x, i) => (field === undefined ? 0 : field(x, zs[i]!)));
    h = gradeEnvelope(h, spacing, grade);
    if (crossFound.length > 0) {
      const cross = crossFound[0]!;
      // The pass already higher goes over.
      let over = h[cross.i]! >= h[cross.j]! ? cross.i : cross.j;
      let under = over === cross.i ? cross.j : cross.i;
      for (let pass = 0; pass < 4; pass += 1) {
        const plateau = steps(width + 18);
        const lift = h[under]! + BRIDGE_CLEARANCE + 0.6;
        for (let q = -plateau; q <= plateau; q += 1) {
          const i = (over + q + n) % n;
          h[i] = Math.max(h[i]!, lift);
        }
        h = gradeEnvelope(h, spacing, grade);
        h = gradeEnvelope(circularSmooth(h, Math.max(3, steps(24))), spacing, grade);
        if (h[over]! - h[under]! >= BRIDGE_CLEARANCE) break;
      }
      if (h[over]! < h[under]!) [over, under] = [under, over];
      crossings.push({ x: cross.x, z: cross.y, over: over * spacing, under: under * spacing, overHeight: h[over]!, underHeight: h[under]! });
    }
    heights = h;
  }

  // Clearance lookups for the dressing.
  const grid = new PointGrid(xs, zs, 30);
  const clearOf = (x: number, z: number, sArc: number, exclude: number): number => {
    let best = Infinity;
    grid.near(x, z, 80, (j, dist) => {
      if (arcGap(j * spacing, sArc, L) < exclude) return;
      const gap = dist - widths[j]! * 0.5;
      if (gap < best) best = gap;
    });
    return best;
  };
  const inside = (x: number, z: number, pad = 0): boolean => Math.abs(x) <= input.halfX - pad && Math.abs(z) <= input.halfZ - pad;
  const offsetAt = (i: number, side: number, dist: number): [number, number] => {
    const [nx, nz] = rightNormal(xs, zs, i);
    return [xs[i]! + nx * side * dist, zs[i]! + nz * side * dist];
  };

  // Pit lane beside the start straight.
  let pit: CircuitPitLane | undefined;
  let pitTaper = 0;
  const pitWidth = Math.max(8, width * 0.75);
  const pitOffset = width * 0.56 + 2.5 + pitWidth / 2;
  if (input.pitLane && startLength >= 140) {
    const entry = Math.min(15, startLength * 0.05);
    const exit = startLength - Math.min(25, startLength * 0.08);
    const taper = Math.max(35, Math.min(80, (exit - entry) * 0.2));
    pitTaper = taper;
    let chosen: { side: -1 | 1; margin: number } | null = null;
    for (const side of [1, -1] as const) {
      let margin = Infinity;
      for (let sArc = entry; sArc <= exit; sArc += 5) {
        const i = at(sArc);
        for (const extra of [0, pitWidth / 2 + 14]) {
          const p = offsetAt(i, side, pitOffset + extra);
          if (!inside(p[0], p[1], 2)) margin = -1;
          margin = Math.min(margin, clearOf(p[0], p[1], sArc, startLength / 2 + 60) - pitWidth / 2 - 6);
        }
      }
      if (margin > 0 && (chosen === null || margin > chosen.margin + 1e-6)) chosen = { side, margin };
    }
    if (chosen !== null) {
      const side = chosen.side;
      const points: StreetVec2[] = [];
      const pitHeights: number[] = [];
      const iEntry = at(entry);
      const iExit = at(exit);
      for (let i = iEntry; i <= iExit; i += 1) {
        const sArc = i * spacing;
        if (i !== iEntry && i !== iExit && (i - iEntry) % 2 !== 0) continue;
        const u = Math.min(1, (sArc - entry) / taper, (exit - sArc) / taper);
        const blend = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
        points.push(offsetAt(i, side, pitOffset * blend));
        pitHeights.push(heights?.[i] ?? 0);
      }
      const garages: CircuitGarage[] = [];
      for (let sArc = entry + taper + 8; sArc <= exit - taper - 8; sArc += 14) {
        const i = at(sArc);
        const p = offsetAt(i, side, pitOffset + pitWidth / 2 + 6);
        const [nx, nz] = rightNormal(xs, zs, i);
        garages.push({ x: p[0], z: p[1], heading: Math.atan2(-nx * side, -nz * side) });
      }
      pit = { points, ...(heights === undefined ? {} : { heights: pitHeights }), width: pitWidth, entry: iEntry * spacing, exit: iExit * spacing, side, garages, speedLimit: 22.2 };
    }
  }
  const pitGrid = pit === undefined ? null : new PointGrid(pit.points.map((p) => p[0]), pit.points.map((p) => p[1]), 20);
  const clearOfPit = (x: number, z: number): number => {
    if (pitGrid === null || pit === undefined) return Infinity;
    let best = Infinity;
    pitGrid.near(x, z, 40, (_, dist) => {
      best = Math.min(best, dist - pit!.width / 2);
    });
    return best;
  };

  // Run-off on the outside of every corner, sized by entry speed and clipped to the room there is; a
  // tyre wall (slow corners) or armco (fast) beyond it.
  const runoff: CircuitRunoff[] = [];
  const walls: CircuitWall[] = [];
  for (const corner of corners) {
    const side: -1 | 1 = corner.turn > 0 ? 1 : -1;
    const entrySpeed = sim.speed[at(corner.entry - 30)]!;
    const apexSpeed = sim.speed[at(corner.apex)]!;
    if (entrySpeed < 18 && corner.radius > 60) continue;
    const want = Math.max(10, Math.min(42, 6 + entrySpeed * 0.42));
    // Integer sample spans (corner ends are whole samples), so no index hangs on a half-step rounding.
    const first = steps(corner.entry);
    const last = steps(corner.exit);
    const iFrom = corner.heavy ? first - steps(40) : first + Math.floor((last - first) / 4);
    const iTo = last + steps(Math.min(60, 15 + apexSpeed * 0.6));
    const from = iFrom * spacing;
    const to = iTo * spacing;
    let depth = want;
    const idx: number[] = [];
    for (let k = iFrom; k <= iTo; k += 2) idx.push(((k % n) + n) % n);
    for (const i of idx) {
      const sArc = i * spacing;
      for (const probe of [depth * 0.5, depth + 3]) {
        const p = offsetAt(i, side, widths[i]! * 0.5 + probe);
        let room = clearOf(p[0], p[1], sArc, 60) - 3;
        room = Math.min(room, clearOfPit(p[0], p[1]) - 2);
        room = Math.min(room, Math.min(input.halfX - Math.abs(p[0]), input.halfZ - Math.abs(p[1])) - 2);
        if (room < 0) depth = Math.min(depth, Math.max(0, probe - 3 + room));
      }
    }
    if (depth < 5 || idx.length < 3) continue;
    const surface = corner.radius < 80 ? "gravel" : "asphalt";
    runoff.push({ from: ((from % L) + L) % L, to: to % L, side, depth, surface, points: idx.map((i) => offsetAt(i, side, widths[i]! * 0.5 + depth / 2)) });
    walls.push({ kind: corner.radius < 80 ? "tyres" : "armco", side, points: idx.map((i) => offsetAt(i, side, widths[i]! * 0.5 + depth + 1.5)) });
  }
  if (pit !== undefined) {
    const wall: StreetVec2[] = [];
    // The wall runs only where the pit lane is fully out beside the track, never across its taper.
    for (let q = steps(pit.entry + pitTaper); q <= steps(pit.exit - pitTaper); q += 2) {
      const i = ((q % n) + n) % n;
      wall.push(offsetAt(i, pit.side, widths[i]! * 0.5 + 1.2));
    }
    if (wall.length >= 2) walls.push({ kind: "wall", side: pit.side, points: wall });
  }

  // Grandstands: the start straight (opposite the pits) and the outside of the heavy-braking corners.
  const grandstands: CircuitGrandstand[] = [];
  const stand = (i: number, side: number, dist: number, length: number): void => {
    const p = offsetAt(i, side, dist);
    if (!inside(p[0], p[1], 6)) return;
    if (clearOf(p[0], p[1], i * spacing, 0) < dist - widths[i]! * 0.5 - 1) return;
    if (clearOfPit(p[0], p[1]) < 12) return;
    const [nx, nz] = rightNormal(xs, zs, i);
    grandstands.push({ x: p[0], z: p[1], heading: Math.atan2(-nx * side, -nz * side), length });
  };
  if (startLength > 0) stand(at(startLength * 0.55), pit === undefined ? 1 : -pit.side, widths[0]! * 0.5 + 22, Math.min(160, startLength * 0.4));
  for (const corner of corners) {
    if (!corner.heavy) continue;
    const side = corner.turn > 0 ? 1 : -1;
    const ro = runoff.find((r) => r.from <= corner.apex && r.to >= corner.apex && r.side === side);
    stand(at(corner.apex), side, widths[at(corner.apex)]! * 0.5 + (ro?.depth ?? 8) + 16, 60);
  }

  const timeArr = sim.time;
  return {
    centerline,
    step: spacing,
    length: L,
    curvature,
    straight,
    widths,
    ...(heights === undefined ? {} : { heights }),
    banking,
    width,
    corners,
    straights,
    startStraight: { from: 0, to: startLength },
    time: timeArr,
    lapTime: sim.lapTime,
    brakingZones,
    sectorBreaks,
    ...(pit === undefined ? {} : { pit }),
    runoff,
    walls,
    grandstands,
    crossings,
  };
}
