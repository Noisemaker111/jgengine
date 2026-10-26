/**
 * A route course is a drivable ribbon built from track pieces: a main line laid out turtle-style
 * from straights and constant-radius turns, plus branches (shortcuts, splits, pit lanes) that leave
 * the main line at one distance and rejoin it at another. Every racing or route game needs the same
 * handful of answers from such a shape - where along the course is this point, which branch is it
 * on, how far off the centreline, is it inside the walls, where does the gate at 210 m stand - and
 * this module answers them from the one authored description.
 *
 * Distances: each route has its own arc length `s`. `progress` is main-line distance; on a branch it
 * maps linearly from the branch's `from` to its `to`, so a shorter shortcut gains progress faster per
 * metre and a race order, a chaser's gap or a split reads the same on either path.
 *
 * Offsets are signed metres from the centreline, positive toward the heading's left normal
 * `(cos h, -sin h)`. With heading 0 facing +z that is +x, so a straight course along +z keeps the
 * familiar "x is lateral, z is distance" reading.
 *
 * Pure and immutable: the course owns no mutable state. Movement continuity (which leg of a
 * switchback a kart is on) is the caller's `hint`, the previous fix it got back.
 */
import type { Checkpoint, RaceFork } from "../game/race";
import type { PathRetaining, TerrainPathProfile } from "../world/pathTerrain";

/** An `[x, z]` world point. */
export type CourseVec2 = readonly [number, number];

interface CoursePieceBase {
  /** Corridor half-width over this piece; blends from the previous width over its first metres. Default: the course's. */
  halfWidth?: number;
  /** Metres of climb (negative for a descent) spread evenly along the piece. */
  rise?: number;
  /** Names a span over this piece's main-line distance, read back with {@link RouteCourse.spansAt}. */
  tag?: string;
}

/** A straight piece along the current heading. */
export interface CourseStraight extends CoursePieceBase {
  kind: "straight";
  length: number;
}

/** A constant-radius arc. */
export interface CourseTurn extends CoursePieceBase {
  kind: "turn";
  /** Radians added to the heading; positive turns toward the left normal. */
  angle: number;
  /** Centreline radius, metres; must be larger than the half-width or the inside wall folds. */
  radius: number;
}

/** One piece of the main line. */
export type CoursePiece = CourseStraight | CourseTurn;

/** An alternate path that leaves the main line at `from` and rejoins it at `to` (main-line metres). */
export interface CourseBranchSpec {
  id: string;
  from: number;
  to: number;
  /** Interior control points; the branch is a smooth curve through them, leaving and rejoining tangent to the main line. */
  via: readonly CourseVec2[];
  halfWidth?: number;
  tag?: string;
}

/** A timed window: active for `active` seconds out of every `period`, shifted by `phase`. */
export interface CourseSpanCycle {
  period: number;
  active: number;
  phase?: number;
}

/** A tagged stretch of one route: a hazard, a surface, a set-piece trigger. */
export interface CourseSpanSpec {
  id: string;
  tag: string;
  /** Route id; default the main line. */
  route?: string;
  /** Route-local metres. */
  from: number;
  to: number;
  /** Lateral band `[min, max]` the span covers; default the whole width. */
  offset?: readonly [number, number];
  /** On a timer instead of always. */
  cycle?: CourseSpanCycle;
  /** Game data the span carries (strength, push, label), untouched by the course. */
  data?: Readonly<Record<string, string | number | boolean>>;
}

/** Everything {@link buildRouteCourse} lays out: where the main line starts, its pieces, branches and spans. */
export interface RouteCourseSpec {
  start: { x: number; z: number; heading: number; elevation?: number };
  halfWidth: number;
  pieces: readonly CoursePiece[];
  branches?: readonly CourseBranchSpec[];
  spans?: readonly CourseSpanSpec[];
  /** Sample spacing along every route, metres. Default 2. */
  step?: number;
}

/** Route id of the main line. */
export const MAIN_ROUTE = "main";

/** Where a point sits on the course. */
export interface CourseFix {
  route: string;
  /** Route-local metres. */
  s: number;
  /** Main-line metres. */
  progress: number;
  /** Signed metres from the centreline, positive to the left. */
  offset: number;
  halfWidth: number;
  /** Centreline heading here, radians, `(sin h, cos h)` forward. */
  heading: number;
  elevation: number;
  /** Inside this route's walls (not past an end cap, within the half-width). */
  inside: boolean;
}

