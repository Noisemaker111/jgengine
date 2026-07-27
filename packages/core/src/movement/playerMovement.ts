import type { PhysicsConfig } from "../game/defineGame";
import type { MovementCommitFrame, PlayerMovementConfig, VoxelCollisionConfig } from "../game/playableGame";
import type { GameContext } from "../runtime/gameContext";
import type { InputFrame } from "../runtime/inputSnapshot";
import { applyHorizontalImpulses, applyMotionImpulses } from "../runtime/motionIntents";
import { groundFieldFor, hasEnvironmentTerrain, sampleSlope, type TerrainField } from "../world/terrain";
import type { WorldFeature } from "../world/features";
import type { EntityPosition } from "../scene/entityStore";
import {
  advancePlayerMotion,
  constrainStepToAxis,
  createEmptyMovementKeys,
  createPlayerMotionState,
  DEFAULT_OBSTACLE_PLAYER_RADIUS,
  obstacleSupportHeight,
  resolveMovementIntent,
  resolveObstacleStep,
  snapPositionToGrid,
  type CollisionObstacle,
  type MotionFrameOptions,
  type MovementTuningOverrides,
  type PlayerMotionState,
} from "./movementModel";
import { solidObstaclesNear } from "./solidObstacles";
import { approachYaw, steerYaw } from "./steering";
import {
  advanceVoxelPlayer,
  createVoxelPlayerBody,
  type VoxelPlayerBody,
  type VoxelPlayerDims,
} from "./voxelController";

const DEFAULT_TURN_SPEED = 2.4;
const DEFAULT_WALK_SPEED = 2;
const DEFAULT_SWIM_SPEED_MULTIPLIER = 0.65;
/** Minimum ground-normal `y` the player can stand on before slope-slide kicks in — cos(50°) ≈ 0.643. */
const DEFAULT_MAX_CLIMB_NORMAL_Y = Math.cos((50 * Math.PI) / 180);
/** Downhill slide speed (units/s) per unit of slope steepness while on too-steep ground. */
const SLOPE_SLIDE_SPEED = 4;
/** Tallest object ledge walked up (and largest ground drop still snapped down) without jumping/falling. */
const DEFAULT_PLAYER_STEP_HEIGHT = 0.4;

/** The resolved, per-world movement configuration {@link stepPlayerMovement} integrates against — the same inputs the shell FrameDriver used to read piecemeal, gathered into one struct so single-player and host movement run identical math. */
export interface PlayerMovementTuning {
  collision?: VoxelCollisionConfig;
  movement?: PlayerMovementConfig;
  physics?: MovementTuningOverrides;
  ground: TerrainField;
  hasTerrain: boolean;
}

/**
 * Maps a game's declared `physics` onto the movement controllers' tuning. `PhysicsConfig.gravity` is a signed
 * world acceleration (negative points down), but the controllers integrate `velocityY -= gravityAcceleration * dt`
 * and expect a positive downward magnitude — so gravity is negated here to keep down-pointing gravity pulling down.
 */
export function resolvePhysicsTuning(physics: PhysicsConfig | undefined): MovementTuningOverrides | undefined {
  if (physics === undefined) return undefined;
  return {
    get gravityAcceleration() {
      return physics.gravity === undefined ? undefined : -physics.gravity;
    },
    get jumpVelocity() {
      return physics.jumpVelocity;
    },
  };
}

/** Gather a game's collision/movement/physics/world config into a {@link PlayerMovementTuning} — call once per world; both the shell and a host pass the result to {@link stepPlayerMovement}. */
export function resolvePlayerMovementTuning(opts: {
  collision?: VoxelCollisionConfig;
  movement?: PlayerMovementConfig;
  physics?: PhysicsConfig;
  world?: WorldFeature;
}): PlayerMovementTuning {
  const physics = resolvePhysicsTuning(opts.physics);
  const backpedal = opts.movement?.backpedalMult;
  const overrides =
    backpedal === undefined ? physics : { ...(physics ?? {}), backpedalSpeedMultiplier: backpedal };
  return {
    ...(opts.collision === undefined ? {} : { collision: opts.collision }),
    ...(opts.movement === undefined ? {} : { movement: opts.movement }),
    ...(overrides === undefined ? {} : { physics: overrides }),
    ground: groundFieldFor(opts.world),
    hasTerrain: hasEnvironmentTerrain(opts.world),
  };
}

interface PlayerMovementState {
  heading: number;
  facing: number | null;
  voxelBody: VoxelPlayerBody | null;
  motion: PlayerMotionState | null;
}

interface CtxMovementStore {
  players: Map<string, PlayerMovementState>;
  solids: { count: number; set: Set<string> };
}

const stores = new WeakMap<GameContext, CtxMovementStore>();

