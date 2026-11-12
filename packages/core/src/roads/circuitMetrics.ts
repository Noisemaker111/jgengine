/**
 * Race lap quality metrics, measured on any closed centerline (a generated `CircuitRoute` or a city's
 * `ResolvedRace` fits the input shape as-is). The lap is resampled at an even step and every figure
 * comes from its own curvature, not from the generator's corner analysis, so two generators compare on
 * the same ruler. Model code; no renderer.
 *
 * - Corners: runs tighter than `straightRadius` (default 250 m) on one hand, merged across short gaps,
 *   kept when they turn at least `cornerMinAngleDeg`; each gets an apex radius, turn angle, hand and a
 *   kind (hairpin, right-angle, tight, medium, sweeper, kink). Corners per km, the radius spread
 *   (p10/p50/p90) and the share of corners near 90° (75–105°, the street-grid signature) follow.
 * - Straights: stretches where a straight line fits inside the road (the centerline never strays more
 *   than `straightTolerance` from the chord), so a slightly wavy street still counts and a long sweeper
 *   does not. Braking zones and overtaking spots come from the point-mass {@link simulateLap}, driven
 *   straight along each straight — an overtaking spot is a heavy braking zone (Δv ≥ 50 km/h) that
 *   starts on a straight of at least 250 m.
 * - Elevation: range, total climb and the steepest grade over a 10 m baseline.
 * - Dressing: grid slots standing in a corner, seals per km, sector boundaries inside corners, and pit
 *   lanes (do both ends join the lap; does a seal stand across the pit road).
 */
import { quantile } from "../math/stats";
import { simulateLap, type BrakingZone, type LapSimOptions, type LapSimResult } from "./lapSim";
import { polylineLength, type PlanPoint } from "./streetMetrics";

/** The lap a circuit metric reads. Only `centerline` is required. */
export interface CircuitMetricsInput {
  /** Closed lap centerline; the last point joins the first. */
  readonly centerline: readonly PlanPoint[];
  /** Road width per centerline point. */
  readonly widths?: readonly number[];
  /** Road-surface height per centerline point. */
  readonly heights?: readonly number[];
  readonly grid?: readonly { readonly x: number; readonly z: number }[];
  readonly seals?: readonly { readonly x: number; readonly z: number }[];
  /** Sector start fractions of the lap (0..1) measured from `start.distance`. */
  readonly sectors?: readonly number[];
  readonly start?: { readonly distance: number };
  /** Pit lane centerlines, entry first. */
  readonly pits?: readonly (readonly PlanPoint[])[];
}

export interface CircuitMetricsOptions {
  /** Resample step (m). Default 2. */
  readonly sampleStep?: number;
  /** Half-span (m) of the three-point curvature estimate. Default 8. */
  readonly curvatureWindow?: number;
  /** Radius (m) above which the lap is not cornering. Default 250. */
  readonly straightRadius?: number;
  /** How far (m) the centerline may stray from a straight's chord; default half the road width less 1 m (at least 1 m), 1.5 m without widths. */
  readonly straightTolerance?: number;
  /** Shortest straight (m) reported. Default 40. */
  readonly minStraight?: number;
  /** Corners turning less than this (degrees) are ignored. Default 20. */
  readonly cornerMinAngleDeg?: number;
  /** Same-hand curvature runs closer than this (m) merge into one corner. Default 15. */
  readonly mergeGap?: number;
  /** Two opposite-hand corners this close (m) form a chicane. Default 40. */
  readonly chicaneGap?: number;
  /** Shortest straight (m) that sets up an overtake. Default 250. */
  readonly overtakeStraight?: number;
  /** Speed lost (km/h) in a braking zone that counts as heavy braking. Default 50. */
  readonly overtakeDeltaKph?: number;
  /** A grid slot whose nearest lap point is tighter than this radius (m) stands in a corner. Default 150. */
  readonly gridCornerRadius?: number;
  /** Baseline (m) the steepest grade is measured over. Default 10. */
  readonly gradeBaseline?: number;
  /** The lap length that was asked for, to report the error. */
  readonly requestedLength?: number;
  readonly lapSim?: LapSimOptions;
}

export type CircuitCornerKind = "hairpin" | "right-angle" | "tight" | "medium" | "sweeper" | "kink";

/** One corner found on the resampled lap. Indices are into {@link CircuitAnalysis.samples}. */
export interface DetectedCorner {
  entry: number;
  apex: number;
  exit: number;
  /** Apex radius (m). */
  radius: number;
  /** Total turn (degrees, positive). */
  angleDeg: number;
  /** 1 turns from +x toward +z (counter-clockwise with z drawn up), -1 the other way. */
  direction: -1 | 1;
  kind: CircuitCornerKind;
}

