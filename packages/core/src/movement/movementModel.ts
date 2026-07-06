/**
 * Movement core (pure model).
 *
 * This module owns the raw key model, the pure translation from held keys
 * into a frame-independent {@link MovementIntent}, and the kinematics
 * integration. Keeping it framework-free means the kinematics controller,
 * the keyboard handler and the on-screen touch D-pad all speak the same
 * vocabulary, and the translation is unit testable without a renderer.
 * DOM capture, pointer lock, and the per-frame look channel live in
 * movementInput.ts.
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
  /** Height of the avatar's feet above the ground directly beneath it. */
  jumpOffset: number;
  /** Terrain height under the avatar last frame; drives ledge falls and ramp step-up. */
  groundHeight: number;
  grounded: boolean;
  jumpHeld: boolean;
}

export function createPlayerMotionState(): PlayerMotionState {
  return {
    horizontalVelocityX: 0,
    horizontalVelocityZ: 0,
    verticalVelocity: 0,
    jumpOffset: 0,
    groundHeight: 0,
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
  groundHeight = 0,
): MovementFrameStep {
  const deltaSeconds = Math.min(rawDeltaSeconds, MOVEMENT_TUNING.maxFrameSeconds);
  const targetSpeed = resolveTargetSpeed(intent, baseSpeed);

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

  const groundDrop = motion.groundHeight - groundHeight;
  motion.groundHeight = groundHeight;
  if (groundDrop > 0) {
    motion.jumpOffset += groundDrop;
    motion.grounded = false;
  } else if (groundDrop < 0) {
    motion.jumpOffset = Math.max(0, motion.jumpOffset + groundDrop);
  }

  const jumpPressed = intent.jumping;
  if (jumpPressed && !motion.jumpHeld && motion.grounded && !intent.crouching) {
    motion.verticalVelocity = MOVEMENT_TUNING.jumpVelocity;
    motion.grounded = false;
  }
  motion.jumpHeld = jumpPressed;

  if (!motion.grounded || motion.verticalVelocity > 0) {
    motion.verticalVelocity -= MOVEMENT_TUNING.gravityAcceleration * deltaSeconds;
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

/** Peak jump height from MOVEMENT_TUNING.jumpVelocity + gravity, with small buffer. */
export const MAX_JUMP_OFFSET = 1.15;

/** Camera yaw looks along -Z; character mesh faces +Z at body rotation.y = 0. */
export function cameraYawToAvatarBodyYaw(cameraYaw: number): number {
  return cameraYaw + Math.PI;
}