/** A point placed on the course. */
export interface CoursePoint {
  x: number;
  z: number;
  heading: number;
  halfWidth: number;
  elevation: number;
  progress: number;
}

/** One sampled wall post along a route edge. */
export interface CourseEdgePoint extends CoursePoint {
  route: string;
  s: number;
  side: "left" | "right";
}

/** One route as laid: its sampled centreline and where it sits on the main line. */
export interface CourseRouteInfo {
  id: string;
  length: number;
  /** Main-line progress at the route's start and end. */
  from: number;
  to: number;
  points: readonly CourseVec2[];
  tag?: string;
}

/** A span as the course holds it, its route resolved. */
export interface CourseSpan extends CourseSpanSpec {
  route: string;
}

/** Where {@link RouteCourse.checkpoints} puts the trigger boxes. */
export interface CourseCheckpointOptions {
  /** Main-line distances of the ordinary checkpoints, ascending. */
  at: readonly number[];
  /** Main-line distance of the finish line. */
  finish: number;
  /** Vertical half-extent of every trigger box. Default 8. */
  height?: number;
  /** Extra metres on the trigger box beyond the corridor half-width. Default 1. */
  margin?: number;
}

/** A built course: geometry queries, the wall clamp, spans, racing lines and race checkpoints. */
export interface RouteCourse {
  /** Main-line length, metres. */
  readonly length: number;
  readonly routes: readonly CourseRouteInfo[];
  readonly spans: readonly CourseSpan[];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Point on a route at route-local `s`, `offset` metres off the centreline. */
  pointAt(route: string, s: number, offset?: number): CoursePoint;
  /** Main-line progress of route-local `s`. */
  progressOf(route: string, s: number): number;
  /**
   * Where `(x, z)` sits. `hint` (the previous fix) keeps a kart on its own leg where corridors
   * overlap: on the branch it took, on the near side of a switchback.
   */
  locate(x: number, z: number, hint?: CourseFix | null): CourseFix;
  /** True when the point is inside any route's walls. */
  contains(x: number, z: number): boolean;
  /** The point itself when inside the walls, else the nearest point just inside them - a movement clamp. */
  clamp(x: number, z: number, hint?: CourseFix | null): { x: number; z: number; fix: CourseFix };
  /** Spans covering a fix, optionally only those with `tag`, honouring each span's cycle at `time`. */
  spansAt(fix: CourseFix, time?: number, tag?: string): readonly CourseSpan[];
  /** Posts along every route edge each `spacing` metres, skipping junction openings into another route. */
  edges(spacing: number, inset?: number): readonly CourseEdgePoint[];
  /**
   * A polyline along the main line that takes the named branches, `offset(progress)` metres off
   * centre - a racing line for `pathTargetAhead`, a guide for a scripted driver.
   */
  line(options?: { take?: readonly string[]; offset?: (progress: number) => number; step?: number }): readonly CourseVec2[];
  /** Checkpoint ring and branch forks, ready for `raceTrack({ checkpoints, forks })`. */
  checkpoints(options: CourseCheckpointOptions): { checkpoints: readonly Checkpoint[]; forks: readonly RaceFork[] };
  /**
   * Terrain height that rides the course: the route's own elevation inside `shoulder` metres of the
   * wall, blending into `base` over `falloff` more. Use it as a terrain `heightField`. `shoulder +
   * falloff` above 32 m is cut at 32 m.
   */
  groundHeight(base: (x: number, z: number) => number, options?: { shoulder?: number; falloff?: number }): (x: number, z: number) => number;
  /**
   * Terrain path profiles that grade the ground to every route's climb: one profile per run of even
   * slope, ready for a terrain descriptor's `pathProfiles`. `retaining` raises walls on the shoulders;
   * `shoulder` is the blend ring back into the surrounding ground (default 6 m).
   */
  terrainProfiles(options?: { shoulder?: number; retaining?: PathRetaining; extraWidth?: number }): readonly TerrainPathProfile[];
}

interface Route {
  id: string;
  index: number;
  x: Float64Array;
  z: Float64Array;
  s: Float64Array;
  hw: Float64Array;
  elev: Float64Array;
  /** Segment heading, one fewer than the samples. */
  heading: Float64Array;
  length: number;
  from: number;
  to: number;
  /** A branch's ends open into the main line; the main line's ends are walls. */
  capped: boolean;
  tag?: string;
}