/** One straight: a stretch a straight line can be driven inside the road. */
export interface DetectedStraight {
  start: number;
  end: number;
  length: number;
}

/** One overtaking spot: a heavy braking zone at the end of a long straight. */
export interface OvertakingSpot {
  /** Sample index where braking starts. */
  brakeAt: number;
  /** Length (m) of the straight it ends. */
  straight: number;
  /** Speed lost (km/h). */
  deltaKph: number;
}

export interface CircuitMetrics {
  lengthM: number;
  /** Signed error against `requestedLength` (%); `NaN` when none was given. */
  lengthErrorPct: number;
  corners: number;
  cornersPerKm: number;
  cornerKinds: Record<CircuitCornerKind, number>;
  /** Share of corners turning 75–105°, 0..1. */
  rightAngleShare: number;
  chicanes: number;
  radiusP10: number;
  radiusP50: number;
  radiusP90: number;
  tightestRadius: number;
  longestStraightM: number;
  straightsOver250: number;
  straightsOver400: number;
  brakingZones: number;
  heavyBrakingZones: number;
  overtakingSpots: number;
  lapTimeS: number;
  avgKph: number;
  minKph: number;
  maxKph: number;
  fullThrottleShare: number;
  elevationRangeM: number;
  climbM: number;
  /** Steepest rise over run (0..1) across `gradeBaseline`. */
  maxGrade: number;
  widthMin: number;
  widthMax: number;
  gridSlots: number;
  gridInCorner: number;
  seals: number;
  sealsPerKm: number;
  sectors: number;
  sectorBoundariesInCorners: number;
  pits: number;
  /** Pit lanes whose both ends meet the lap's road edge. */
  pitsConnected: number;
  /** Seals standing on a pit lane. */
  sealsBlockingPit: number;
}

