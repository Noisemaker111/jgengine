/**
 * Seam for game code to reach the motion the shell's FrameDriver
 * otherwise owns privately (#162.4). Game code calls `impulse`,
 * `pushHorizontal`, `setVerticalVelocity`, and/or `setY` from `onTick` or
 * commands; the shell calls `takePending()` once per frame, before
 * integrating gravity, to drain what accumulated. `setY` wins over physics
 * for that frame; impulses add to the velocity the driver is about to
 * integrate; a later `setVerticalVelocity` replaces that velocity outright.
 * Horizontal pushes compose with the walk controller (#282.4): they add to
 * its horizontal velocity and decay naturally as it re-blends toward input —
 * knockback, dashes, explosion shoves without raw `setPose` offsets.
 *
 * Intentionally not `ctx.version()`/`ctx.subscribe` wired: these fire at
 * most once per frame and would otherwise storm subscribers with per-frame
 * churn (same rationale as `InputSnapshot.publish`).
 */
export interface MotionIntents {
  impulse(velocityY: number): void;
  pushHorizontal(velocityX: number, velocityZ: number): void;
  setVerticalVelocity(velocityY: number): void;
  setY(y: number): void;
  takePending(): MotionIntentBatch | null;
  snapshot(): MotionIntentBatch;
  hydrate(batch: MotionIntentBatch): void;
}

export interface MotionIntentBatch {
  impulses: readonly number[];
  horizontalImpulses: readonly (readonly [number, number])[];
  verticalVelocity: number | null;
  y: number | null;
}

/** @internal */
export function createMotionIntents(): MotionIntents {
  let impulses: number[] = [];
  let horizontalImpulses: (readonly [number, number])[] = [];
  let verticalVelocity: number | null = null;
  let y: number | null = null;

  return {
    impulse(velocityY) {
      impulses.push(velocityY);
    },
    pushHorizontal(velocityX, velocityZ) {
      horizontalImpulses.push([velocityX, velocityZ]);
    },
    setVerticalVelocity(velocityY) {
      verticalVelocity = velocityY;
    },
    setY(nextY) {
      y = nextY;
    },
    takePending() {
      if (impulses.length === 0 && horizontalImpulses.length === 0 && verticalVelocity === null && y === null) {
        return null;
      }
      const batch: MotionIntentBatch = { impulses, horizontalImpulses, verticalVelocity, y };
      impulses = [];
      horizontalImpulses = [];
      verticalVelocity = null;
      y = null;
      return batch;
    },
    snapshot() {
      return { impulses: [...impulses], horizontalImpulses: [...horizontalImpulses], verticalVelocity, y };
    },
    hydrate(batch) {
      impulses = [...batch.impulses];
      horizontalImpulses = batch.horizontalImpulses.map(([x, z]) => [x, z] as const);
      verticalVelocity = batch.verticalVelocity;
      y = batch.y;
    },
  };
}

/** @internal */
export function applyMotionImpulses(currentVelocity: number, batch: MotionIntentBatch | null): number {
  if (batch === null) return currentVelocity;
  let velocity = currentVelocity;
  for (const impulse of batch.impulses) velocity += impulse;
  if (batch.verticalVelocity !== null) velocity = batch.verticalVelocity;
  return velocity;
}

/** @internal */
export function applyHorizontalImpulses(
  velocityX: number,
  velocityZ: number,
  batch: MotionIntentBatch | null,
): readonly [number, number] {
  if (batch === null || batch.horizontalImpulses.length === 0) return [velocityX, velocityZ];
  let x = velocityX;
  let z = velocityZ;
  for (const [ix, iz] of batch.horizontalImpulses) {
    x += ix;
    z += iz;
  }
  return [x, z];
}
