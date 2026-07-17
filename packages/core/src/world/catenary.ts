/**
 * Generic sag/catenary curve → point string, ready to loft into a tube. Genre-agnostic — power lines,
 * suspension-bridge cables, ziplines, ropes, hanging chains, festoon lights all hang the same way.
 * `sagCurve` is a cheap quadratic-Bézier droop; `catenaryCurve` is the true cosh hyperbolic cable.
 *
 * @capability catenary sagging cable curve between two anchors
 */

export type { Vec3 } from "./geometry";
import type { Vec3 } from "./geometry";

/**
 * Quadratic-Bézier sag between two anchors: the control point is pulled straight down so the mid-span
 * lowest point droops by exactly `sag` meters below the chord. Cheap and stable; the go-to for cables
 * where exact catenary physics don't matter. Returns `segments + 1` points.
 */
export function sagCurve(a: Vec3, b: Vec3, sag: number, segments: number): Vec3[] {
  const steps = Math.max(2, Math.round(segments));
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2 - 2 * sag;
  const cz = (a[2] + b[2]) / 2;
  const points: Vec3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const w0 = u * u;
    const w1 = 2 * u * t;
    const w2 = t * t;
    points.push([w0 * a[0] + w1 * cx + w2 * b[0], w0 * a[1] + w1 * cy + w2 * b[1], w0 * a[2] + w1 * cz + w2 * b[2]]);
  }
  return points;
}

/**
 * True hyperbolic catenary between two anchors — the shape a uniform cable actually takes under
 * gravity. `slack` is the extra length beyond the straight-line distance, as a fraction (0.1 = 10%
 * longer than taut); larger slack droops deeper. Falls back to {@link sagCurve} for a near-taut cable.
 * Returns `segments + 1` points. Anchors may differ in height; the curve interpolates the chord.
 */
export function catenaryCurve(a: Vec3, b: Vec3, slack: number, segments: number): Vec3[] {
  const steps = Math.max(2, Math.round(segments));
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 1e-4 || slack <= 0) return sagCurve(a, b, Math.max(0, slack) * horizontal * 0.5, steps);
  const length = horizontal * (1 + slack);
  // Solve the catenary parameter `p` (= a in y=p·cosh(x/p)) for the required arc length via bisection.
  const targetRatio = length / horizontal;
  let lo = 1e-3;
  let hi = 1e6;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    const ratio = (2 * mid * Math.sinh(horizontal / (2 * mid))) / horizontal;
    if (ratio > targetRatio) lo = mid;
    else hi = mid;
  }
  const p = (lo + hi) / 2;
  const edge = p * Math.cosh(horizontal / (2 * p));
  const points: Vec3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = a[0] + dx * t;
    const z = a[2] + dz * t;
    // Local horizontal coordinate centered at mid-span → catenary drop below the chord (0 at ends).
    const local = (t - 0.5) * horizontal;
    const drop = p * Math.cosh(local / p) - edge;
    const chordY = a[1] + (b[1] - a[1]) * t;
    points.push([x, chordY + drop, z]);
  }
  return points;
}
