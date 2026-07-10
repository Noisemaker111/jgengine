export interface TrailPoint {
  x: number;
  z: number;
}

export const TRAIL_MIN_SPACING = 0.6;
export const TRAIL_MAX_LENGTH = 400;
export const FOLLOWER_SPACING = 6;
export const FOLLOWER_CATCHUP_MULTIPLIER = 1.2;
export const STRAGGLE_DISTANCE = 4;

export function recordTrail(
  trail: readonly TrailPoint[],
  point: TrailPoint,
  minSpacing: number = TRAIL_MIN_SPACING,
  maxLength: number = TRAIL_MAX_LENGTH,
): readonly TrailPoint[] {
  const last = trail[trail.length - 1];
  if (last !== undefined && Math.hypot(point.x - last.x, point.z - last.z) < minSpacing) return trail;
  const next = [...trail, point];
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

export function positionOnTrail(trail: readonly TrailPoint[], distanceBehindHead: number): TrailPoint {
  if (trail.length === 0) return { x: 0, z: 0 };
  if (trail.length === 1) return trail[0]!;
  let remaining = distanceBehindHead;
  for (let index = trail.length - 1; index > 0; index -= 1) {
    const head = trail[index]!;
    const tail = trail[index - 1]!;
    const segmentLength = Math.hypot(head.x - tail.x, head.z - tail.z);
    if (segmentLength >= remaining) {
      const t = segmentLength === 0 ? 0 : remaining / segmentLength;
      return { x: head.x + (tail.x - head.x) * t, z: head.z + (tail.z - head.z) * t };
    }
    remaining -= segmentLength;
  }
  return trail[0]!;
}

export function advanceFollowerToward(
  current: TrailPoint,
  target: TrailPoint,
  speed: number,
  dt: number,
): TrailPoint {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  const step = Math.max(0, speed) * dt;
  if (distance <= step || distance === 0) return { x: target.x, z: target.z };
  return { x: current.x + (dx / distance) * step, z: current.z + (dz / distance) * step };
}

export function isStraggling(current: TrailPoint, target: TrailPoint, threshold: number = STRAGGLE_DISTANCE): boolean {
  return Math.hypot(target.x - current.x, target.z - current.z) > threshold;
}
