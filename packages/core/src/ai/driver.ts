import type { AxisInput } from "../input/axisInput";
import { executionError, type DifficultyProfile } from "./difficulty";

/**
 * A difficulty-aware driver brain: pose + goal in, the shared {@link AxisInput}
 * (`throttle`/`brake`/`steer`/`handbrake`) out, ready for `tickDrivableVehicle` — the chase/traffic
 * steering loop every game with AI cars hand-rolls as `steer = error * k, throttle = 1`. A
 * {@link DifficultyProfile} decides how *well* it drives: reaction time trails the target, corners
 * shed speed instead of orbiting at full throttle, obstacles are noticed late on low tiers, the
 * wheel wobbles by `executionJitter`, and a stuck car backs out with counter-steer after grinding
 * for a tier-scaled while. State is one small serializable object; randomness is injected; every
 * step is allocation-light scalar math. The caller owns the sim, collision, and all spatial
 * queries — this module never scans the world.
 */

/** The driver's own vehicle this step: world position, yaw heading, signed forward speed. */
export interface DriverPose {
  x: number;
  z: number;
  /** Yaw with the same convention as the kinematic vehicle sim: `atan2(dx, dz)`. */
  heading: number;
  /** Signed forward speed in world units/second (negative while reversing). */
  speed: number;
}

/** Where the driver is trying to go this step. */
export interface DriverGoal {
  x: number;
  z: number;
  /** Brake to a halt inside `arriveRadius` instead of driving through; default `false`. */
  stopAtGoal?: boolean;
  /** Cap on desired speed for this goal (a speed limit, a formation speed); default unlimited. */
  speedLimit?: number;
}

/** Vehicle-feel numbers the game supplies; everything has a sensible default except `maxSpeed`. */
export interface DriverTuning {
  /** Top desired speed on a straight, world units/second. */
  maxSpeed: number;
  /** Steering-output gain per radian of heading error; default `2`. */
  steerGain?: number;
  /** Fraction of speed shed at a right-angle heading error (`0` never slows for corners); default `0.75`. */
  cornerSlowdown?: number;
  /** Distance at which the goal counts as reached; default `4`. */
  arriveRadius?: number;
  /** Meters of clearance the driver tries to keep to an obstacle ahead; default `6`. */
  brakeMargin?: number;
  /** Seconds between steering-jitter resamples, so low tiers wobble instead of noise-shake; default `0.35`. */
  jitterIntervalSeconds?: number;
  /** Heading-error radians one full unit of `executionJitter` adds; default `0.35`. */
  jitterScaleRadians?: number;
  /** Below this |speed| while throttling the car counts as stuck; default `0.8`. */
  stuckSpeed?: number;
  /** Seconds of grinding (plus the profile's `reactionSeconds`) before reversing out; default `1.5`. */
  stuckSeconds?: number;
  /** How long a reverse-out lasts; default `1.1`. */
  reverseSeconds?: number;
}

/** Serializable per-driver state advanced in place by {@link driveStep}. */
export interface DriverState {
  /** The reaction-committed target actually steered toward (the goal as of up to `reactionSeconds` ago). */
  targetX: number;
  targetZ: number;
  /** Seconds until the next target resample. */
  sampleCooldown: number;
  /** Current steering-wobble offset (radians of heading error) and time until its next resample. */
  jitter: number;
  jitterCooldown: number;
  /** Seconds spent throttling without moving. */
  grindSeconds: number;
  /** Seconds of reverse-out remaining; `> 0` means currently backing up. */
  reverseRemaining: number;
}

/**
 * Fresh driver state committed to an initial target (usually the spawn-time goal or the spawn
 * position itself).
 *
 * @capability ai-driver-state fresh serializable state for one difficulty-aware AI driver
 */
export function createDriverState(targetX = 0, targetZ = 0): DriverState {
  return {
    targetX,
    targetZ,
    sampleCooldown: 0,
    jitter: 0,
    jitterCooldown: 0,
    grindSeconds: 0,
    reverseRemaining: 0,
  };
}

/** {@link driveStep}'s result: the axis sample to feed the vehicle sim, plus arrival. */
export interface DriverStep extends AxisInput {
  /** The vehicle is inside `arriveRadius` of the *actual* goal this step. */
  arrived: boolean;
}

