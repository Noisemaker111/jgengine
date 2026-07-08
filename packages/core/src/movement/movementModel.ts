/**
 * Movement core (pure model).
 *
 * This module owns the raw key model, the pure translation from held keys
 * into a frame-independent {@link MovementIntent}, and the kinematics
 * integration. Keeping it framework-free means the kinematics controller,
 * the keyboard handler and the on-screen touch D-pad all speak the same
 * vocabulary, and the translation is unit testable without a renderer.
 * DOM capture lives in `@jgengine/shell`'s GamePlayerShell (keyboard and
 * touch controls) and its camera rigs (pointer lock, the per-frame look
 * channel).
 */

export type MovementKey = "w" | "a" | "s" | "d" | "shift" | "control" | "c" | "space";

export type MovementKeysState = Record<MovementKey, boolean>;

export function createEmptyMovementKeys(): MovementKeysState {
  return { w: false, a: false, s: false, d: false, shift: false, control: false, c: false, space: false };
}

/**
 * Frame-independent description of what the player is asking the avatar to do.
 * `forward`/`right` are in the range -1..1 in the avatar's local frame; the
 * controller rotates them into world space against the camera each frame.
 */
export interface MovementIntent {
  forward: number;
  right: number;
  crouching: boolean;
  running: boolean;
  jumping: boolean;
  /** True when there is any directional input this frame. */
  moving: boolean;
}

const IDLE_INTENT: MovementIntent = {
  forward: 0,
  right: 0,
  crouching: false,
  running: false,
  jumping: false,
  moving: false,
};

/**
 * Translate the set of held keys into an intent. When `canMove` is false (a
 * menu is open, the world is paused) the avatar is fully idle so it never
 * drifts behind an overlay.
 */
export function resolveMovementIntent(keys: MovementKeysState, canMove: boolean): MovementIntent {
  if (!canMove) return IDLE_INTENT;

  const forward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  const right = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  const crouching = keys.control || keys.c;
  const running = keys.shift && !crouching;

  return {
    forward,
    right,
    crouching,
    running,
    jumping: keys.space,
    moving: forward !== 0 || right !== 0,
  };
}

/**
 * Kinematics + feel tuning for the first-person controller. Centralised here so
 * movement feel lives in one place rather than scattered through the renderer.
 */
export const MOVEMENT_TUNING = {
  standEyeHeight: 1.7,
  crouchEyeHeight: 1.15,
  walkSpeedMultiplier: 1.75,
  runSpeedMultiplier: 2.25,
  crouchSpeedMultiplier: 0.45,
  groundAcceleration: 26,
  airAcceleration: 12,
  groundFriction: 18,
  jumpVelocity: 7.1,
  gravityAcceleration: 24,
  cameraTrackingSpeed: 24,
  crouchTransitionSpeed: 14,
  crouchBobRate: 0.5,
  walkBobRate: 1.5,
  runBobRate: 2.5,
  crouchBobAmplitude: 0.02,
  walkBobAmplitude: 0.045,
  runBobAmplitude: 0.06,
  /** Below this horizontal speed the avatar is treated as standing still. */
  movingSpeedThreshold: 0.2,
  /** Largest physics step we integrate so a stalled tab can't teleport the player. */
  maxFrameSeconds: 0.05,
} as const;

/** Speed (units/s) the avatar should target given the active intent. */
function resolveTargetSpeed(intent: MovementIntent, baseSpeed: number): number {
  const speedMultiplier = intent.crouching
    ? MOVEMENT_TUNING.crouchSpeedMultiplier
    : intent.running
      ? MOVEMENT_TUNING.runSpeedMultiplier
      : 1;
  return baseSpeed * MOVEMENT_TUNING.walkSpeedMultiplier * speedMultiplier;
}

/**
 * Mutable kinematic state carried between frames by the controller. Kept here so
 * the velocity / jump / gravity integration is a pure function testable without
 * a renderer — the controller just owns the ref.
 */
export interface PlayerMotionState {
  horizontalVelocityX: number;
  horizontalVelocityZ: number;
  verticalVelocity: number;
  jumpOffset: number;
  grounded: boolean;
  jumpHeld: boolean;
}

export function createPlayerMotionState(): PlayerMotionState {
  return {
    horizontalVelocityX: 0,
    horizontalVelocityZ: 0,
    verticalVelocity: 0,
    jumpOffset: 0,
    grounded: true,
    jumpHeld: false,
  };
}

/** Horizontal step (world units) the avatar should commit this frame. */
export interface MovementFrameStep {
  stepX: number;
  stepZ: number;
}