function storeFor(ctx: GameContext): CtxMovementStore {
  let store = stores.get(ctx);
  if (store === undefined) {
    store = {
      players: new Map(),
      solids: { count: -1, set: new Set() },
    };
    stores.set(ctx, store);
  }
  return store;
}

function stateFor(store: CtxMovementStore, userId: string): PlayerMovementState {
  let state = store.players.get(userId);
  if (state === undefined) {
    state = { heading: 0, facing: null, voxelBody: null, motion: null };
    store.players.set(userId, state);
  }
  return state;
}

/** One player's current heading (radians), integrated by {@link stepPlayerMovement} — the shell reads it back into its camera/aim yaw. */
export function playerMovementHeading(ctx: GameContext, userId: string): number {
  return stores.get(ctx)?.players.get(userId)?.heading ?? 0;
}

/** Drop a player's retained movement state (heading + kinematic body) — call on leave so a rejoin starts fresh instead of resuming stale velocity. */
export function forgetPlayerMovement(ctx: GameContext, userId: string): void {
  stores.get(ctx)?.players.delete(userId);
}

/**
 * Rendered body yaw to commit this frame. With `turnSpeed` unset the body snaps
 * to its movement heading exactly as before (no opt-in, no behavior change); with
 * `turnSpeed` set it rotates toward that heading at `turnSpeed` rad/s along the
 * shortest arc, so strafing and backpedalling read as a turning body rather than
 * an instant flip. Retained per player so the smoothing is continuous across frames.
 */
function resolveBodyFacing(
  state: PlayerMovementState,
  moving: boolean,
  velocityX: number,
  velocityZ: number,
  fallbackYaw: number,
  turnSpeed: number | undefined,
  dt: number,
): number {
  if (turnSpeed === undefined) {
    const snapped = moving ? Math.atan2(velocityX, velocityZ) : fallbackYaw;
    state.facing = snapped;
    return snapped;
  }
  const from = state.facing ?? fallbackYaw;
  const target = moving ? Math.atan2(velocityX, velocityZ) : from;
  const next = approachYaw(from, target, turnSpeed, dt);
  state.facing = next;
  return next;
}

/**
 * Integrate one player's movement for a tick from their held-input frame and commit the pose — the single
 * genre-agnostic controller both the shell (its local player) and a host (each connected player in `onTick`) call,
 * so single-player and server-authoritative movement are identical. Reads the player's controlled entity, terrain,
 * scene solids, and pending motion impulses; writes the entity pose via `setPose`. Retains heading + kinematic body
 * per `userId` on the `ctx`. Pass `heading` to override the internally-integrated yaw (the shell owns yaw for its
 * camera); omit it and the controller turns from the frame's `turnLeft`/`turnRight` actions.
 */
