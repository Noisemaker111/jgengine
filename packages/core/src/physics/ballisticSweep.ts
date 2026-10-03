import type { PhysicsWorld } from "./physicsWorld";
import { intersectAabb } from "../scene/objectQuery";

export interface BallisticSweepHit {
  point: [number, number, number];
  time: number;
}

export type BallisticSweep = (
  origin: readonly [number, number, number],
  velocity: readonly [number, number, number],
  gravity: number,
  maxTime: number,
) => BallisticSweepHit | null;

export interface BallisticSweepOptions {
  /** Fixed march interval along the arc, in seconds. Default 1/60. */
  step?: number;
  /** Projectile radius; each body AABB is inflated by this before the point test. Default 0. */
  radius?: number;
}

const DEFAULT_SWEEP_STEP = 1 / 60;

/**
 * Sweeps each short chord of the closed-form arc through live body AABBs, including sleeping bodies.
 * Thin cover between samples blocks; `step` controls the approximation of the curved path.
 */
export function createBallisticSweep(world: PhysicsWorld, options: BallisticSweepOptions = {}): BallisticSweep {
  const step = options.step ?? DEFAULT_SWEEP_STEP;
  const radius = options.radius ?? 0;
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(radius) || radius < 0) throw new RangeError("Ballistic sweep requires a finite positive step and nonnegative radius");

  return (origin, velocity, gravity, maxTime) => {
    if (!origin.every(Number.isFinite) || !velocity.every(Number.isFinite) || !Number.isFinite(gravity) || !Number.isFinite(maxTime) || maxTime < 0 || Math.ceil(maxTime / step) > 100_000) throw new RangeError("Ballistic sweep requires finite inputs within its 100000 segment budget");
    const pointAt = (t: number): [number, number, number] => [
      origin[0] + velocity[0] * t,
      origin[1] + velocity[1] * t - 0.5 * gravity * t * t,
      origin[2] + velocity[2] * t,
    ];
    let t = 0;
    for (;;) {
      const nextTime = Math.min(t + step, maxTime);
      const from = pointAt(t);
      const to = pointAt(nextTime);
      let fraction: number | null = null;
      for (let i = 0; i < world.highWater; i += 1) {
        if (!world.isAlive(i)) continue;
        const contact = sweepMovingBounds(from, to, [world.posX[i]!, world.posY[i]!, world.posZ[i]!], [world.posX[i]!, world.posY[i]!, world.posZ[i]!], [world.halfX[i]! + radius, world.halfY[i]! + radius, world.halfZ[i]! + radius]);
        if (contact !== null && (fraction === null || contact < fraction)) fraction = contact;
      }
      if (fraction !== null) { const time = t + (nextTime - t) * fraction; return { point: pointAt(time), time }; }
      if (t >= maxTime) return null;
      t = nextTime;
    }
  };
}

/** Contact fraction for a point segment against a translating axis-aligned box; inflate extents for a projectile radius.
 * @capability moving-box-sweep detect contact with boxes crossing a projectile segment between simulation poses
 */
export function sweepMovingBounds(
  from: readonly [number, number, number], to: readonly [number, number, number],
  targetFrom: readonly [number, number, number], targetTo: readonly [number, number, number],
  halfExtents: readonly [number, number, number],
): number | null {
  const origin: [number, number, number] = [from[0] - targetFrom[0], from[1] - targetFrom[1], from[2] - targetFrom[2]];
  const motion: [number, number, number] = [to[0] - targetTo[0] - origin[0], to[1] - targetTo[1] - origin[1], to[2] - targetTo[2] - origin[2]];
  return intersectAabb(origin, motion, [-halfExtents[0], -halfExtents[1], -halfExtents[2]], halfExtents, 1)?.distance ?? null;
}

/** Contact fraction for a point segment against a translating sphere; add the projectile radius to `radius`.
 * @capability moving-sphere-sweep detect contact with spheres crossing a projectile segment between simulation poses
 */
export function sweepMovingSphere(
  from: readonly [number, number, number], to: readonly [number, number, number],
  targetFrom: readonly [number, number, number], targetTo: readonly [number, number, number], radius: number,
): number | null {
  const ox = from[0] - targetFrom[0]; const oy = from[1] - targetFrom[1]; const oz = from[2] - targetFrom[2];
  const dx = to[0] - targetTo[0] - ox; const dy = to[1] - targetTo[1] - oy; const dz = to[2] - targetTo[2] - oz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy + dz * dz;
  if (a <= 1e-18) return null;
  const b = ox * dx + oy * dy + oz * dz;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const fraction = (-b - Math.sqrt(discriminant)) / a;
  return fraction >= 0 && fraction <= 1 ? fraction : null;
}