/**
 * Per-game overrides for the gravity/jump feel, sourced from
 * `GameDefinition.physics`. Omitted fields fall back to {@link MOVEMENT_TUNING}.
 */
export interface MovementTuningOverrides {
  gravityAcceleration?: number;
  jumpVelocity?: number;
}

/**
 * Advance one frame of avatar kinematics. Mutates `motion` (velocity, jump,
 * gravity, grounded) and returns the horizontal step to commit through the
 * collision-resolving stepper.
 *
 * `forwardX`/`forwardZ` are the camera heading projected onto the ground plane
 * (need not be normalized); the avatar's right axis is derived from it. Pulling
 * this out of the render loop is what lets us assert "held forward for N frames
 * crosses the room" in a unit test instead of only in the live game.
 */
export function advancePlayerMotion(
  motion: PlayerMotionState,
  intent: MovementIntent,
  forwardX: number,
  forwardZ: number,
  baseSpeed: number,
  rawDeltaSeconds: number,
  tuning?: MovementTuningOverrides,
): MovementFrameStep {
  const deltaSeconds = Math.min(rawDeltaSeconds, MOVEMENT_TUNING.maxFrameSeconds);
  const targetSpeed = resolveTargetSpeed(intent, baseSpeed);
  const gravityAcceleration = tuning?.gravityAcceleration ?? MOVEMENT_TUNING.gravityAcceleration;
  const jumpVelocity = tuning?.jumpVelocity ?? MOVEMENT_TUNING.jumpVelocity;

  let targetVelocityX = 0;
  let targetVelocityZ = 0;
  if (intent.moving) {
    // Project the camera heading onto the ground and fall back to -Z if the
    // player is looking straight up/down so "forward" is always well defined.
    let fx = forwardX;
    let fz = forwardZ;
    const forwardLengthSq = fx * fx + fz * fz;
    if (forwardLengthSq < 1e-6) {
      fx = 0;
      fz = -1;
    } else {
      const inv = 1 / Math.sqrt(forwardLengthSq);
      fx *= inv;
      fz *= inv;
    }
    // right = forward × up, with up = (0, 1, 0) → (-fz, 0, fx); unit when forward is.
    const rightX = -fz;
    const rightZ = fx;
    targetVelocityX = fx * intent.forward + rightX * intent.right;
    targetVelocityZ = fz * intent.forward + rightZ * intent.right;
    const lengthSq = targetVelocityX * targetVelocityX + targetVelocityZ * targetVelocityZ;
    if (lengthSq > 1e-6) {
      const scale = targetSpeed / Math.sqrt(lengthSq);
      targetVelocityX *= scale;
      targetVelocityZ *= scale;
    } else {
      targetVelocityX = 0;
      targetVelocityZ = 0;
    }
  }

  const acceleration = motion.grounded ? MOVEMENT_TUNING.groundAcceleration : MOVEMENT_TUNING.airAcceleration;
  const accelerationBlend = 1 - Math.exp(-acceleration * deltaSeconds);
  motion.horizontalVelocityX += (targetVelocityX - motion.horizontalVelocityX) * accelerationBlend;
  motion.horizontalVelocityZ += (targetVelocityZ - motion.horizontalVelocityZ) * accelerationBlend;

  if (!intent.moving && motion.grounded) {
    const friction = Math.exp(-MOVEMENT_TUNING.groundFriction * deltaSeconds);
    motion.horizontalVelocityX *= friction;
    motion.horizontalVelocityZ *= friction;
  }

  const jumpPressed = intent.jumping;
  if (jumpPressed && !motion.jumpHeld && motion.grounded && !intent.crouching) {
    motion.verticalVelocity = jumpVelocity;
    motion.grounded = false;
  }
  motion.jumpHeld = jumpPressed;

  if (!motion.grounded || motion.verticalVelocity > 0) {
    motion.verticalVelocity -= gravityAcceleration * deltaSeconds;
    motion.jumpOffset += motion.verticalVelocity * deltaSeconds;
    if (motion.jumpOffset <= 0) {
      motion.jumpOffset = 0;
      motion.verticalVelocity = 0;
      motion.grounded = true;
    }
  }

  return {
    stepX: motion.horizontalVelocityX * deltaSeconds,
    stepZ: motion.horizontalVelocityZ * deltaSeconds,
  };
}

/** A placed scene object the walking player collides against as a circle-vs-AABB obstacle. */
export interface CollisionObstacle {
  position: readonly [number, number, number];
  /** Box half-size on each axis. Default `[0.5, 0.5, 0.5]` (unit-box scene objects). */
  halfExtents?: readonly [number, number, number];
}