/** Everything a metric or a drawing needs about one lap. */
export interface CircuitAnalysis {
  /** The evenly resampled lap. */
  samples: PlanPoint[];
  /** Arc length at each sample (m). */
  distances: number[];
  step: number;
  /** Radius of curvature at each sample (m; Infinity when straight). */
  radii: number[];
  widths: number[];
  heights?: number[];
  corners: DetectedCorner[];
  straights: DetectedStraight[];
  sim: LapSimResult;
  heavyBraking: BrakingZone[];
  overtakingSpots: OvertakingSpot[];
  metrics: CircuitMetrics;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Resample a closed polyline at an even step, carrying per-point attributes along. */
function resampleClosed(points: readonly PlanPoint[], step: number, attrs: readonly (readonly number[] | undefined)[]): { pts: PlanPoint[]; step: number; attrs: (number[] | undefined)[] } {
  const n = points.length;
  const total = polylineLength(points, true);
  const count = Math.max(8, Math.round(total / step));
  const even = total / count;
  const pts: PlanPoint[] = [];
  const out = attrs.map((a) => (a === undefined ? undefined : ([] as number[])));
  let seg = 0;
  let segStart = 0;
  let segLen = Math.hypot(points[1 % n]![0] - points[0]![0], points[1 % n]![1] - points[0]![1]);
  for (let k = 0; k < count; k += 1) {
    const s = k * even;
    while (segStart + segLen < s && seg < n - 1) {
      segStart += segLen;
      seg += 1;
      const a = points[seg]!;
      const b = points[(seg + 1) % n]!;
      segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const t = segLen > 0 ? Math.min(1, Math.max(0, (s - segStart) / segLen)) : 0;
    const a = points[seg]!;
    const b = points[(seg + 1) % n]!;
    pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    attrs.forEach((attr, i) => {
      if (attr === undefined) return;
      out[i]!.push(lerp(attr[seg] ?? attr[0]!, attr[(seg + 1) % n] ?? attr[0]!, t));
    });
  }
  return { pts, step: even, attrs: out };
}

function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function classify(angleDeg: number, radius: number): CircuitCornerKind {
  if (angleDeg >= 130 && radius < 50) return "hairpin";
  if (angleDeg < 35) return "kink";
  if (radius >= 70) return "sweeper";
  if (angleDeg >= 70 && angleDeg <= 110 && radius < 40) return "right-angle";
  if (radius < 40) return "tight";
  return "medium";
}

/**
 * Analyze one closed lap: curvature, corners, straights, a lap simulation and the metrics.
 * @capability generator-metrics measure generated street nets, city districts and race laps against cited reference bands; `bun run gen-audit` renders and tables them
 */
export function analyzeCircuit(input: CircuitMetricsInput, options: CircuitMetricsOptions = {}): CircuitAnalysis {
  const straightR = options.straightRadius ?? 250;
  const re = resampleClosed(input.centerline, options.sampleStep ?? 2, [input.widths, input.heights]);
  const samples = re.pts;
  const step = re.step;
  const n = samples.length;
  const widths = re.attrs[0] ?? samples.map(() => 0);
  const heights = re.attrs[1];
  const distances = samples.map((_, i) => i * step);
  const length = n * step;
  const at = (i: number): PlanPoint => samples[((i % n) + n) % n]!;

  // Signed three-point curvature over ±window.
  const w = Math.max(1, Math.round((options.curvatureWindow ?? 8) / step));
  const kappa = samples.map((b, i) => {
    const a = at(i - w);
    const c = at(i + w);
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const denom = ab * bc * ca;
    return denom < 1e-12 ? 0 : (2 * cross) / denom;
  });
  const radii = kappa.map((k) => (Math.abs(k) < 1e-12 ? Infinity : 1 / Math.abs(k)));
  const heading = samples.map((p, i) => Math.atan2(at(i + 1)[1] - p[1], at(i + 1)[0] - p[0]));
  const turn = samples.map((_, i) => wrapAngle(heading[i]! - heading[(i - 1 + n) % n]!));

  // Corner runs: curvature past the straight threshold, one hand at a time.
  const sign = kappa.map((k, i) => (radii[i]! < straightR ? (Math.sign(k) as -1 | 0 | 1) : 0));
  type Run = { entry: number; exit: number; dir: -1 | 1 };
  const runs: Run[] = [];
  const startAt = sign.findIndex((s) => s === 0);
  if (startAt < 0) {
    runs.push({ entry: 0, exit: n - 1, dir: kappa.reduce((s, k) => s + k, 0) >= 0 ? 1 : -1 });
  } else {
    let cur: Run | null = null;
    for (let k = 1; k <= n; k += 1) {
      const i = (startAt + k) % n;
      const s = sign[i]!;
      if (cur !== null && s === cur.dir) cur.exit = i;
      else {
        if (cur !== null) runs.push(cur);
        cur = s === 0 ? null : { entry: i, exit: i, dir: s };
      }
    }
    if (cur !== null) runs.push(cur);
  }
  const span = (from: number, to: number): number => ((to - from + n) % n) * step;
  const mergeGap = options.mergeGap ?? 15;
  const merged: Run[] = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (last !== undefined && last.dir === run.dir && span(last.exit, run.entry) <= mergeGap) last.exit = run.exit;
    else merged.push({ ...run });
  }
  if (merged.length > 1) {
    const first = merged[0]!;
    const last = merged.at(-1)!;
    if (first.dir === last.dir && span(last.exit, first.entry) <= mergeGap && startAt >= 0) {
      first.entry = last.entry;
      merged.pop();
    }
  }
  const minAngle = options.cornerMinAngleDeg ?? 20;
  const corners: DetectedCorner[] = [];
  for (const run of merged) {
    const count = startAt < 0 ? n : ((run.exit - run.entry + n) % n) + 1;
    const cumulative: number[] = [0];
    for (let k = 1; k < count; k += 1) cumulative.push(cumulative[k - 1]! + turn[(run.entry + k) % n]!);
    const angle = cumulative[count - 1]!;
    const angleDeg = Math.abs((angle * 180) / Math.PI);
    if (angleDeg < minAngle) continue;
    // Trim the run to where 5%..95% of its turn happens: the window smear and road wander on either
    // side of a sharp corner are not part of it.
    let from = 0;
    while (from < count - 1 && Math.abs(cumulative[from]!) < Math.abs(angle) * 0.05) from += 1;
    let to = count - 1;
    while (to > from && Math.abs(cumulative[to]!) > Math.abs(angle) * 0.95) to -= 1;
    const entry = (run.entry + Math.max(0, from - 1)) % n;
    const exit = (run.entry + Math.min(count - 1, to + 1)) % n;
    let apex = entry;
    for (let k = 0; k <= (exit - entry + n) % n; k += 1) if (radii[(entry + k) % n]! < radii[apex]!) apex = (entry + k) % n;
    corners.push({ entry, apex, exit, radius: radii[apex]!, angleDeg, direction: run.dir, kind: classify(angleDeg, radii[apex]!) });
  }
  corners.sort((a, b) => a.entry - b.entry);
  const inCorner = (i: number): boolean =>
    corners.some((c) => {
      const len = (c.exit - c.entry + n) % n;
      return (i - c.entry + n) % n <= len;
    });

  // Straights: the longest stretches between corners (kinks may sit inside one) where a straight line
  // can be driven inside the road (every centerline point within `straightTolerance` of the chord),
  // picked longest first without overlapping. A wavy street that still fits a straight racing line is
  // a straight; a long sweeper is not.
  const cornerMask = new Uint8Array(n);
  for (const c of corners) {
    if (c.kind === "kink") continue;
    for (let k = 0; k <= (c.exit - c.entry + n) % n; k += 1) cornerMask[(c.entry + k) % n] = 1;
  }
  const tolerance = (i: number): number => options.straightTolerance ?? (widths[i]! > 0 ? Math.max(1, widths[i]! / 2 - 1) : 1.5);
  const fits = (i: number, j: number): boolean => {
    const a = at(i);
    const b = at(j);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return false;
    for (let k = i + 1; k < j; k += 1) {
      const p = at(k);
      if (Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / len > tolerance(((k % n) + n) % n)) return false;
    }
    return true;
  };
  const reachOf: number[] = [];
  let reach = 1;
  for (let i = 0; i < n; i += 1) {
    if (cornerMask[i] || cornerMask[(i + 1) % n]) {
      reachOf.push(i);
      continue;
    }
    let j = Math.max(reach, i + 1);
    if (j > i + 1 && !fits(i, j)) j = i + 1;
    while (j + 1 < i + n && !cornerMask[(j + 1) % n] && fits(i, j + 1)) j += 1;
    reachOf.push(j);
    reach = j;
  }
  const minStraight = options.minStraight ?? 40;
  const taken = new Uint8Array(n);
  const straights: DetectedStraight[] = [];
  const candidates = reachOf.map((j, i) => ({ i, j, length: (j - i) * step })).filter((c) => c.length >= minStraight).sort((p, q) => q.length - p.length || p.i - q.i);
  for (const c of candidates) {
    let clear = true;
    for (let k = c.i + 1; k < c.j && clear; k += 1) if (taken[k % n]) clear = false;
    if (!clear) continue;
    for (let k = c.i + 1; k < c.j; k += 1) taken[k % n] = 1;
    straights.push({ start: c.i % n, end: c.j % n, length: c.length });
  }
  straights.sort((p, q) => p.start - q.start);
  const onStraight = (i: number): DetectedStraight | undefined => straights.find((st) => (i - st.start + n) % n <= (st.end - st.start + n) % n);

  // Lap simulation (a straight is driven as one), heavy braking and overtaking spots.
  const simRadii = radii.map((r, i) => (taken[i] ? Infinity : r));
  const sim = simulateLap(samples, simRadii, options.lapSim);
  const heavyDelta = (options.overtakeDeltaKph ?? 50) / 3.6;
  const heavyBraking = sim.brakingZones.filter((zone) => zone.from - zone.to >= heavyDelta);
  const overtakeStraight = options.overtakeStraight ?? 250;
  const overtakingSpots: OvertakingSpot[] = [];
  for (const zone of heavyBraking) {
    const straight = onStraight(zone.start);
    if (straight !== undefined && straight.length >= overtakeStraight) overtakingSpots.push({ brakeAt: zone.start, straight: straight.length, deltaKph: (zone.from - zone.to) * 3.6 });
  }

  // Elevation.
  let elevationRangeM = 0;
  let climbM = 0;
  let maxGrade = 0;
  if (heights !== undefined) {
    elevationRangeM = Math.max(...heights) - Math.min(...heights);
    const reach = Math.max(1, Math.ceil((options.gradeBaseline ?? 10) / step));
    for (let i = 0; i < n; i += 1) {
      climbM += Math.max(0, heights[(i + 1) % n]! - heights[i]!);
      maxGrade = Math.max(maxGrade, Math.abs(heights[(i + reach) % n]! - heights[i]!) / (reach * step));
    }
  }

  // Dressing.
  const nearest = (x: number, z: number): { index: number; distance: number } => {
    let index = 0;
    let best = Infinity;
    for (let i = 0; i < n; i += 1) {
      const d = Math.hypot(samples[i]![0] - x, samples[i]![1] - z);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    return { index, distance: best };
  };
  const gridCornerR = options.gridCornerRadius ?? 150;
  let gridInCorner = 0;
  for (const slot of input.grid ?? []) {
    const { index } = nearest(slot.x, slot.z);
    if (radii[index]! < gridCornerR || inCorner(index)) gridInCorner += 1;
  }
  const rawLength = polylineLength(input.centerline, true);
  let sectorBoundariesInCorners = 0;
  for (const fraction of (input.sectors ?? []).slice(1)) {
    const d = ((((input.start?.distance ?? 0) / Math.max(1e-9, rawLength) + fraction) % 1) + 1) % 1;
    if (inCorner(Math.floor(d * n) % n)) sectorBoundariesInCorners += 1;
  }
  let pitsConnected = 0;
  let sealsBlockingPit = 0;
  for (const pit of input.pits ?? []) {
    if (pit.length < 2) continue;
    const ends = [pit[0]!, pit.at(-1)!].map((p) => {
      const hit = nearest(p[0], p[1]);
      return hit.distance - widths[hit.index]! / 2;
    });
    if (ends.every((gap) => gap <= 3)) pitsConnected += 1;
    for (const seal of input.seals ?? []) {
      let best = Infinity;
      for (let i = 0; i + 1 < pit.length; i += 1) {
        const a = pit[i]!;
        const b = pit[i + 1]!;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((seal.x - a[0]) * dx + (seal.z - a[1]) * dz) / l2));
        best = Math.min(best, Math.hypot(seal.x - a[0] - dx * t, seal.z - a[1] - dz * t));
      }
      if (best <= 3) sealsBlockingPit += 1;
    }
  }

