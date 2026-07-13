import type { Vec2 } from "./geometry";

/** Closest point on segment `a`→`b` to `p`, and the clamped parameter `t` in [0,1] where it lies. */
export interface ClosestOnSegment {
  point: Vec2;
  t: number;
}

/** Closest point on the segment `a`→`b` to point `p`, with the clamped parameter `t` (0 at `a`, 1 at `b`). */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): ClosestOnSegment {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const l2 = abx * abx + aby * aby;
  const raw = l2 > 0 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2 : 0;
  const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return { point: [a[0] + t * abx, a[1] + t * aby], t };
}

/** A resolved circle-vs-segment contact. */
export interface CircleSegmentHit {
  /** Unit surface normal pointing from the segment toward the circle center — the axis to bounce off. */
  normal: Vec2;
  /** Penetration depth; push the center out by `normal · depth` to separate. */
  depth: number;
  /** Closest point on the segment (the contact point). */
  contact: Vec2;
  /** Circle center pushed just outside the segment — a tunnel-proof resolved position. */
  resolved: Vec2;
}

/**
 * Circle (center + `radius`) against a capsule segment `a`→`b` of half-thickness `thickness` (0 for a thin
 * wall). Returns the contact — surface normal, penetration depth, contact point, and the separated center —
 * or `null` when they do not overlap. Endpoints are rounded (the segment is a capsule), so a ball never
 * catches on a corner. Reflect the velocity across `normal` for the bounce; the pure geometry every 2D
 * ball game (pinball, breakout, air hockey) reimplemented per wall, bumper, and paddle.
 */
export function circleVsSegment(
  center: Vec2,
  radius: number,
  a: Vec2,
  b: Vec2,
  thickness = 0,
): CircleSegmentHit | null {
  const { point } = closestPointOnSegment(center, a, b);
  const dx = center[0] - point[0];
  const dy = center[1] - point[1];
  const dist = Math.hypot(dx, dy);
  const reach = radius + thickness;
  if (dist >= reach) return null;
  let nx: number;
  let ny: number;
  if (dist > 1e-6) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    nx = segLen > 1e-6 ? -(b[1] - a[1]) / segLen : 0;
    ny = segLen > 1e-6 ? (b[0] - a[0]) / segLen : 1;
  }
  const depth = reach - dist;
  return {
    normal: [nx, ny],
    depth,
    contact: point,
    resolved: [point[0] + nx * reach, point[1] + ny * reach],
  };
}
