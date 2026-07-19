import { resolveObstacleStep, type CollisionObstacle } from "../movement/movementModel";

/**
 * A single blocked-move event a car can react to (#1051): crash damage, screen shake, a metal-crunch
 * cue. Reported once, when a move is first vetoed, then consumed by {@link VehicleObstacleClamp.takeImpact}.
 */
export interface VehicleImpact {
  /** Speed (world units/s) the car was carrying *into* the obstacle at the moment the move was blocked. */
  closingSpeed: number;
  /** Unit push-back direction — points from the struck surface back toward the car. */
  normal: readonly [number, number];
  /** Index into the obstacle set passed for the blocking tick. */
  obstacleIndex: number;
}

/**
 * A planar move clamp for a kinematic car: feed {@link clampMove} to a vehicle's `clampMove` hook so
 * an attempted XZ displacement slides along world solids instead of driving through them, and read
 * {@link takeImpact} once per tick for the crash it produced.
 */
export interface VehicleObstacleClamp {
  /** Resolve an attempted `from`→`to` XZ move to the destination actually allowed (slide-along). */
  clampMove(from: readonly [number, number], to: readonly [number, number]): readonly [number, number];
  /** Impact recorded since last take, consumed on read (null when none). Closing speed is the velocity component into the obstacle at block time, units/s. */
  takeImpact(): VehicleImpact | null;
}

/** Matches the unit-box default {@link resolveObstacleStep} applies to obstacles without explicit extents. */
const DEFAULT_OBSTACLE_HALF_EXTENTS: readonly [number, number, number] = [0.5, 0.5, 0.5];
/** Default vehicle body radius (units) inflating obstacle footprints; a compact hatchback-ish disc. */
const DEFAULT_VEHICLE_RADIUS = 1.4;
/**
 * Y the car body is pinned to when handing solids to {@link resolveObstacleStep}. That stepper gates
 * each obstacle by a 1.8-tall pedestrian span around `current[1]`; centring every pre-filtered solid
 * on this value makes the gate always admit them, so collision is purely horizontal and the car hits
 * world solids at any ground elevation (bridges, hills) even though the clamp only knows XZ.
 */
const CAR_BODY_MID_Y = 0.9;
/** Below this the returned step is treated as unblocked (float-noise slack), so no phantom impacts fire. */
const BLOCK_EPSILON = 1e-6;

/**
 * Build a slide-along move clamp for a kinematic car (#1051). `obstacles` is sampled fresh each tick —
 * the caller hands back the already-filtered set of solids near the car — and `dt` supplies the current
 * tick length so a blocked move's lost displacement converts to a closing speed. `radius` inflates each
 * obstacle footprint by the car's body radius (default {@link DEFAULT_VEHICLE_RADIUS}).
 *
 * The slide itself is delegated to {@link resolveObstacleStep} so cars and pedestrians share one proven
 * axis-separated resolver: a shallow graze keeps its tangential run and only the into-wall component is
 * shed, a head-on zeroes forward progress. When any component is shed the largest such block this tick is
 * kept as a {@link VehicleImpact}; {@link VehicleObstacleClamp.takeImpact} returns and clears it so a hit
 * fires exactly once. The happy path (no solids near) is a zero-allocation passthrough returning `to`.
 */