  const kinds: Record<CircuitCornerKind, number> = { hairpin: 0, "right-angle": 0, tight: 0, medium: 0, sweeper: 0, kink: 0 };
  for (const corner of corners) kinds[corner.kind] += 1;
  const cornerRadii = corners.map((c) => c.radius);
  const km = length / 1000;
  const metrics: CircuitMetrics = {
    lengthM: length,
    lengthErrorPct: options.requestedLength === undefined ? Number.NaN : (100 * (length - options.requestedLength)) / options.requestedLength,
    corners: corners.length,
    cornersPerKm: km > 0 ? corners.length / km : 0,
    cornerKinds: kinds,
    rightAngleShare: corners.length > 0 ? corners.filter((c) => c.angleDeg >= 75 && c.angleDeg <= 105).length / corners.length : 0,
    chicanes: corners.filter((c, i) => {
      const next = corners[(i + 1) % corners.length]!;
      return corners.length > 1 && next.direction !== c.direction && span(c.exit, next.entry) <= (options.chicaneGap ?? 40);
    }).length,
    radiusP10: quantile(cornerRadii, 0.1),
    radiusP50: quantile(cornerRadii, 0.5),
    radiusP90: quantile(cornerRadii, 0.9),
    tightestRadius: Math.min(...radii),
    longestStraightM: Math.max(0, ...straights.map((s) => s.length)),
    straightsOver250: straights.filter((s) => s.length >= 250).length,
    straightsOver400: straights.filter((s) => s.length >= 400).length,
    brakingZones: sim.brakingZones.length,
    heavyBrakingZones: heavyBraking.length,
    overtakingSpots: overtakingSpots.length,
    lapTimeS: sim.time,
    avgKph: sim.avgSpeed * 3.6,
    minKph: sim.minSpeed * 3.6,
    maxKph: sim.maxSpeed * 3.6,
    fullThrottleShare: sim.fullThrottleShare,
    elevationRangeM,
    climbM,
    maxGrade,
    widthMin: Math.min(...widths),
    widthMax: Math.max(...widths),
    gridSlots: input.grid?.length ?? 0,
    gridInCorner,
    seals: input.seals?.length ?? 0,
    sealsPerKm: km > 0 ? (input.seals?.length ?? 0) / km : 0,
    sectors: input.sectors?.length ?? 0,
    sectorBoundariesInCorners,
    pits: input.pits?.length ?? 0,
    pitsConnected,
    sealsBlockingPit,
  };
  return { samples, distances, step, radii, widths, ...(heights === undefined ? {} : { heights }), corners, straights, sim, heavyBraking, overtakingSpots, metrics };
}

/** The {@link CircuitMetrics} of one closed lap (see {@link analyzeCircuit} for the full breakdown). */
export function circuitMetrics(input: CircuitMetricsInput, options: CircuitMetricsOptions = {}): CircuitMetrics {
  return analyzeCircuit(input, options).metrics;
}
