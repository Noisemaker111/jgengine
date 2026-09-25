import type { PhysicsConfig } from "../game/defineGame";
import type { PlayerMovementConfig } from "../game/playableGame";
import { createInputBuffer } from "../input/inputBuffer";
import {
  advancePlayerMotion,
  createEmptyMovementKeys,
  createPlayerMotionState,
  resolveMovementIntent,
  type MovementIntent,
  type MovementTuningOverrides,
  type PlayerMotionState,
} from "./movementModel";
import { resolvePlayerMovementTuning } from "./playerMovement";

/** The walk character {@link measureMovement} drives: the same fields a game passes to `defineGame`. */
export interface MovementProbeSubject {
  /** `defineGame({ movement })`; `feel` and `backpedalMult` shape the walk. */
  movement?: PlayerMovementConfig;
  /** `defineGame({ physics })`; `gravity` and `jumpVelocity` shape the jump. */
  physics?: PhysicsConfig;
  /** The player entity's `movement.walkSpeed` (default `2`, the controller default). */
  walkSpeed?: number;
}

/** Scenario settings for {@link measureMovement}; every field has a default. */
export interface MovementProbeOptions {
  /** Fixed tick, s (default `1/60`). */
  dt?: number;
  /** Measure with sprint held (default `false`). */
  sprint?: boolean;
  /** How long jump is held for `tapJumpHeight`, s (default `0.1`). */
  tapSeconds?: number;
}

/** Deterministic walk-feel metrics. `Infinity` means the target was never reached. */
export interface MovementReport {
  /** Steady ground speed holding forward, m/s. */
  topSpeed: number;
  /** Standing start until speed reaches 90% of `topSpeed`, s. */
  timeToTopSpeed: number;
  /** Distance slid after releasing input at `topSpeed`, until speed is under 0.05 m/s, m. */
  stopDistance: number;
  /** Seconds from releasing input at `topSpeed` until speed is under 0.05 m/s. */
  stopTime: number;
  /** Seconds from reversing direction at `topSpeed` until speed along the new heading reaches 90% of `topSpeed`. */
  turnAroundTime: number;
  /** Peak height of a held standing jump, m. */
  jumpHeight: number;
  /** Peak height of a standing jump released after `tapSeconds`, m. Lower than `jumpHeight` when `jumpCutFactor` is set. */
  tapJumpHeight: number;
  /** Seconds from takeoff to the jump's peak. */
  apexTime: number;
  /** Seconds from takeoff to landing. */
  airTime: number;
  /** Sideways distance covered by strafing from the first airborne tick of a standing jump until landing, m. */
  airControlReach: number;
}

const ARRIVED = 0.9;
const STOPPED = 0.05;
const SETTLE_SECONDS = 5;
const LIMIT_SECONDS = 10;

function held(keys: Partial<Record<"w" | "d" | "shift" | "space", boolean>>): MovementIntent {
  return resolveMovementIntent({ ...createEmptyMovementKeys(), ...keys }, true);
}

function speedOf(motion: PlayerMotionState): number {
  return Math.hypot(motion.horizontalVelocityX, motion.horizontalVelocityZ);
}

/**
 * Drives a walk character through fixed scenarios (standing start, release to stop, reversal, a standing
 * jump, a tapped jump, a strafed jump) on the same integrator `stepPlayerMovement` uses, and reports the feel metrics a
 * test can assert. Deterministic: the same subject and options always produce the same report, so a feel
 * change shows up as a number moving. Collision, terrain and swimming are out of scope; it measures flat ground.
 * @capability movement-metrics measure a walking character's feel as numbers — time to top speed, stop distance, jump height and apex, air control, turn-around
 */
export function measureMovement(subject: MovementProbeSubject = {}, options: MovementProbeOptions = {}): MovementReport {
  const dt = options.dt ?? 1 / 60;
  const sprint = options.sprint === true;
  const walkSpeed = subject.walkSpeed ?? 2;
  const tuning: MovementTuningOverrides | undefined = resolvePlayerMovementTuning({
    ...(subject.movement === undefined ? {} : { movement: subject.movement }),
    ...(subject.physics === undefined ? {} : { physics: subject.physics }),
  }).physics;
  const buffer = createInputBuffer({ windowMs: 0 });
  const step = (motion: PlayerMotionState, intent: MovementIntent, forwardZ = 1, forwardX = 0) =>
    advancePlayerMotion(motion, intent, forwardX, forwardZ, walkSpeed, dt, tuning, { buffer });
  const forward = held({ w: true, shift: sprint });
  const idle = held({});
  const ticks = (seconds: number) => Math.ceil(seconds / dt);

  const fresh = (): PlayerMotionState => {
    buffer.restore({ windowMs: 0, actions: {} });
    return createPlayerMotionState();
  };
  const settled = (): PlayerMotionState => {
    const motion = fresh();
    for (let i = 0; i < ticks(SETTLE_SECONDS); i += 1) step(motion, forward);
    return motion;
  };

  const topSpeed = speedOf(settled());

  let timeToTopSpeed = Number.POSITIVE_INFINITY;
  {
    const motion = fresh();
    for (let i = 1; i <= ticks(LIMIT_SECONDS); i += 1) {
      step(motion, forward);
      if (speedOf(motion) >= topSpeed * ARRIVED) {
        timeToTopSpeed = i * dt;
        break;
      }
    }
  }

  let stopDistance = Number.POSITIVE_INFINITY;
  let stopTime = Number.POSITIVE_INFINITY;
  {
    const motion = settled();
    let distance = 0;
    for (let i = 1; i <= ticks(LIMIT_SECONDS); i += 1) {
      const moved = step(motion, idle);
      distance += Math.hypot(moved.stepX, moved.stepZ);
      if (speedOf(motion) < STOPPED) {
        stopDistance = distance;
        stopTime = i * dt;
        break;
      }
    }
  }

  let turnAroundTime = Number.POSITIVE_INFINITY;
  {
    const motion = settled();
    for (let i = 1; i <= ticks(LIMIT_SECONDS); i += 1) {
      step(motion, forward, -1);
      if (-motion.horizontalVelocityZ >= topSpeed * ARRIVED) {
        turnAroundTime = i * dt;
        break;
      }
    }
  }

  const jump = (airborne: MovementIntent, releaseAfter = Number.POSITIVE_INFINITY) => {
    const motion = fresh();
    const takeoff = held({ space: true });
    const released = held({ d: airborne.right !== 0, shift: sprint });
    let height = 0;
    let apex = 0;
    let lateral = 0;
    let landed = Number.POSITIVE_INFINITY;
    for (let i = 1; i <= ticks(LIMIT_SECONDS); i += 1) {
      const moved = step(motion, i === 1 ? takeoff : i * dt > releaseAfter ? released : airborne);
      lateral += moved.stepX;
      if (motion.jumpOffset > height) {
        height = motion.jumpOffset;
        apex = i * dt;
      }
      if (motion.grounded && i > 1) {
        landed = i * dt;
        break;
      }
    }
    return { height, apex, lateral, landed };
  };

  const standing = jump(held({ space: true }));
  const strafed = jump(held({ space: true, d: true, shift: sprint }));
  const tapped = jump(held({ space: true }), options.tapSeconds ?? 0.1);

  return {
    topSpeed,
    timeToTopSpeed,
    stopDistance,
    stopTime,
    turnAroundTime,
    jumpHeight: standing.height,
    tapJumpHeight: tapped.height,
    apexTime: standing.apex,
    airTime: standing.landed,
    airControlReach: Math.abs(strafed.lateral),
  };
}