const DEFAULT_OBSTACLE_HALF_EXTENTS: readonly [number, number, number] = [0.5, 0.5, 0.5];
const DEFAULT_OBSTACLE_PLAYER_RADIUS = 0.3;
/** Feet-to-head span used for the obstacle's vertical overlap test; matches DEFAULT_VOXEL_DIMS.height. */
const OBSTACLE_PLAYER_HEIGHT = 1.8;

interface ObstacleBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function clampAxisStep(originalCoord: number, step: number, min: number, max: number): number {
  if (step === 0) return 0;
  const target = originalCoord + step;
  if (target <= min || target >= max) return step;
  if (step > 0) return originalCoord <= min ? min - originalCoord : 0;
  return originalCoord >= max ? max - originalCoord : 0;
}

/**
 * Resolve a horizontal step against nearby placed objects with classic
 * axis-separated sliding (try X, then Z against the post-X position) so
 * walking into a wall stops the blocked axis but keeps sliding along the
 * other. Obstacles are treated as circle-vs-AABB in the X/Z plane, inflated
 * by `playerRadius`; an obstacle whose vertical span misses the player's
 * feet-to-head span is skipped entirely. Callers should pre-filter to nearby
 * objects — this also early-exits per obstacle on horizontal distance.
 */
export function resolveObstacleStep(
  current: readonly [number, number, number],
  stepX: number,
  stepZ: number,
  obstacles: readonly CollisionObstacle[],
  playerRadius: number = DEFAULT_OBSTACLE_PLAYER_RADIUS,
): MovementFrameStep {
  const feetY = current[1];
  const headY = feetY + OBSTACLE_PLAYER_HEIGHT;
  const reachX = Math.abs(stepX) + playerRadius;
  const reachZ = Math.abs(stepZ) + playerRadius;

  const nearby: ObstacleBounds[] = [];
  for (const obstacle of obstacles) {
    const halfExtents = obstacle.halfExtents ?? DEFAULT_OBSTACLE_HALF_EXTENTS;
    const obstacleBottom = obstacle.position[1] - halfExtents[1];
    const obstacleTop = obstacle.position[1] + halfExtents[1];
    if (obstacleTop <= feetY || obstacleBottom >= headY) continue;

    const dx = obstacle.position[0] - current[0];
    const dz = obstacle.position[2] - current[2];
    if (Math.abs(dx) > halfExtents[0] + reachX || Math.abs(dz) > halfExtents[2] + reachZ) continue;

    nearby.push({
      minX: obstacle.position[0] - halfExtents[0] - playerRadius,
      maxX: obstacle.position[0] + halfExtents[0] + playerRadius,
      minZ: obstacle.position[2] - halfExtents[2] - playerRadius,
      maxZ: obstacle.position[2] + halfExtents[2] + playerRadius,
    });
  }

  let resultX = stepX;
  for (const box of nearby) {
    if (current[2] <= box.minZ || current[2] >= box.maxZ) continue;
    resultX = clampAxisStep(current[0], resultX, box.minX, box.maxX);
  }

  const nextX = current[0] + resultX;
  let resultZ = stepZ;
  for (const box of nearby) {
    if (nextX <= box.minX || nextX >= box.maxX) continue;
    resultZ = clampAxisStep(current[2], resultZ, box.minZ, box.maxZ);
  }

  return { stepX: resultX, stepZ: resultZ };
}

/** Zeroes the off-axis component so travel is locked to a single world axis (`PlayerMovementConfig.mode: "axis"`). */
export function constrainStepToAxis(stepX: number, stepZ: number, axis: "x" | "z"): MovementFrameStep {
  return axis === "x" ? { stepX, stepZ: 0 } : { stepX: 0, stepZ };
}

/**
 * Snap a world position to its containing cell's center, matching the
 * bounds-free form of `navGrid`'s and `tacticalGrid`'s `floor` + half-cell
 * convention (`PlayerMovementConfig.mode: "grid"`).
 */
export function snapPositionToGrid(x: number, z: number, cellSize: number): [number, number] {
  return [(Math.floor(x / cellSize) + 0.5) * cellSize, (Math.floor(z / cellSize) + 0.5) * cellSize];
}

/** Peak jump height from MOVEMENT_TUNING.jumpVelocity + gravity, with small buffer. */
export const MAX_JUMP_OFFSET = 1.15;

/** Camera yaw looks along -Z; character mesh faces +Z at body rotation.y = 0. */
export function cameraYawToAvatarBodyYaw(cameraYaw: number): number {
  return cameraYaw + Math.PI;
}