const GRID_CELL = 16;
const GRID_REACH = 32;
const WALL_EPSILON = 0.02;
const WIDTH_BLEND = 8;
/** Metres either side of the hinted distance that still count as the same stretch of a route. */
const HINT_WINDOW = 30;

const smoothstep = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

interface Samples {
  x: number[];
  z: number[];
  hw: number[];
  elev: number[];
}

function layMainLine(spec: RouteCourseSpec, step: number): { samples: Samples; tags: { tag: string; from: number; to: number }[] } {
  const samples: Samples = { x: [spec.start.x], z: [spec.start.z], hw: [spec.halfWidth], elev: [spec.start.elevation ?? 0] };
  const tags: { tag: string; from: number; to: number }[] = [];
  let x = spec.start.x;
  let z = spec.start.z;
  let heading = spec.start.heading;
  let elevation = spec.start.elevation ?? 0;
  let width = spec.halfWidth;
  let distance = 0;
  for (const piece of spec.pieces) {
    const target = piece.halfWidth ?? spec.halfWidth;
    if (target <= 0) throw new Error("route course: half-width must be positive");
    const rise = piece.rise ?? 0;
    const startWidth = width;
    const length = piece.kind === "straight" ? piece.length : Math.abs(piece.angle) * piece.radius;
    if (!(length > 0)) throw new Error(`route course: a ${piece.kind} piece needs a positive length`);
    if (piece.kind === "turn" && piece.radius <= Math.max(startWidth, target)) {
      throw new Error(`route course: turn radius ${piece.radius} must exceed the half-width ${Math.max(startWidth, target)}`);
    }
    const n = Math.max(1, Math.ceil(length / step));
    const left0: CourseVec2 = [Math.cos(heading), -Math.sin(heading)];
    const sign = piece.kind === "turn" && piece.angle < 0 ? -1 : 1;
    const centre: CourseVec2 = piece.kind === "turn" ? [x + sign * piece.radius * left0[0], z + sign * piece.radius * left0[1]] : [0, 0];
    const heading0 = heading;
    const x0 = x;
    const z0 = z;
    for (let i = 1; i <= n; i += 1) {
      const f = i / n;
      if (piece.kind === "straight") {
        x = x0 + Math.sin(heading0) * length * f;
        z = z0 + Math.cos(heading0) * length * f;
      } else {
        const h = heading0 + piece.angle * f;
        x = centre[0] - sign * piece.radius * Math.cos(h);
        z = centre[1] + sign * piece.radius * Math.sin(h);
      }
      const along = length * f;
      samples.x.push(x);
      samples.z.push(z);
      samples.hw.push(startWidth + (target - startWidth) * smoothstep(along / Math.min(WIDTH_BLEND, length / 2)));
      samples.elev.push(elevation + rise * f);
    }
    if (piece.kind === "turn") heading = heading0 + piece.angle;
    if (piece.tag !== undefined) tags.push({ tag: piece.tag, from: distance, to: distance + length });
    distance += length;
    elevation += rise;
    width = target;
  }
  return { samples, tags };
}

function catmullRom(p0: CourseVec2, p1: CourseVec2, p2: CourseVec2, p3: CourseVec2, t: number): CourseVec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const axis = (i: 0 | 1): number =>
    0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  return [axis(0), axis(1)];
}

