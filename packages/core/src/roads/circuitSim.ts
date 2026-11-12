/**
 * A point-mass LAP SIMULATION over a closed racing line: the yardstick the circuit designer scores
 * candidate laps with, and the timing the race dressing splits sectors by. Speed at every sample is
 * capped by grip (`v² ≤ g·R·(μ + tanθ)/(1 − μ·tanθ)` with the road's banking θ) and by top speed, then
 * forward (traction) and backward (braking) passes bound how fast it may change. Pure math, no
 * rendering or browser dependencies; deterministic for the same inputs.
 *
 * @capability circuit-sim lap time, speed trace and braking zones of a closed racing line
 */
import type { StreetVec2 } from "./streetGenerator";

/** Car model for {@link simulateLap}. Defaults: a downforce racer (μ 1.7, 90 m/s, 9 m/s² drive, 30 m/s² braking). */
export interface LapSimCar {
  /** Lateral grip coefficient. */
  mu?: number;
  /** Top speed, m/s. */
  topSpeed?: number;
  /** Peak acceleration, m/s². */
  accel?: number;
  /** Peak braking deceleration, m/s². */
  brake?: number;
}

/** One stretch where the car brakes: where it starts and ends, and the speeds either side. */
export interface LapBrakingZone {
  /** Sample index where braking starts. */
  from: number;
  /** Sample index where braking ends (the slowest point of the zone). */
  to: number;
  entrySpeed: number;
  exitSpeed: number;
}

/** The simulated lap: speed and elapsed time per sample, the lap time and its braking zones. */
export interface LapSimResult {
  /** Speed (m/s) at each sample. */
  speed: number[];
  /** Elapsed time (s) at each sample, from sample 0. */
  time: number[];
  lapTime: number;
  /** Share of lap distance spent at full throttle (accelerating or at top speed), 0..1. */
  fullThrottle: number;
  brakingZones: LapBrakingZone[];
}

const G = 9.81;

/**
 * Simulate one flying lap. `curvature` is 1/R per sample (sign ignored), `spacing` the arc distance
 * from each sample to the next (closed: the last sample joins the first), `banking` an optional road
 * roll per sample (radians; tilting into the corner helps).
 */
export function simulateLap(
  curvature: readonly number[],
  spacing: readonly number[],
  car: LapSimCar = {},
  banking?: readonly number[],
): LapSimResult {
  const mu = car.mu ?? 1.7;
  const top = car.topSpeed ?? 90;
  const accel = car.accel ?? 9;
  const brake = car.brake ?? 30;
  const n = curvature.length;
  const v = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const k = Math.abs(curvature[i]!);
    if (k < 1e-6) {
      v[i] = top;
      continue;
    }
    const bank = Math.min(0.3, Math.abs(banking?.[i] ?? 0));
    const t = Math.tan(bank);
    const grip = (mu + t) / Math.max(0.2, 1 - mu * t);
    v[i] = Math.min(top, Math.sqrt((G * grip) / k));
  }
  // Two laps of forward/backward passes settle the closed-loop wrap.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let step = 0; step < n * 2; step += 1) {
      const i = step % n;
      const j = (i + 1) % n;
      const reach = Math.sqrt(v[i]! * v[i]! + 2 * accel * spacing[i]!);
      if (reach < v[j]!) v[j] = reach;
    }
    for (let step = n * 2; step > 0; step -= 1) {
      const j = step % n;
      const i = (j - 1 + n) % n;
      const reach = Math.sqrt(v[j]! * v[j]! + 2 * brake * spacing[i]!);
      if (reach < v[i]!) v[i] = reach;
    }
  }
  const time = new Array<number>(n).fill(0);
  let elapsed = 0;
  let full = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    time[i] = elapsed;
    const a = v[i]!;
    const b = v[(i + 1) % n]!;
    elapsed += spacing[i]! / Math.max(1, (a + b) * 0.5);
    total += spacing[i]!;
    if (b > a + 0.01 || (a >= top - 0.5 && b >= top - 0.5)) full += spacing[i]!;
  }
  // Braking zones: maximal runs where speed falls, started from a non-braking sample so a zone never
  // splits across the seam.
  const braking = (i: number): boolean => v[(i + 1) % n]! < v[i]! - 0.05;
  const zones: LapBrakingZone[] = [];
  let origin = 0;
  while (origin < n && braking(origin)) origin += 1;
  if (origin < n) {
    let k = 0;
    while (k < n) {
      const i = (origin + k) % n;
      if (!braking(i)) {
        k += 1;
        continue;
      }
      let len = 0;
      while (len < n && braking((origin + k + len) % n)) len += 1;
      const from = i;
      const to = (origin + k + len) % n;
      zones.push({ from, to, entrySpeed: v[from]!, exitSpeed: v[to]! });
      k += len;
    }
  }
  return { speed: v, time, lapTime: elapsed, fullThrottle: total > 0 ? full / total : 0, brakingZones: zones };
}

/** Radius of the circle through three points; Infinity when they are collinear. */
export function circumRadius(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  if (cross < 1e-9) return Infinity;
  return (ab * bc * ca) / (2 * cross);
}

/** Per-sample curvature (1/R) of a closed polyline, measured through the points ±`span` meters away. */
export function closedCurvature(points: readonly StreetVec2[], span: number): number[] {
  const n = points.length;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const step = Math.max(1, Math.round(span / Math.max(0.25, total / Math.max(1, n))));
  const out = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const r = circumRadius(points[(i - step + n * 4) % n]!, points[i]!, points[(i + step) % n]!);
    out[i] = Number.isFinite(r) ? 1 / r : 0;
  }
  return out;
}

/** Arc distance from each sample of a closed polyline to the next. */
export function closedSpacing(points: readonly StreetVec2[]): number[] {
  const n = points.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    out[i] = Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return out;
}
