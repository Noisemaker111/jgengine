import type { PhysicsWorld } from "./physicsWorld";

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
 * Marches the closed-form arc (constant gravity, straight lateral) through `world` and reports the
 * first sample inside any live body's AABB — sleeping bodies included — refined by one bisection
 * between the last clear sample and the hit sample. Returns `null` when the whole arc is clear.
 */
export function createBallisticSweep(world: PhysicsWorld, options: BallisticSweepOptions = {}): BallisticSweep {
  const step = options.step ?? DEFAULT_SWEEP_STEP;
  const radius = options.radius ?? 0;

  function overlapsAnyBody(x: number, y: number, z: number): boolean {
    for (let i = 0; i < world.highWater; i += 1) {
      if (!world.isAlive(i)) continue;
      if (Math.abs(x - world.posX[i]!) > world.halfX[i]! + radius) continue;
      if (Math.abs(y - world.posY[i]!) > world.halfY[i]! + radius) continue;
      if (Math.abs(z - world.posZ[i]!) > world.halfZ[i]! + radius) continue;
      return true;
    }
    return false;
  }

  return (origin, velocity, gravity, maxTime) => {
    const pointAt = (t: number): [number, number, number] => [
      origin[0] + velocity[0] * t,
      origin[1] + velocity[1] * t - 0.5 * gravity * t * t,
      origin[2] + velocity[2] * t,
    ];
    let lastClear = 0;
    let t = 0;
    for (;;) {
      const sample = pointAt(t);
      if (overlapsAnyBody(sample[0], sample[1], sample[2])) {
        if (t === 0) return { point: sample, time: 0 };
        const mid = (lastClear + t) / 2;
        const midSample = pointAt(mid);
        return overlapsAnyBody(midSample[0], midSample[1], midSample[2])
          ? { point: midSample, time: mid }
          : { point: sample, time: t };
      }
      if (t >= maxTime) return null;
      lastClear = t;
      t = Math.min(t + step, maxTime);
    }
  };
}
