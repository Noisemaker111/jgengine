/**
 * Seam for game code to reach the vertical motion the shell's FrameDriver
 * otherwise owns privately (#162.4). Game code calls `impulse`,
 * `setVerticalVelocity`, and/or `setY` from `onTick` or commands; the shell
 * calls `takePending()` once per frame, before integrating gravity, to drain
 * what accumulated. `setY` wins over physics for that frame; impulses add to
 * the vertical velocity the driver is about to integrate; a later
 * `setVerticalVelocity` replaces that velocity outright.
 *
 * Intentionally not `ctx.version()`/`ctx.subscribe` wired: these fire at
 * most once per frame and would otherwise storm subscribers with per-frame
 * churn (same rationale as `InputSnapshot.publish`).
 */
export interface MotionIntents {
  impulse(velocityY: number): void;
  setVerticalVelocity(velocityY: number): void;
  setY(y: number): void;
  takePending(): MotionIntentBatch | null;
}

export interface MotionIntentBatch {
  impulses: readonly number[];
  verticalVelocity: number | null;
  y: number | null;
}

export function createMotionIntents(): MotionIntents {
  let impulses: number[] = [];
  let verticalVelocity: number | null = null;
  let y: number | null = null;

  return {
    impulse(velocityY) {
      impulses.push(velocityY);
    },
    setVerticalVelocity(velocityY) {
      verticalVelocity = velocityY;
    },
    setY(nextY) {
      y = nextY;
    },
    takePending() {
      if (impulses.length === 0 && verticalVelocity === null && y === null) return null;
      const batch: MotionIntentBatch = { impulses, verticalVelocity, y };
      impulses = [];
      verticalVelocity = null;
      y = null;
      return batch;
    },
  };
}
