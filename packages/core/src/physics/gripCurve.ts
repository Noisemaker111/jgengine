/** A piecewise-linear curve of `[x, y]` points in ascending `x`: tire grip against slip, engine torque against rpm. */
export interface GripCurve {
  points: readonly (readonly [number, number])[];
}

/**
 * Piecewise-linear tire-grip curve: normalized lateral slip → available grip (0..1). Grip peaks near
 * the breakaway slip then falls off as the tire slides — the shape that separates a planted corner
 * from a drift. Points are read in ascending slip order; ends clamp.
 */
export function sampleGripCurve(curve: GripCurve, slip: number): number {
  const pts = curve.points;
  if (pts.length === 0) return 1;
  const s = Math.abs(slip);
  if (s <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i += 1) {
    const [x1, y1] = pts[i]!;
    if (s <= x1) {
      const [x0, y0] = pts[i - 1]!;
      const span = x1 - x0;
      const t = span <= 0 ? 0 : (s - x0) / span;
      return y0 + (y1 - y0) * t;
    }
  }
  return pts[pts.length - 1]![1];
}

/** A street tire: full grip to slip `0.2`, then it lets go to 55% fully sideways. */
export const DEFAULT_GRIP_CURVE: GripCurve = {
  points: [
    [0, 1],
    [0.2, 1],
    [0.45, 0.78],
    [1, 0.55],
  ],
};

/** The peak of a grip curve: its highest grip, the far end of a flat plateau as the breakaway slip, and the grip left at slip `1`. */
export function gripCurvePeak(curve: GripCurve): { peakGrip: number; peakSlip: number; slideGrip: number } {
  let peakGrip = 0;
  let peakSlip = 0;
  for (const [slip, grip] of curve.points) {
    if (grip >= peakGrip) {
      peakGrip = grip;
      peakSlip = slip;
    }
  }
  return { peakGrip, peakSlip, slideGrip: sampleGripCurve(curve, 1) };
}