/** Resample a dense polyline at an even `step` along its arc length. */
function resample(dense: readonly CourseVec2[], step: number): CourseVec2[] {
  const out: CourseVec2[] = [dense[0]!];
  let carried = 0;
  for (let i = 1; i < dense.length; i += 1) {
    const a = dense[i - 1]!;
    const b = dense[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let at = step - carried;
    while (at <= seg) {
      const f = at / seg;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      at += step;
    }
    carried = seg - (at - step);
  }
  const last = dense[dense.length - 1]!;
  const tail = out[out.length - 1]!;
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.35) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

function makeRoute(id: string, index: number, samples: Samples, from: number, to: number | null, capped: boolean, tag?: string): Route {
  const count = samples.x.length;
  const s = new Float64Array(count);
  const heading = new Float64Array(Math.max(1, count - 1));
  for (let i = 1; i < count; i += 1) {
    const dx = samples.x[i]! - samples.x[i - 1]!;
    const dz = samples.z[i]! - samples.z[i - 1]!;
    s[i] = s[i - 1]! + Math.hypot(dx, dz);
    heading[i - 1] = Math.atan2(dx, dz);
  }
  const length = s[count - 1]!;
  return {
    id,
    index,
    x: Float64Array.from(samples.x),
    z: Float64Array.from(samples.z),
    s,
    hw: Float64Array.from(samples.hw),
    elev: Float64Array.from(samples.elev),
    heading,
    length,
    from,
    to: to ?? from + length,
    capped,
    ...(tag === undefined ? {} : { tag }),
  };
}

function segmentAt(route: Route, s: number): number {
  const clamped = Math.max(0, Math.min(route.length, s));
  let lo = 0;
  let hi = route.s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (route.s[mid]! <= clamped) lo = mid;
    else hi = mid;
  }
  return Math.min(lo, route.s.length - 2);
}

/**
 * Build a {@link RouteCourse} from its pieces, branches and spans. Throws on a turn tighter than its
 * half-width, a branch outside the main line, or overlapping branches.
 *
 * @capability route-course build a branching race course from track pieces: locate, wall clamp, checkpoints, hazard spans, racing lines
 */
