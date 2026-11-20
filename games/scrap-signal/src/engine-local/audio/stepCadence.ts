/**
 * Distance-driven footstep cadence. Pure state-in/state-out: feed it how far a mover
 * travelled this frame and it tells you how many steps landed, so foley stays locked to
 * ground distance instead of a wall-clock timer that desyncs when speed changes.
 */
export interface StepCadenceConfig {
  /** World units travelled per step at `strideScale` 1. */
  strideDistance: number;
  /**
   * Fraction of a stride the first step after standing still lands at, so walking off
   * from rest is heard immediately rather than half a stride later. Default 0.5.
   */
  firstStepFraction?: number;
}

/** Cadence bookkeeping between advances — banked distance, last moving state, and the step count whose parity is the foot. */
export interface StepCadenceState {
  /** Distance banked toward the next step. */
  travelled: number;
  /** Whether the mover was moving last advance — drives the from-rest first step. */
  moving: boolean;
  /** Monotonic step counter; its parity is the left/right foot. */
  steps: number;
}

/** What the mover did this advance: ground distance covered, whether feet are planting, and the stride multiplier. */
export interface StepCadenceInput {
  /** Ground distance covered since the last advance, in world units. */
  distance: number;
  /** False when the mover is airborne, downed, or otherwise not planting feet. */
  moving: boolean;
  /** Multiplies `strideDistance` — crouch shortens it, sprint lengthens it. Default 1. */
  strideScale?: number;
}

/** Outcome of one advance: the next state plus how many steps landed and which foot led. */
export interface StepCadenceResult {
  state: StepCadenceState;
  /** Steps that landed this advance — 0 or 1 normally, more only on a very long frame. */
  steps: number;
  /** Parity of the first step landed this advance: 0 = left, 1 = right. */
  foot: 0 | 1;
}

/** Fresh cadence state for a mover that is standing still. */
export function createStepCadenceState(): StepCadenceState {
  return { travelled: 0, moving: false, steps: 0 };
}

/**
 * Bank this advance's distance and report the steps it completed. Pure — same state and input
 * always give the same result, so footstep timing is testable headless and replays identically.
 */
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