const wrapAngle = (angle: number): number => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Advance one driving step, mutating `state`, and return the {@link AxisInput} to feed the vehicle
 * sim. `obstacleAhead` is the caller-measured distance to the nearest blocker in the driving
 * corridor this step (`null`/omitted when clear) — the driver perceives it late by
 * `speed * reactionSeconds`, so easy tiers brake at the last moment and expert tiers with proper
 * margin. The steering target is a delay-line over the goal — resampled every `reactionSeconds`,
 * so it trails a moving goal by up to that long, which is what makes an easy chaser visibly cut
 * toward where the target *was*. When throttle produces no motion for a tier-scaled while the
 * driver reverses out with counter-steer (brake past standstill — the shared sim's reverse).
 *
 * @capability ai-driver difficulty-aware chase/route driving step producing throttle/brake/steer for the vehicle sim
 */
export function driveStep(
  state: DriverState,
  dt: number,
  pose: DriverPose,
  goal: DriverGoal,
  profile: DifficultyProfile,
  tuning: DriverTuning,
  rng: () => number,
  obstacleAhead: number | null = null,
): DriverStep {
  const arriveRadius = tuning.arriveRadius ?? 4;

  // Delay-line target: resample the live goal every reactionSeconds, so the steering target is
  // the goal as of up to that long ago and a moving goal is chased where it *was*.
  state.sampleCooldown -= dt;
  if (state.sampleCooldown <= 0) {
    state.targetX = goal.x;
    state.targetZ = goal.z;
    state.sampleCooldown = profile.reactionSeconds;
  }

  const goalDistance = Math.hypot(goal.x - pose.x, goal.z - pose.z);
  const arrived = goalDistance <= arriveRadius;
  if (arrived && goal.stopAtGoal === true) {
    state.grindSeconds = 0;
    state.reverseRemaining = 0;
    return { throttle: 0, brake: clamp01(Math.abs(pose.speed)), steer: 0, handbrake: 0, arrived };
  }

  const dx = state.targetX - pose.x;
  const dz = state.targetZ - pose.z;
  const headingError = wrapAngle(Math.atan2(dx, dz) - pose.heading);

  // Steering wobble: resample on an interval so it reads as a loose wheel, not per-frame noise.
  state.jitterCooldown -= dt;
  if (state.jitterCooldown <= 0) {
    state.jitter = executionError(profile, rng, tuning.jitterScaleRadians ?? 0.35);
    state.jitterCooldown = tuning.jitterIntervalSeconds ?? 0.35;
  }

  // Reverse-out recovery: back up with counter-steer, nose swinging toward the target.
  if (state.reverseRemaining > 0) {
    state.reverseRemaining -= dt;
    const steer = headingError >= 0 ? -1 : 1;
    return { throttle: 0, brake: 1, steer, handbrake: 0, arrived };
  }

  const steerGain = tuning.steerGain ?? 2;
  const steer = Math.max(-1, Math.min(1, (headingError + state.jitter) * steerGain));

  // Corner-aware desired speed: shed speed into large heading errors instead of orbiting.
  const cornerSlowdown = tuning.cornerSlowdown ?? 0.75;
  const cornerFactor = 1 - cornerSlowdown * Math.min(1, Math.abs(headingError) / (Math.PI / 2));
  let desiredSpeed = Math.min(tuning.maxSpeed, goal.speedLimit ?? Number.POSITIVE_INFINITY);
  desiredSpeed *= cornerFactor;
  if (goal.stopAtGoal === true) {
    // Ease in over the last stretch so the stop lands inside the radius instead of overshooting.
    desiredSpeed = Math.min(desiredSpeed, Math.max(2, goalDistance - arriveRadius));
  }

  // Obstacle response on perceived (reaction-late) distance.
  let hardBrake = false;
  if (obstacleAhead !== null && pose.speed > 0) {
    const brakeMargin = tuning.brakeMargin ?? 6;
    const perceived = obstacleAhead - pose.speed * profile.reactionSeconds;
    if (perceived <= brakeMargin) hardBrake = true;
    else if (perceived <= brakeMargin + pose.speed * 0.9) desiredSpeed = Math.min(desiredSpeed, pose.speed * 0.5);
  }

  let throttle = 0;
  let brake = 0;
  if (hardBrake) {
    brake = 1;
  } else if (pose.speed > desiredSpeed + 1) {
    brake = clamp01((pose.speed - desiredSpeed) / Math.max(4, desiredSpeed));
  } else if (pose.speed < desiredSpeed) {
    throttle = clamp01((desiredSpeed - pose.speed) / 3);
  }

  // Stuck detection: throttling but not moving (wall, prop, another car).
  const stuckSpeed = tuning.stuckSpeed ?? 0.8;
  if (throttle > 0.3 && Math.abs(pose.speed) < stuckSpeed) {
    state.grindSeconds += dt;
    if (state.grindSeconds >= (tuning.stuckSeconds ?? 1.5) + profile.reactionSeconds) {
      state.grindSeconds = 0;
      state.reverseRemaining = tuning.reverseSeconds ?? 1.1;
    }
  } else {
    state.grindSeconds = 0;
  }

  return { throttle, brake, steer, handbrake: 0, arrived };
}

/** A 2D polyline point (`[x, z]`), structurally compatible with authored road path centerlines. */
export type DrivePathPoint = readonly [number, number];

/**
 * The pure-pursuit target for street/route following: the point `lookahead` meters further along
 * the polyline from wherever the vehicle currently projects onto it. Feed the result to
 * {@link driveStep} as the goal each tick and the driver follows the road; `loop` wraps a circuit
 * (traffic block, race lap) instead of pinning at the final point. Returns `null` for a
 * degenerate path. Give sharper tiers a longer `lookahead` to cut corners cleanly and duller
 * tiers a short one so they steer segment-to-segment.
 *
 * @capability ai-driver-path-target pure-pursuit lookahead target on a road/route polyline for street following
 */
export function pathTargetAhead(
  path: readonly DrivePathPoint[],
  x: number,
  z: number,
  lookahead: number,
  loop = false,
): DrivePathPoint | null {
  if (path.length < 2) return null;

  let bestDistSq = Number.POSITIVE_INFINITY;
  let bestSegment = 0;
  let bestT = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const lengthSq = abx * abx + abz * abz;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lengthSq));
    const px = a[0] + abx * t;
    const pz = a[1] + abz * t;
    const distSq = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestSegment = i;
      bestT = t;
    }
  }

  let remaining = lookahead;
  let segment = bestSegment;
  let t = bestT;
  for (let hops = 0; hops <= path.length * 2; hops += 1) {
    const a = path[segment]!;
    const b = path[segment + 1]!;
    const segLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const left = segLength * (1 - t);
    if (remaining <= left || segLength === 0) {
      const nt = segLength === 0 ? t : t + remaining / segLength;
      return [a[0] + (b[0] - a[0]) * nt, a[1] + (b[1] - a[1]) * nt];
    }
    remaining -= left;
    t = 0;
    if (segment + 1 < path.length - 1) {
      segment += 1;
    } else if (loop) {
      segment = 0;
    } else {
      return [b[0], b[1]];
    }
  }
  return [path[path.length - 1]![0], path[path.length - 1]![1]];
}