export function buildRouteCourse(spec: RouteCourseSpec): RouteCourse {
  const step = spec.step ?? 2;
  if (!(step > 0)) throw new Error("route course: step must be positive");
  if (spec.pieces.length === 0) throw new Error("route course: needs at least one piece");
  const laid = layMainLine(spec, step);
  const main = makeRoute(MAIN_ROUTE, 0, laid.samples, 0, null, true);
  const routes: Route[] = [main];
  const byId = new Map<string, Route>([[MAIN_ROUTE, main]]);

  const branches = [...(spec.branches ?? [])].sort((a, b) => a.from - b.from);
  for (let i = 0; i < branches.length; i += 1) {
    const branch = branches[i]!;
    if (byId.has(branch.id)) throw new Error(`route course: duplicate route id "${branch.id}"`);
    if (!(branch.from >= 0 && branch.to > branch.from && branch.to <= main.length)) {
      throw new Error(`route course: branch "${branch.id}" must run forward inside the main line (0..${main.length.toFixed(1)})`);
    }
    const next = branches[i + 1];
    if (next !== undefined && next.from < branch.to) throw new Error(`route course: branches "${branch.id}" and "${next.id}" overlap`);
    const a = pointOn(main, branch.from, 0);
    const b = pointOn(main, branch.to, 0);
    const controls: CourseVec2[] = [[a.x, a.z], ...branch.via, [b.x, b.z]];
    const lead = Math.max(4, Math.hypot(controls[1]![0] - a.x, controls[1]![1] - a.z));
    const tail = Math.max(4, Math.hypot(controls[controls.length - 2]![0] - b.x, controls[controls.length - 2]![1] - b.z));
    const padded: CourseVec2[] = [
      [a.x - Math.sin(a.heading) * lead, a.z - Math.cos(a.heading) * lead],
      ...controls,
      [b.x + Math.sin(b.heading) * tail, b.z + Math.cos(b.heading) * tail],
    ];
    const dense: CourseVec2[] = [controls[0]!];
    for (let k = 1; k < padded.length - 2; k += 1) {
      const p1 = padded[k]!;
      const p2 = padded[k + 1]!;
      const pieces = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / (step / 4)));
      for (let j = 1; j <= pieces; j += 1) dense.push(catmullRom(padded[k - 1]!, p1, p2, padded[k + 2]!, j / pieces));
    }
    const points = resample(dense, step);
    const width = branch.halfWidth ?? a.halfWidth;
    let travelled = 0;
    const cumulative = points.map((point, index) => {
      if (index > 0) travelled += Math.hypot(point[0] - points[index - 1]![0], point[1] - points[index - 1]![1]);
      return travelled;
    });
    const samples: Samples = {
      x: points.map((p) => p[0]),
      z: points.map((p) => p[1]),
      hw: cumulative.map((d) => a.halfWidth + (width - a.halfWidth) * smoothstep(d / WIDTH_BLEND) + (b.halfWidth - width) * smoothstep((d - (travelled - WIDTH_BLEND)) / WIDTH_BLEND)),
      elev: cumulative.map((d) => a.elevation + (b.elevation - a.elevation) * (travelled === 0 ? 0 : d / travelled)),
    };
    const route = makeRoute(branch.id, routes.length, samples, branch.from, branch.to, false, branch.tag);
    routes.push(route);
    byId.set(route.id, route);
  }

  const spans: CourseSpan[] = [
    ...laid.tags.map((entry, index) => ({ id: `piece-${index}-${entry.tag}`, tag: entry.tag, route: MAIN_ROUTE, from: entry.from, to: entry.to })),
    ...routes.filter((route) => route.tag !== undefined).map((route) => ({ id: `route-${route.id}`, tag: route.tag!, route: route.id, from: 0, to: route.length })),
    ...(spec.spans ?? []).map((span) => {
      const routeId = span.route ?? MAIN_ROUTE;
      if (!byId.has(routeId)) throw new Error(`route course: span "${span.id}" names unknown route "${routeId}"`);
      if (span.cycle !== undefined && !(span.cycle.period > 0)) throw new Error(`route course: span "${span.id}" cycle needs a positive period`);
      return { ...span, route: routeId };
    }),
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let widest = 0;
  for (const route of routes) {
    for (let i = 0; i < route.x.length; i += 1) {
      const hw = route.hw[i]!;
      widest = Math.max(widest, hw);
      minX = Math.min(minX, route.x[i]! - hw);
      maxX = Math.max(maxX, route.x[i]! + hw);
      minZ = Math.min(minZ, route.z[i]! - hw);
      maxZ = Math.max(maxZ, route.z[i]! + hw);
    }
  }

  // Segment grid: each segment lands in every cell its corridor, plus GRID_REACH, can touch.
  const grid = new Map<string, number[]>();
  const cellKey = (cx: number, cz: number): string => `${cx},${cz}`;
  const pad = widest + GRID_REACH;
  for (const route of routes) {
    for (let i = 0; i < route.x.length - 1; i += 1) {
      const x0 = Math.min(route.x[i]!, route.x[i + 1]!) - pad;
      const x1 = Math.max(route.x[i]!, route.x[i + 1]!) + pad;
      const z0 = Math.min(route.z[i]!, route.z[i + 1]!) - pad;
      const z1 = Math.max(route.z[i]!, route.z[i + 1]!) + pad;
      for (let cx = Math.floor(x0 / GRID_CELL); cx <= Math.floor(x1 / GRID_CELL); cx += 1) {
        for (let cz = Math.floor(z0 / GRID_CELL); cz <= Math.floor(z1 / GRID_CELL); cz += 1) {
          const key = cellKey(cx, cz);
          const list = grid.get(key);
          const code = route.index * 1_000_000 + i;
          if (list === undefined) grid.set(key, [code]);
          else list.push(code);
        }
      }
    }
  }

  interface Candidate {
    route: Route;
    seg: number;
    s: number;
    offset: number;
    /** Distance to the nearest point of this segment. */
    dist: number;
    /** Metres outside the walls (negative inside). */
    excess: number;
    inside: boolean;
    capS: number | null;
  }

  function project(route: Route, seg: number, x: number, z: number): Candidate {
    const ax = route.x[seg]!;
    const az = route.z[seg]!;
    const dx = route.x[seg + 1]! - ax;
    const dz = route.z[seg + 1]! - az;
    const len2 = dx * dx + dz * dz;
    const raw = len2 === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / len2;
    const t = Math.max(0, Math.min(1, raw));
    const len = Math.sqrt(len2);
    const s = route.s[seg]! + t * len;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const h = route.heading[seg]!;
    const lateral = (x - px) * Math.cos(h) - (z - pz) * Math.sin(h);
    const dist = Math.hypot(x - px, z - pz);
    const hw = route.hw[seg]! + (route.hw[seg + 1]! - route.hw[seg]!) * t;
    const beforeStart = seg === 0 && raw < 0;
    const pastEnd = seg === route.x.length - 2 && raw > 1;
    if (beforeStart || pastEnd) {
      const along = beforeStart ? -raw * len : (raw - 1) * len;
      return { route, seg, s, offset: lateral, dist, excess: Math.max(along, Math.abs(lateral) - hw), inside: false, capS: beforeStart ? 0 : route.length };
    }
    // Clamped onto an interior vertex (the outside of a bend): the distance, not the perpendicular, is the offset.
    // Past a vertex by more than a segment is another stretch's business (or behind an end cap).
    const overrun = (raw < 0 ? -raw : raw > 1 ? raw - 1 : 0) * len;
    const offset = t === raw ? lateral : (lateral < 0 ? -1 : 1) * dist;
    return { route, seg, s, offset, dist, excess: Math.max(dist - hw, overrun - len + 0.001), inside: dist <= hw && overrun <= len, capS: null };
  }

  function candidates(x: number, z: number): Candidate[] {
    const list = grid.get(cellKey(Math.floor(x / GRID_CELL), Math.floor(z / GRID_CELL)));
    if (list === undefined) return [];
    return list.map((code) => project(routes[Math.floor(code / 1_000_000)]!, code % 1_000_000, x, z));
  }

  function everything(x: number, z: number): Candidate[] {
    const out: Candidate[] = [];
    for (const route of routes) for (let i = 0; i < route.x.length - 1; i += 1) out.push(project(route, i, x, z));
    return out;
  }

  const nearest = (list: readonly Candidate[], key: (entry: Candidate) => number): Candidate =>
    list.reduce((best, entry) => (key(entry) < key(best) ? entry : best));

  function choose(found: readonly Candidate[], hint: CourseFix | null | undefined): Candidate {
    const inside = found.filter((entry) => entry.inside);
    const hinted = hint ?? null;
    if (inside.length > 0) {
      if (hinted === null) return nearest(inside, (entry) => entry.dist);
      const same = inside.filter((entry) => entry.route.id === hinted.route);
      if (same.length > 0) {
        // Overlapping legs of one route: stay on the stretch the kart was already driving.
        const local = same.filter((entry) => Math.abs(entry.s - hinted.s) < HINT_WINDOW);
        return nearest(local.length > 0 ? local : same, (entry) => entry.dist);
      }
      // Moving between routes happens at a junction, where the progress on either side agrees.
      const joined = nearest(inside, (entry) => Math.abs(progressOn(entry.route, entry.s) - hinted.progress));
      return nearest(
        inside.filter((entry) => entry.route === joined.route),
        (entry) => entry.dist,
      );
    }
    if (hinted !== null) {
      const same = found.filter((entry) => entry.route.id === hinted.route && Math.abs(entry.s - hinted.s) < HINT_WINDOW);
      if (same.length > 0) return nearest(same, (entry) => entry.excess);
    }
    return nearest(found, (entry) => entry.excess);
  }

  function fixOf(candidate: Candidate): CourseFix {
    const point = pointOn(candidate.route, candidate.s, 0);
    return {
      route: candidate.route.id,
      s: candidate.s,
      progress: point.progress,
      offset: candidate.offset,
      halfWidth: point.halfWidth,
      heading: point.heading,
      elevation: point.elevation,
      inside: candidate.inside,
    };
  }

  function route(id: string): Route {
    const found = byId.get(id);
    if (found === undefined) throw new Error(`route course: unknown route "${id}"`);
    return found;
  }

  function locateCandidate(x: number, z: number, hint?: CourseFix | null): Candidate {
    const near = candidates(x, z);
    return choose(near.length > 0 ? near : everything(x, z), hint);
  }

  const course: RouteCourse = {
    length: main.length,
    routes: routes.map((entry) => ({
      id: entry.id,
      length: entry.length,
      from: entry.from,
      to: entry.to,
      points: Array.from(entry.x, (value, index) => [value, entry.z[index]!] as const),
      ...(entry.tag === undefined ? {} : { tag: entry.tag }),
    })),
    spans,
    bounds: { minX, maxX, minZ, maxZ },
    pointAt(id, s, offset = 0) {
      return pointOn(route(id), s, offset);
    },
    progressOf(id, s) {
      return progressOn(route(id), s);
    },
    locate(x, z, hint) {
      return fixOf(locateCandidate(x, z, hint));
    },
    contains(x, z) {
      return candidates(x, z).some((entry) => entry.inside);
    },
    clamp(x, z, hint) {
      const found = locateCandidate(x, z, hint);
      if (found.inside) return { x, z, fix: fixOf(found) };
      const hw = Math.max(0, found.route.hw[found.seg]! - WALL_EPSILON);
      const offset = Math.max(-hw, Math.min(hw, found.offset));
      const s = found.capS === null ? found.s : found.capS === 0 ? Math.min(found.route.length, WALL_EPSILON) : Math.max(0, found.route.length - WALL_EPSILON);
      const point = pointOn(found.route, s, offset);
      return { x: point.x, z: point.z, fix: fixOf(project(found.route, segmentAt(found.route, s), point.x, point.z)) };
    },
    spansAt(fix, time = 0, tag) {
      const out: CourseSpan[] = [];
      for (const span of spans) {
        if (span.route !== fix.route || (tag !== undefined && span.tag !== tag)) continue;
        if (fix.s < span.from || fix.s > span.to) continue;
        if (span.offset !== undefined && (fix.offset < span.offset[0] || fix.offset > span.offset[1])) continue;
        if (span.cycle !== undefined) {
          const local = (((time + (span.cycle.phase ?? 0)) % span.cycle.period) + span.cycle.period) % span.cycle.period;
          if (local >= span.cycle.active) continue;
        }
        out.push(span);
      }
      return out;
    },
    edges(spacing, inset = 0) {
      if (!(spacing > 0)) throw new Error("route course: edge spacing must be positive");
      const out: CourseEdgePoint[] = [];
      for (const entry of routes) {
        for (let s = 0; s <= entry.length + 1e-6; s += spacing) {
          for (const side of ["left", "right"] as const) {
            const centre = pointOn(entry, s, 0);
            const offset = (side === "left" ? 1 : -1) * (centre.halfWidth + inset);
            const post = pointOn(entry, s, offset);
            const probe = pointOn(entry, s, (side === "left" ? 1 : -1) * (centre.halfWidth + 0.5));
            const opening = candidates(probe.x, probe.z).some((c) => c.inside && c.route !== entry);
            if (!opening) out.push({ ...post, route: entry.id, s, side });
          }
        }
      }
      return out;
    },
    line(options = {}) {
      const take = new Set(options.take ?? []);
      const lineStep = options.step ?? step * 2;
      const offsetAt = options.offset ?? (() => 0);
      const out: CourseVec2[] = [];
      const taken = routes.filter((entry) => entry !== main && take.has(entry.id)).sort((a, b) => a.from - b.from);
      let cursor = 0;
      const walk = (entry: Route, from: number, to: number): void => {
        for (let s = from; s < to; s += lineStep) {
          const point = pointOn(entry, s, offsetAt(progressOn(entry, s)));
          out.push([point.x, point.z]);
        }
      };
      for (const branch of taken) {
        walk(main, cursor, branch.from);
        walk(branch, 0, branch.length);
        cursor = branch.to;
      }
      walk(main, cursor, main.length);
      const end = pointOn(main, main.length, offsetAt(main.length));
      out.push([end.x, end.z]);
      return out;
    },
    checkpoints(options) {
      const height = options.height ?? 8;
      const margin = options.margin ?? 1;
      const box = (id: string, entry: Route, s: number): Checkpoint => {
        const point = pointOn(entry, s, 0);
        const half = point.halfWidth + margin;
        return { id, center: [point.x, point.elevation, point.z], half: [half, height, half] };
      };
      const branchRoutes = routes.filter((entry) => entry !== main);
      const ordinary = [...options.at].filter((at) => at < options.finish).sort((a, b) => a - b);
      const mainline: { at: number; cp: Checkpoint }[] = [];
      const forks: RaceFork[] = [];
      const inFork = (at: number): Route | undefined => branchRoutes.find((entry) => at > entry.from && at < entry.to);
      for (const at of ordinary) if (inFork(at) === undefined) mainline.push({ at, cp: box(`cp-${Math.round(at)}`, main, at) });
      for (const entry of branchRoutes) {
        if (!mainline.some((item) => item.at <= entry.from)) mainline.push({ at: Math.max(0, entry.from - 1), cp: box(`cp-${entry.id}-in`, main, Math.max(0, entry.from - 1)) });
      }
      mainline.push({ at: options.finish, cp: box("finish", main, options.finish) });
      mainline.sort((a, b) => a.at - b.at);
      for (const entry of branchRoutes) {
        const afterIndex = mainline.reduce((last, item, index) => (item.at <= entry.from ? index : last), -1);
        if (afterIndex >= mainline.length - 1) throw new Error(`route course: branch "${entry.id}" rejoins after the finish line`);
        const inside = ordinary.filter((at) => at > entry.from && at < entry.to);
        const mainStops = inside.length > 0 ? inside : [(entry.from + entry.to) / 2];
        forks.push({
          id: entry.id,
          afterIndex,
          routes: [
            { id: MAIN_ROUTE, checkpoints: mainStops.map((at) => box(`cp-${Math.round(at)}`, main, at)) },
            { id: entry.id, checkpoints: [box(`cp-${entry.id}`, entry, entry.length / 2)] },
          ],
        });
      }
      return { checkpoints: mainline.map((item) => item.cp), forks };
    },
    terrainProfiles(options = {}) {
      const out: TerrainPathProfile[] = [];
      const extra = options.extraWidth ?? 1;
      for (const entry of routes) {
        let first = 0;
        const slope = (i: number): number => {
          const ds = entry.s[i + 1]! - entry.s[i]!;
          return ds === 0 ? 0 : (entry.elev[i + 1]! - entry.elev[i]!) / ds;
        };
        for (let i = 1; i < entry.x.length; i += 1) {
          const last = i === entry.x.length - 1;
          if (!last && Math.abs(slope(i) - slope(first)) < 1e-6) continue;
          const points: CourseVec2[] = [];
          let widest = 0;
          for (let k = first; k <= i; k += 1) {
            points.push([entry.x[k]!, entry.z[k]!]);
            widest = Math.max(widest, entry.hw[k]!);
          }
          out.push({
            points,
            width: (widest + extra) * 2,
            shoulder: options.shoulder ?? 6,
            height: { kind: "grade", start: entry.elev[first]!, end: entry.elev[i]! },
            ...(options.retaining === undefined ? {} : { retaining: options.retaining }),
          });
          first = i;
        }
      }
      return out;
    },
    groundHeight(base, options = {}) {
      const shoulder = Math.max(0, options.shoulder ?? 4);
      const falloff = Math.max(0.001, Math.min(GRID_REACH - shoulder, options.falloff ?? 16));
      return (x, z) => {
        const near = candidates(x, z);
        if (near.length === 0) return base(x, z);
        const best = nearest(near, (entry) => entry.excess);
        const point = pointOn(best.route, best.s, 0);
        const blend = smoothstep((best.excess - shoulder) / falloff);
        return blend <= 0 ? point.elevation : point.elevation + (base(x, z) - point.elevation) * blend;
      };
    },
  };
  return course;
}