export function stepPlayerMovement(
  ctx: GameContext,
  userId: string,
  input: InputFrame,
  dt: number,
  tuning: PlayerMovementTuning,
  heading?: number,
): void {
  const playerId = ctx.player.possession.active(userId);
  const player = ctx.scene.entity.get(playerId);
  if (player === null) return;
  // Seated / scripted freeze: skip the whole movement + obstacle gather. Without this, a driven car
  // still paid city-scale collision every frame while the rider was frozen in place.
  if (player.movement?.frozen === true) return;

  const store = storeFor(ctx);
  const state = stateFor(store, userId);

  const held = new Set(input.held);
  const isDown = (action: string): boolean => held.has(action);

  if (heading !== undefined) {
    state.heading = heading;
  } else {
    const turnInput = (isDown("turnRight") ? 1 : 0) - (isDown("turnLeft") ? 1 : 0);
    const turnSpeed = tuning.movement?.turnSpeed ?? DEFAULT_TURN_SPEED;
    if (turnInput !== 0) state.heading = steerYaw(state.heading, turnInput, turnSpeed, dt);
  }
  const forwardX = Math.sin(state.heading);
  const forwardZ = Math.cos(state.heading);

  const keys = createEmptyMovementKeys();
  keys.w = isDown("moveForward");
  keys.s = isDown("moveBack");
  keys.a = isDown("moveLeft");
  keys.d = isDown("moveRight");
  keys.shift = isDown("sprint") && (tuning.movement?.canSprint?.(ctx) ?? true);
  keys.space = isDown("jump");
  // A frame carrying analog magnitudes (virtual joystick, gamepad stick) walks at its deflection
  // instead of slamming digital ±1 axes — the fix for "a slight stick tilt reads as a full strafe".
  const analog = input.analog ?? null;
  const analogMove =
    analog === null
      ? null
      : {
          forward: (analog.moveForward ?? 0) - (analog.moveBack ?? 0),
          right: (analog.moveRight ?? 0) - (analog.moveLeft ?? 0),
        };
  const intent = resolveMovementIntent(keys, true, analogMove);
  const motionBatch = ctx.player.motionFor(userId).takePending();
  const walkSpeed = player.movement?.walkSpeed ?? DEFAULT_WALK_SPEED;

  if (tuning.collision?.voxel === true) {
    let body = state.voxelBody;
    if (body === null) {
      body = createVoxelPlayerBody(player.position[0], player.position[1], player.position[2]);
      state.voxelBody = body;
    }
    const objects = ctx.scene.object.list();
    if (store.solids.count !== objects.length) {
      store.solids.set = new Set(objects.map((o) => `${o.position[0]},${o.position[1]},${o.position[2]}`));
      store.solids.count = objects.length;
    }
    const solids = store.solids.set;
    const isSolid = (x: number, y: number, z: number): boolean => solids.has(`${x},${y},${z}`);
    const dims: VoxelPlayerDims = {
      halfWidth: tuning.collision.halfWidth ?? 0.3,
      height: tuning.collision.height ?? 1.8,
      stepHeight: tuning.collision.stepHeight ?? 0.6,
    };
    body.velocityY = applyMotionImpulses(body.velocityY, motionBatch);
    [body.velocityX, body.velocityZ] = applyHorizontalImpulses(body.velocityX, body.velocityZ, motionBatch);
    advanceVoxelPlayer(
      body,
      intent,
      forwardX,
      forwardZ,
      walkSpeed,
      dt,
      isSolid,
      dims,
      tuning.physics,
      tuning.hasTerrain ? (x, z) => tuning.ground.sampleHeight(x, z) : undefined,
    );
    if (motionBatch !== null && motionBatch.y !== null) body.y = motionBatch.y;
    ctx.scene.entity.setPose(playerId, {
      position: [body.x, body.y, body.z],
      rotationY: resolveBodyFacing(
        state,
        intent.moving,
        body.velocityX,
        body.velocityZ,
        player.rotationY,
        tuning.movement?.turnSpeed,
        dt,
      ),
      dt,
    });
    return;
  }

  let motion = state.motion;
  if (motion === null) {
    motion = createPlayerMotionState();
    state.motion = motion;
  }
  motion.verticalVelocity = applyMotionImpulses(motion.verticalVelocity, motionBatch);
  [motion.horizontalVelocityX, motion.horizontalVelocityZ] = applyHorizontalImpulses(
    motion.horizontalVelocityX,
    motion.horizontalVelocityZ,
    motionBatch,
  );
  const swimCfg = tuning.movement?.swim;
  const swimEnabled = swimCfg === true || (typeof swimCfg === "object" && swimCfg !== null);
  const swimSpeedMultiplier =
    typeof swimCfg === "object" && swimCfg !== null
      ? swimCfg.speedMultiplier ?? DEFAULT_SWIM_SPEED_MULTIPLIER
      : DEFAULT_SWIM_SPEED_MULTIPLIER;
  const waterLevel = tuning.ground.waterLevel;
  const submerged =
    swimEnabled &&
    waterLevel !== undefined &&
    tuning.ground.sampleHeight(player.position[0], player.position[2]) < waterLevel;
  const motionOptions: MotionFrameOptions | undefined = submerged
    ? { speedScale: swimSpeedMultiplier, floating: true }
    : undefined;
  const prevJumpOffset = motion.jumpOffset;
  const step = advancePlayerMotion(motion, intent, forwardX, forwardZ, walkSpeed, dt, tuning.physics, motionOptions);
  // Airborne means "not resting on the surface below": any jump/impulse height before or after this
  // frame's integration. Grounded-only forgiveness (step-up) and airborne-only landing key off it.
  const airborne = prevJumpOffset > 0 || motion.jumpOffset > 0;
  let stepX = step.stepX;
  let stepZ = step.stepZ;
  if (tuning.movement?.mode === "axis") {
    const constrained = constrainStepToAxis(stepX, stepZ, tuning.movement.axis ?? "x");
    stepX = constrained.stepX;
    stepZ = constrained.stepZ;
  }
  const stepHeight = tuning.movement?.stepHeight ?? DEFAULT_PLAYER_STEP_HEIGHT;
  let obstacles: CollisionObstacle[] | null = null;
  if (tuning.movement?.collideObjects !== false) {
    obstacles = gatherMovementObstacles(ctx, player.position, stepX, stepZ);
    // While grounded, a box the player could simply step onto is a ledge, not a wall.
    const resolved = resolveObstacleStep(
      player.position,
      stepX,
      stepZ,
      obstacles,
      DEFAULT_OBSTACLE_PLAYER_RADIUS,
      airborne ? 0 : stepHeight,
    );
    stepX = resolved.stepX;
    stepZ = resolved.stepZ;
  }
  let nextX = player.position[0] + stepX;
  let nextZ = player.position[2] + stepZ;
  if (tuning.movement?.mode === "grid") {
    const snapped = snapPositionToGrid(nextX, nextZ, tuning.movement.cellSize ?? 1);
    nextX = snapped[0];
    nextZ = snapped[1];
  }
  const slideCfg = tuning.movement?.slopeSlide;
  if (slideCfg === true || (typeof slideCfg === "object" && slideCfg !== null)) {
    const maxClimbNormalY =
      typeof slideCfg === "object" && slideCfg.maxClimbSlope !== undefined
        ? slideCfg.maxClimbSlope
        : DEFAULT_MAX_CLIMB_NORMAL_Y;
    if (tuning.ground.sampleNormal(nextX, nextZ)[1] < maxClimbNormalY) {
      const slope = sampleSlope(tuning.ground, nextX, nextZ);
      const slide = SLOPE_SLIDE_SPEED * slope.steepness * dt;
      nextX += slope.downhill[0] * slide;
      nextZ += slope.downhill[1] * slide;
    }
  }
  const groundAtNext = tuning.ground.sampleHeight(nextX, nextZ);
  // Blocking colliders are walkable surfaces: the effective ground under the player is the higher of
  // the terrain and the tallest object top the player can stand on here. While grounded a top within
  // stepHeight above the feet is stepped onto (matching the obstruction's ledge forgiveness); while
  // airborne only tops at/below the feet catch, so a jump lands ON a crate instead of sinking inside
  // it and being rubber-banded out by depenetration.
  const supportY =
    obstacles !== null
      ? obstacleSupportHeight(nextX, nextZ, player.position[1], airborne ? 0 : stepHeight, obstacles)
      : null;
  const effectiveGround = supportY !== null && supportY > groundAtNext ? supportY : groundAtNext;
  let nextY: number;
  if (airborne) {
    // Integrate the jump arc in absolute space (previous feet + this frame's offset delta) so the
    // arc stays continuous when the ground under the player changes mid-flight, and land on the
    // effective ground — terrain or object top — the moment the descending feet reach it.
    const nextFeet = player.position[1] + (motion.jumpOffset - prevJumpOffset);
    if (nextFeet <= effectiveGround && motion.verticalVelocity <= 0) {
      nextY = effectiveGround;
      motion.jumpOffset = 0;
      motion.verticalVelocity = 0;
      motion.grounded = true;
    } else {
      nextY = Math.max(nextFeet, effectiveGround);
      motion.jumpOffset = nextY - effectiveGround;
      motion.grounded = false;
    }
  } else if (!submerged && player.position[1] - effectiveGround > stepHeight) {
    // Walked off a ledge taller than a step (a crate edge, a cliff): fall under gravity from here
    // instead of teleporting the feet down to the ground in one frame.
    nextY = player.position[1];
    motion.jumpOffset = nextY - effectiveGround;
    motion.verticalVelocity = 0;
    motion.grounded = false;
  } else {
    nextY = effectiveGround;
  }
  if (motionBatch !== null && motionBatch.y !== null) {
    nextY = motionBatch.y;
    motion.jumpOffset = motionBatch.y - effectiveGround;
  } else if (swimEnabled && waterLevel !== undefined && effectiveGround < waterLevel) {
    nextY = waterLevel;
  }
  if (tuning.movement?.beforeCommit !== undefined) {
    const frame: MovementCommitFrame = {
      entityId: playerId,
      current: player.position,
      next: [nextX, nextY, nextZ],
      dt,
      ctx,
    };
    const replacement = tuning.movement.beforeCommit(frame);
    if (replacement !== undefined) {
      nextX = replacement[0];
      nextY = replacement[1];
      nextZ = replacement[2];
    }
  }
  ctx.scene.entity.setPose(playerId, {
    position: [nextX, nextY, nextZ],
    rotationY: resolveBodyFacing(
      state,
      intent.moving,
      motion.horizontalVelocityX,
      motion.horizontalVelocityZ,
      player.rotationY,
      tuning.movement?.turnSpeed,
      dt,
    ),
    dt,
  });
}

/**
 * The player's blocking obstacles for this step, from the shared solid seam. A walking NPC calls
 * `resolveWalkerStep` against the same query, so "solid" means one thing engine-wide.
 */
function gatherMovementObstacles(
  ctx: GameContext,
  position: EntityPosition,
  stepX: number,
  stepZ: number,
): CollisionObstacle[] {
  return solidObstaclesNear(
    ctx,
    position,
    Math.abs(stepX) + DEFAULT_OBSTACLE_PLAYER_RADIUS,
    Math.abs(stepZ) + DEFAULT_OBSTACLE_PLAYER_RADIUS,
  );
}

