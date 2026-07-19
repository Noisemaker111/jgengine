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

/** @internal */
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

/** Analog movement vector (camera-relative, each axis in [-1, 1]) from a continuous source — a virtual joystick or gamepad stick. When present it replaces the digital WASD axes so a slight tilt walks slightly instead of slamming a full strafe. */
export interface AnalogMoveIntent {
  forward: number;
  right: number;
}

/** Below this deflection an analog stick reads as centered — filters sensor noise without eating small deliberate tilts (the shell applies its own radial deadzone before publishing). */
const ANALOG_MOVE_EPSILON = 0.02;

/**
 * Translate the set of held keys into an intent. When `canMove` is false (a
 * menu is open, the world is paused) the avatar is fully idle so it never
 * drifts behind an overlay. An `analog` vector (virtual joystick, gamepad
 * stick) replaces the digital WASD axes with its fractional deflection (#1370).
  * @internal
  */
export function resolveMovementIntent(
  keys: MovementKeysState,
  canMove: boolean,
  analog?: AnalogMoveIntent | null,
): MovementIntent {
  if (!canMove) return IDLE_INTENT;

  let forward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  let right = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  if (analog !== undefined && analog !== null) {
    forward = Math.abs(analog.forward) < ANALOG_MOVE_EPSILON ? 0 : Math.max(-1, Math.min(1, analog.forward));
    right = Math.abs(analog.right) < ANALOG_MOVE_EPSILON ? 0 : Math.max(-1, Math.min(1, analog.right));
  }
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
  /** Backward (S) travels this fraction of walk speed so retreating reads slower than advancing. */
  backpedalSpeedMultiplier: 0.65,
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

/**
 * Speed (units/s) the avatar should target given the active intent. Crouch and run
 * take precedence over backpedal; a plain backward intent (`forward < 0`) slows to
 * {@link MOVEMENT_TUNING.backpedalSpeedMultiplier} (overridable via `tuning`), while a
 * pure strafe keeps full speed.
 */
function resolveTargetSpeed(intent: MovementIntent, baseSpeed: number, tuning?: MovementTuningOverrides): number {
  const backpedal = tuning?.backpedalSpeedMultiplier ?? MOVEMENT_TUNING.backpedalSpeedMultiplier;
  const speedMultiplier = intent.crouching
    ? MOVEMENT_TUNING.crouchSpeedMultiplier
    : intent.running
      ? MOVEMENT_TUNING.runSpeedMultiplier
      : intent.forward < 0
        ? backpedal
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

/** @internal */
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
  /** Fraction of walk speed while backpedalling; overrides {@link MOVEMENT_TUNING.backpedalSpeedMultiplier}. */
  backpedalSpeedMultiplier?: number;
}

/**
 * Per-frame dynamic modifiers for {@link advancePlayerMotion} — state the caller
 * recomputes each tick (unlike the static {@link MovementTuningOverrides}). Omitted
 * fields leave the integrator at its default behavior.
 */
export interface MotionFrameOptions {
  /** Extra multiplier applied on top of the resolved target speed (e.g. swimming). Default 1. */
  speedScale?: number;
  /** Suppress gravity/jump integration and hold the avatar afloat this frame (e.g. swimming). Default false. */
  floating?: boolean;
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
  * @internal
  */
export function advancePlayerMotion(
  motion: PlayerMotionState,
  intent: MovementIntent,
  forwardX: number,
  forwardZ: number,
  baseSpeed: number,
  rawDeltaSeconds: number,
  tuning?: MovementTuningOverrides,
  options?: MotionFrameOptions,
): MovementFrameStep {
  const deltaSeconds = Math.min(rawDeltaSeconds, MOVEMENT_TUNING.maxFrameSeconds);
  const targetSpeed = resolveTargetSpeed(intent, baseSpeed, tuning) * (options?.speedScale ?? 1);
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
      // Analog sticks walk at their deflection: speed scales with the intent magnitude, capped at
      // 1 so digital diagonals (length √2) still normalize to exactly full speed.
      const length = Math.sqrt(lengthSq);
      const scale = (targetSpeed * Math.min(1, length)) / length;
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

  const floating = options?.floating === true;
  const jumpPressed = intent.jumping;
  if (jumpPressed && !motion.jumpHeld && motion.grounded && !intent.crouching && !floating) {
    motion.verticalVelocity = jumpVelocity;
    motion.grounded = false;
  }
  motion.jumpHeld = jumpPressed;

  if (floating) {
    motion.verticalVelocity = 0;
    motion.jumpOffset = 0;
    motion.grounded = true;
  } else if (!motion.grounded || motion.verticalVelocity > 0) {
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
  /** Box half-size on each axis. Default `[0.5, 0.5, 0.5]` (unit-box scene objects). Ignored when `boxes` is set. */
  halfExtents?: readonly [number, number, number];
  /** Local center shift added to `position` for the single-AABB path (the collider's yaw-rotated offset). Ignored when `boxes` is set. */
  offset?: readonly [number, number, number];
  /**
   * Optional compound solid: axis-aligned sub-boxes as `min`/`max` **relative to `position`** (add
   * `position` for world space), already yaw-rotated and conservatively expanded by the caller. When
   * present the capsule slides against EACH sub-box instead of the single `halfExtents` AABB, so a
   * concave opening (the gap between an archway's pillars/lintel) lets the capsule pass through.
   */
  boxes?: readonly { min: readonly [number, number, number]; max: readonly [number, number, number] }[];
}

const DEFAULT_OBSTACLE_HALF_EXTENTS: readonly [number, number, number] = [0.5, 0.5, 0.5];
/** @internal Player radius the walking obstruction inflates obstacles by; callers gather within reach of it. */
export const DEFAULT_OBSTACLE_PLAYER_RADIUS = 0.3;
/** Feet-to-head span used for the obstacle's vertical overlap test; matches DEFAULT_VOXEL_DIMS.height. */
const OBSTACLE_PLAYER_HEIGHT = 1.8;
/** Extra nudge past a solid face when depenetrating so the escaped capsule lands just outside, not on, the box. */
const PENETRATION_EPSILON = 1e-3;

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
  * @internal
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
  const considerBox = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
  ): void => {
    // Vertical-span cull: a sub-box entirely above the head (walk under the lintel) or below the feet is skipped.
    if (maxY <= feetY || minY >= headY) return;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const halfX = (maxX - minX) / 2;
    const halfZ = (maxZ - minZ) / 2;
    if (Math.abs(centerX - current[0]) > halfX + reachX || Math.abs(centerZ - current[2]) > halfZ + reachZ) return;
    nearby.push({
      minX: minX - playerRadius,
      maxX: maxX + playerRadius,
      minZ: minZ - playerRadius,
      maxZ: maxZ + playerRadius,
    });
  };
  for (const obstacle of obstacles) {
    const px = obstacle.position[0];
    const py = obstacle.position[1];
    const pz = obstacle.position[2];
    if (obstacle.boxes !== undefined && obstacle.boxes.length > 0) {
      for (const box of obstacle.boxes) {
        considerBox(px + box.min[0], px + box.max[0], py + box.min[1], py + box.max[1], pz + box.min[2], pz + box.max[2]);
      }
      continue;
    }
    const halfExtents = obstacle.halfExtents ?? DEFAULT_OBSTACLE_HALF_EXTENTS;
    const offset = obstacle.offset;
    const cx = px + (offset !== undefined ? offset[0] : 0);
    const cy = py + (offset !== undefined ? offset[1] : 0);
    const cz = pz + (offset !== undefined ? offset[2] : 0);
    considerBox(
      cx - halfExtents[0],
      cx + halfExtents[0],
      cy - halfExtents[1],
      cy + halfExtents[1],
      cz - halfExtents[2],
      cz + halfExtents[2],
    );
  }

  // Depenetration escape: axis-clamped sliding alone returns zero on BOTH axes once the capsule is
  // strictly inside a solid box (a prior frame wedged it into a corner, an object spawned overlapping
  // it, or a ground snap dropped it in), so the player locks up forever — "I collide and get stuck".
  // Boxes the capsule is inside are pushed out here along their shallowest face and excluded from the
  // slide below; resting exactly on a face (the clamp's natural stopping point) is not "inside", so
  // normal wall contact never triggers an escape and every existing slide case is unchanged.
  let escapeX = 0;
  let escapeZ = 0;
  const slideBoxes: ObstacleBounds[] = [];
  for (const box of nearby) {
    const insideX = current[0] > box.minX && current[0] < box.maxX;
    const insideZ = current[2] > box.minZ && current[2] < box.maxZ;
    if (!insideX || !insideZ) {
      slideBoxes.push(box);
      continue;
    }
    const toMinX = current[0] - box.minX;
    const toMaxX = box.maxX - current[0];
    const toMinZ = current[2] - box.minZ;
    const toMaxZ = box.maxZ - current[2];
    const minPen = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
    if (minPen === toMinX) escapeX = Math.min(escapeX, -(toMinX + PENETRATION_EPSILON));
    else if (minPen === toMaxX) escapeX = Math.max(escapeX, toMaxX + PENETRATION_EPSILON);
    else if (minPen === toMinZ) escapeZ = Math.min(escapeZ, -(toMinZ + PENETRATION_EPSILON));
    else escapeZ = Math.max(escapeZ, toMaxZ + PENETRATION_EPSILON);
  }

  let resultX = stepX;
  for (const box of slideBoxes) {
    if (current[2] <= box.minZ || current[2] >= box.maxZ) continue;
    resultX = clampAxisStep(current[0], resultX, box.minX, box.maxX);
  }

  const nextX = current[0] + resultX;
  let resultZ = stepZ;
  for (const box of slideBoxes) {
    if (nextX <= box.minX || nextX >= box.maxX) continue;
    resultZ = clampAxisStep(current[2], resultZ, box.minZ, box.maxZ);
  }

  return { stepX: resultX + escapeX, stepZ: resultZ + escapeZ };
}

const OBSTACLE_GATHER_RADIUS = 3;

/** Placed objects within `radius` (XZ) of `center`, as {@link CollisionObstacle}s to pre-filter for {@link resolveObstacleStep}.
 * @internal
 */
export function nearbyObstacles(
  objects: readonly { position: readonly [number, number, number] }[],
  center: readonly [number, number, number],
  radius: number = OBSTACLE_GATHER_RADIUS,
): CollisionObstacle[] {
  const radiusSq = radius * radius;
  const result: CollisionObstacle[] = [];
  for (const object of objects) {
    const dx = object.position[0] - center[0];
    const dz = object.position[2] - center[2];
    if (dx * dx + dz * dz <= radiusSq) result.push({ position: object.position });
  }
  return result;
}

/** Zeroes the off-axis component so travel is locked to a single world axis (`PlayerMovementConfig.mode: "axis"`).
 * @internal
 */
export function constrainStepToAxis(stepX: number, stepZ: number, axis: "x" | "z"): MovementFrameStep {
  return axis === "x" ? { stepX, stepZ: 0 } : { stepX: 0, stepZ };
}

/**
 * Snap a world position to its containing cell's center, matching the
 * bounds-free form of `navGrid`'s and `tacticalGrid`'s `floor` + half-cell
 * convention (`PlayerMovementConfig.mode: "grid"`).
  * @internal
  */
export function snapPositionToGrid(x: number, z: number, cellSize: number): [number, number] {
  return [(Math.floor(x / cellSize) + 0.5) * cellSize, (Math.floor(z / cellSize) + 0.5) * cellSize];
}

/** Peak jump height from MOVEMENT_TUNING.jumpVelocity + gravity, with small buffer. */
export const MAX_JUMP_OFFSET = 1.15;

/** Camera yaw looks along -Z; character mesh faces +Z at body rotation.y = 0.
 * @internal
 */
export function cameraYawToAvatarBodyYaw(cameraYaw: number): number {
  return cameraYaw + Math.PI;
}