export function createVehicleObstacleClamp(options: {
  /** Solids near the car this tick (already filtered to the relevant, solid set). */
  obstacles: () => readonly CollisionObstacle[];
  /** Vehicle body radius (units). Default {@link DEFAULT_VEHICLE_RADIUS}. */
  radius?: number;
  /** Current tick dt (seconds) — the divisor turning shed displacement into closing speed. */
  dt: () => number;
}): VehicleObstacleClamp {
  const radius = options.radius ?? DEFAULT_VEHICLE_RADIUS;
  // Grow-only scratch of Y-normalised solids, reused across ticks so a sustained crash allocates nothing
  // after warm-up. Per-clamp (closure-local) so concurrent cars never share it.
  const scratch: {
    position: [number, number, number];
    halfExtents?: readonly [number, number, number];
    offset?: readonly [number, number, number];
    boxes?: CollisionObstacle["boxes"];
  }[] = [];
  const offsetScratch: [number, number, number][] = [];
  let pending: VehicleImpact | null = null;

  function vehicleView(source: readonly CollisionObstacle[]): readonly CollisionObstacle[] {
    const n = source.length;
    for (let i = 0; i < n; i += 1) {
      let entry = scratch[i];
      if (entry === undefined) {
        entry = { position: [0, 0, 0] };
        scratch[i] = entry;
      }
      const from = source[i]!;
      entry.position[0] = from.position[0];
      entry.position[1] = CAR_BODY_MID_Y;
      entry.position[2] = from.position[2];
      entry.halfExtents = from.halfExtents;
      // Keep the collider's XZ offset (a fitted body centred away from the placement point) but zero
      // its Y: with the body pinned to CAR_BODY_MID_Y a vertical offset would push the box out of the
      // stepper's pedestrian-span gate and the car would drive through a tall building's collider.
      const fromOffset = from.offset;
      if (fromOffset !== undefined && (fromOffset[0] !== 0 || fromOffset[2] !== 0)) {
        let flat = offsetScratch[i];
        if (flat === undefined) {
          flat = [0, 0, 0];
          offsetScratch[i] = flat;
        }
        flat[0] = fromOffset[0];
        flat[2] = fromOffset[2];
        entry.offset = flat;
      } else {
        entry.offset = undefined;
      }
      entry.boxes = from.boxes;
    }
    if (scratch.length > n) scratch.length = n;
    return scratch;
  }

  /** Obstacle the attempted endpoint penetrates deepest (its inflated footprint), else nearest centre. */
  function blockingIndex(source: readonly CollisionObstacle[], tx: number, tz: number): number {
    let bestIndex = -1;
    let bestDepth = -Number.POSITIVE_INFINITY;
    let fallbackIndex = 0;
    let fallbackDistSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < source.length; i += 1) {
      const o = source[i]!;
      const half = o.halfExtents ?? DEFAULT_OBSTACLE_HALF_EXTENTS;
      const ex = half[0] + radius;
      const ez = half[2] + radius;
      const minX = o.position[0] - ex;
      const maxX = o.position[0] + ex;
      const minZ = o.position[2] - ez;
      const maxZ = o.position[2] + ez;
      if (tx > minX && tx < maxX && tz > minZ && tz < maxZ) {
        const depth = Math.min(tx - minX, maxX - tx, tz - minZ, maxZ - tz);
        if (depth > bestDepth) {
          bestDepth = depth;
          bestIndex = i;
        }
      }
      const dx = o.position[0] - tx;
      const dz = o.position[2] - tz;
      const distSq = dx * dx + dz * dz;
      if (distSq < fallbackDistSq) {
        fallbackDistSq = distSq;
        fallbackIndex = i;
      }
    }
    return bestIndex >= 0 ? bestIndex : fallbackIndex;
  }

  return {
    clampMove(from, to) {
      const obstacles = options.obstacles();
      if (obstacles.length === 0) return to;

      const attemptedX = to[0] - from[0];
      const attemptedZ = to[1] - from[1];
      const step = resolveObstacleStep([from[0], CAR_BODY_MID_Y, from[1]], attemptedX, attemptedZ, vehicleView(obstacles), radius);

      const blockedX = attemptedX - step.stepX;
      const blockedZ = attemptedZ - step.stepZ;
      if (blockedX === 0 && blockedZ === 0) return to;

      const blockedMag = Math.hypot(blockedX, blockedZ);
      if (blockedMag > BLOCK_EPSILON) {
        const dt = options.dt();
        const closingSpeed = dt > 0 ? blockedMag / dt : 0;
        if (pending === null || closingSpeed > pending.closingSpeed) {
          pending = {
            closingSpeed,
            normal: [-blockedX / blockedMag, -blockedZ / blockedMag],
            obstacleIndex: blockingIndex(obstacles, to[0], to[1]),
          };
        }
      }
      return [from[0] + step.stepX, from[1] + step.stepZ];
    },
    takeImpact() {
      const impact = pending;
      pending = null;
      return impact;
    },
  };
}
