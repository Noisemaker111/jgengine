/**
 * Distance-driven footstep cadence. Pure state-in/state-out: feed it how far a mover
 * travelled this frame and it tells you how many steps landed, so foley stays locked to
 * ground distance instead of a wall-clock timer that desyncs when speed changes.
 */
export interface StepCadenceConfig {
  strideDistance: number;
  /**
   * Fraction of a stride the first step after standing still lands at, so walking off
   * from rest is heard immediately rather than half a stride later. Default 0.5.
   */
  firstStepFraction?: number;
}

export interface StepCadenceState {
  travelled: number;
  moving: boolean;
  /** Monotonic step counter; its parity is the left/right foot. */
  steps: number;
}

export interface StepCadenceInput {
  distance: number;
  /** False when the mover is airborne, downed, or otherwise not planting feet. */
  moving: boolean;
  strideScale?: number;
}

export interface StepCadenceResult {
  state: StepCadenceState;
  steps: number;
  foot: 0 | 1;
}

export function createStepCadenceState(): StepCadenceState {
  return { travelled: 0, moving: false, steps: 0 };
}

export function advanceStepCadence(
  state: StepCadenceState,
  input: StepCadenceInput,
  config: StepCadenceConfig,
): StepCadenceResult {
  const stride = Math.max(config.strideDistance * (input.strideScale ?? 1), Number.EPSILON);
  if (!input.moving) {
    return { state: { travelled: 0, moving: false, steps: state.steps }, steps: 0, foot: (state.steps % 2) as 0 | 1 };
  }

  const fromRest = !state.moving;
  const threshold = fromRest ? stride * (config.firstStepFraction ?? 0.5) : stride;
  let travelled = state.travelled + Math.max(0, input.distance);
  let steps = 0;
  let remaining = threshold;
  while (travelled >= remaining) {
    travelled -= remaining;
    steps += 1;
    remaining = stride;
  }

  return {
    state: { travelled, moving: true, steps: state.steps + steps },
    steps,
    foot: (state.steps % 2) as 0 | 1,
  };
}