function progressOn(route: Route, s: number): number {
  const clamped = Math.max(0, Math.min(route.length, s));
  if (route.id === MAIN_ROUTE) return clamped;
  return route.from + (route.length === 0 ? 0 : (clamped / route.length) * (route.to - route.from));
}

function pointOn(route: Route, s: number, offset: number): CoursePoint {
  const clamped = Math.max(0, Math.min(route.length, s));
  const seg = segmentAt(route, clamped);
  const span = route.s[seg + 1]! - route.s[seg]!;
  const f = span === 0 ? 0 : (clamped - route.s[seg]!) / span;
  const cx = route.x[seg]! + (route.x[seg + 1]! - route.x[seg]!) * f;
  const cz = route.z[seg]! + (route.z[seg + 1]! - route.z[seg]!) * f;
  // Blend toward the neighbouring segment's heading near each vertex so a posed gate or wall post
  // turns smoothly through a bend instead of stepping at every sample.
  const here = route.heading[seg]!;
  const neighbour = f < 0.5 ? route.heading[Math.max(0, seg - 1)]! : route.heading[Math.min(route.heading.length - 1, seg + 1)]!;
  const weight = f < 0.5 ? 0.5 - f : f - 0.5;
  const heading = here + wrapAngle(neighbour - here) * weight;
  return {
    x: cx + Math.cos(heading) * offset,
    z: cz - Math.sin(heading) * offset,
    heading,
    halfWidth: route.hw[seg]! + (route.hw[seg + 1]! - route.hw[seg]!) * f,
    elevation: route.elev[seg]! + (route.elev[seg + 1]! - route.elev[seg]!) * f,
    progress: progressOn(route, clamped),
  };
}
