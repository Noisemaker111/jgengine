/**
 * A point-mass lap-time simulator: the classic quasi-steady estimate race engineers sketch before any
 * vehicle model. Each point of a closed lap gets a cornering limit `v ≤ √(μ·g·R)` capped at top speed,
 * then a forward pass applies the acceleration limit and a backward pass the braking limit, both from
 * the slowest point so the closed loop is exact. Lap time integrates `2·ds / (v₀ + v₁)` (exact for a
 * constant acceleration between points). Model code; no vehicle physics, no renderer.
 *
 * The defaults are a quick grip-limited race car (μ 1.7, 90 m/s top speed, 9 m/s² drive, 30 m/s²
 * braking) — fixed so two layouts compare on lap character, not on tuning.
 */
import type { PlanPoint } from "./streetMetrics";

export interface LapSimOptions {
  /** Tyre friction coefficient (lateral grip = μ·g). Default 1.7. */
  readonly mu?: number;
  /** Gravity (m/s²). Default 9.81. */
  readonly gravity?: number;
  /** Top speed (m/s). Default 90. */
  readonly topSpeed?: number;
  /** Longitudinal acceleration limit (m/s²). Default 9. */
  readonly accel?: number;
  /** Braking deceleration limit (m/s²). Default 30. */
  readonly brake?: number;
}

/** One maximal run of braking, as point indices into the lap. */
export interface BrakingZone {
  /** Point where braking starts. */
  start: number;
  /** Point where it ends (the corner's slowest point). */
  end: number;
  /** Speed at `start` and at `end` (m/s). */
  from: number;
  to: number;
  /** Distance spent braking (m). */
  length: number;
}

export interface LapSimResult {
  /** Lap time (s). */
  time: number;
  /** Lap length (m). */
  length: number;
  avgSpeed: number;
  minSpeed: number;
  maxSpeed: number;
  /** Share of lap distance spent accelerating or at top speed, 0..1. */
  fullThrottleShare: number;
  /** Speed at each point (m/s). */
  speeds: number[];
  brakingZones: BrakingZone[];
}

const EPS = 1e-6;

/**
 * Simulate one flying lap of a closed loop. `radii[i]` is the radius of curvature (m) at `points[i]`;
 * `Infinity` (or any radius whose cornering limit exceeds top speed) is a straight.
 * @capability generator-metrics measure generated street nets, city districts and race laps against cited reference bands; `bun run gen-audit` renders and tables them
 */
export function simulateLap(points: readonly PlanPoint[], radii: readonly number[], options: LapSimOptions = {}): LapSimResult {
  const n = points.length;
  const mu = options.mu ?? 1.7;
  const g = options.gravity ?? 9.81;
  const top = options.topSpeed ?? 90;
  const accel = options.accel ?? 9;
  const brake = options.brake ?? 30;
  if (n < 2) return { time: 0, length: 0, avgSpeed: 0, minSpeed: 0, maxSpeed: 0, fullThrottleShare: 0, speeds: [], brakingZones: [] };
  const ds = points.map((p, i) => Math.hypot(points[(i + 1) % n]![0] - p[0], points[(i + 1) % n]![1] - p[1]));
  const limit = radii.map((r) => Math.min(top, Number.isFinite(r) ? Math.sqrt(mu * g * Math.max(0, r)) : top));
  let k0 = 0;
  for (let i = 1; i < n; i += 1) if (limit[i]! < limit[k0]!) k0 = i;
  const fwd = new Array<number>(n);
  const bwd = new Array<number>(n);
  fwd[k0] = limit[k0]!;
  for (let step = 1; step < n; step += 1) {
    const j = (k0 + step) % n;
    const prev = (j - 1 + n) % n;
    fwd[j] = Math.min(limit[j]!, Math.sqrt(fwd[prev]! ** 2 + 2 * accel * ds[prev]!));
  }
  bwd[k0] = limit[k0]!;
  for (let step = 1; step < n; step += 1) {
    const j = (k0 - step + n) % n;
    const next = (j + 1) % n;
    bwd[j] = Math.min(limit[j]!, Math.sqrt(bwd[next]! ** 2 + 2 * brake * ds[j]!));
  }
  const speeds = fwd.map((v, i) => Math.min(v, bwd[i]!));
  let time = 0;
  let length = 0;
  let full = 0;
  const braking: boolean[] = [];
  for (let i = 0; i < n; i += 1) {
    const va = speeds[i]!;
    const vb = speeds[(i + 1) % n]!;
    length += ds[i]!;
    time += (2 * ds[i]!) / Math.max(EPS, va + vb);
    if (vb > va + EPS || (va >= top - 1e-3 && vb >= top - 1e-3)) full += ds[i]!;
    braking.push(vb < va - EPS);
  }
  // Braking zones: maximal runs of braking segments, starting the scan where braking is off.
  const brakingZones: BrakingZone[] = [];
  const off = braking.findIndex((b) => !b);
  if (off >= 0) {
    let zone: BrakingZone | null = null;
    for (let k = 1; k <= n; k += 1) {
      const i = (off + k) % n;
      if (braking[i]) {
        if (zone === null) zone = { start: i, end: (i + 1) % n, from: speeds[i]!, to: speeds[(i + 1) % n]!, length: 0 };
        zone.end = (i + 1) % n;
        zone.to = speeds[zone.end]!;
        zone.length += ds[i]!;
      } else if (zone !== null) {
        brakingZones.push(zone);
        zone = null;
      }
    }
    if (zone !== null) brakingZones.push(zone);
  }
  return {
    time,
    length,
    avgSpeed: time > 0 ? length / time : 0,
    minSpeed: Math.min(...speeds),
    maxSpeed: Math.max(...speeds),
    fullThrottleShare: length > 0 ? full / length : 0,
    speeds,
    brakingZones,
  };
}
