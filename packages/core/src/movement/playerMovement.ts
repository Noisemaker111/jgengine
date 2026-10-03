import type { PhysicsConfig } from "../game/defineGame";
import type { MovementCommitFrame, PlayerMovementConfig, VoxelCollisionConfig } from "../game/playableGame";
import type { GameContext } from "../runtime/gameContext";
import type { InputFrame } from "../runtime/inputSnapshot";
import { createInputBuffer, type InputBuffer, type InputBufferSnapshot } from "../input/inputBuffer";
import { applyHorizontalImpulses, applyMotionImpulses } from "../runtime/motionIntents";
import {
  createCharacterController,
  type CharacterController,
  type CharacterControllerConfig,
  type CharacterControllerState,
} from "./characterController";
import { groundFieldFor, hasEnvironmentTerrain, sampleSlope, type TerrainField } from "../world/terrain";
import type { WorldFeature } from "../world/features";
import type { EntityPosition } from "../scene/entityStore";
import type { PhysicsBackend } from "../physics/physicsBackend";
import {
  advancePlayerMotion,
  constrainStepToAxis,
  createEmptyMovementKeys,
  createPlayerMotionState,
  DEFAULT_OBSTACLE_PLAYER_RADIUS,
  motionStepSeconds,
  obstacleSupportHeight,
  resolveMovementIntent,
  resolveObstacleStep,
  snapPositionToGrid,
  type CollisionObstacle,
  type MotionFrameOptions,
  type MovementTuningOverrides,
  type PlayerMotionState,
} from "./movementModel";
import {
  advanceFreeFlight,
  createFreeFlightState,
  resolveFlightStep,
  resolveFreeFlightIntentFromInput,
  type FreeFlightState,
  type FreeFlightTuning,
} from "./freeFlight";
import { solidObstaclesNear } from "./solidObstacles";
import { approachYaw, steerYaw } from "./steering";
import { resolveTerrainGradeStep } from "./terrainGrade";
import {
  advanceVoxelPlayer,
  createVoxelPlayerBody,
  type VoxelPlayerBody,
  type VoxelPlayerDims,
} from "./voxelController";

const CONTROLLER_CONFIG_FIELDS = ["radius", "height", "stepHeight", "maxSlopeDeg", "skinWidth", "crouchHeight", "snapDistance", "maxSlides", "mask"] as const;
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
  /** The simulation driver already clamps frame stalls; integrate its scaled step in full. */
  authoritativeStep?: boolean;
  collision?: VoxelCollisionConfig;
  movement?: PlayerMovementConfig;
  physics?: MovementTuningOverrides;
  /** Optional physics-backed capsule controller; when present it replaces terrain/AABB walking collision. */
  controller?: { backend: PhysicsBackend; capsule: CharacterControllerConfig };
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
  const overrides: MovementTuningOverrides = {
    get gravityAcceleration() { return opts.physics?.gravity === undefined ? undefined : -opts.physics.gravity; },
    get jumpVelocity() { return opts.physics?.jumpVelocity; },
    get backpedalSpeedMultiplier() { return opts.movement?.backpedalMult; },
    get groundAcceleration() { return opts.movement?.feel?.groundAcceleration; },
    get airAcceleration() { return opts.movement?.feel?.airAcceleration; },
    get groundFriction() { return opts.movement?.feel?.groundFriction; },
    get runSpeedMultiplier() { return opts.movement?.feel?.runMultiplier; },
    get crouchSpeedMultiplier() { return opts.movement?.feel?.crouchMultiplier; },
    get jumpBufferMs() { return opts.movement?.feel?.jumpBufferMs; },
    get coyoteMs() { return opts.movement?.feel?.coyoteMs; },
    get jumpCutFactor() { return opts.movement?.feel?.jumpCutFactor; },
    get apexGravityScale() { return opts.movement?.feel?.apexGravityScale; },
    get apexSpeed() { return opts.movement?.feel?.apexSpeed; },
    get fallGravityScale() { return opts.movement?.feel?.fallGravityScale; },
    get landingRecoveryMs() { return opts.movement?.feel?.landingRecoveryMs; },
    get landingSpeedScale() { return opts.movement?.feel?.landingSpeedScale; },
  };
  const defaultCapsule: CharacterControllerConfig = {
    radius: DEFAULT_OBSTACLE_PLAYER_RADIUS,
    height: 1.8,
    stepHeight: DEFAULT_PLAYER_STEP_HEIGHT,
  };
  const controller = {
    get backend() { return opts.physics!.backend!; },
    get capsule() { return opts.physics?.controller ?? defaultCapsule; },
  };
  return {
    get collision() { return opts.collision; },
    get movement() { return opts.movement; },
    get physics() {
      return opts.physics === undefined && opts.movement?.feel === undefined && opts.movement?.backpedalMult === undefined
        ? undefined : overrides;
    },
    get controller() { return opts.physics?.backend === undefined ? undefined : controller; },
    ground: groundFieldFor(opts.world),
    hasTerrain: hasEnvironmentTerrain(opts.world),
  };
}

/** Last completed shared movement step for one entity; a live read-only view, not a save snapshot. */
export interface PlayerMovementTelemetry {
  grounded: boolean;
  verticalVelocity: number;
  crouching: boolean;
}

interface PlayerMovementState {
  heading: number;
  facing: number | null;
  voxelBody: VoxelPlayerBody | null;
  motion: PlayerMotionState | null;
  flight: FreeFlightState | null;
  controller: CharacterController | null;
  controllerConfig: CharacterControllerConfig | null;
  controllerJumpHeld: boolean;
  jumpBuffer: InputBuffer | null;
  /** Controller state restored before the capsule exists; applied when it is created. */
  pendingController: CharacterControllerState | null;
  entityId: string | null;
  telemetry: PlayerMovementTelemetry | null;
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
    state = {
      heading: 0,
      facing: null,
      voxelBody: null,
      motion: null,
      flight: null,
      controller: null,
      controllerConfig: null,
      controllerJumpHeld: false,
      jumpBuffer: null,
      pendingController: null,
      entityId: null,
      telemetry: null,
    };
    store.players.set(userId, state);
  }
  return state;
}

function invalidateTelemetry(state: PlayerMovementState): void {
  state.entityId = null;
  state.telemetry = null;
}

function retuneController(state: PlayerMovementState, config: CharacterControllerConfig): void {
  const previous = state.controllerConfig;
  if (previous !== null) {
    let changed = false;
    for (const field of CONTROLLER_CONFIG_FIELDS) {
      if (previous[field] !== config[field]) { changed = true; break; }
    }
    if (!changed) return;
  }
  const next = {
    radius: config.radius,
    height: config.height,
    stepHeight: config.stepHeight,
    maxSlopeDeg: config.maxSlopeDeg,
    skinWidth: config.skinWidth,
    crouchHeight: config.crouchHeight,
    snapDistance: config.snapDistance,
    maxSlides: config.maxSlides,
    mask: config.mask,
  };
  state.controller!.retune(next);
  state.controllerConfig = next;
}

function positionAccepted(ctx: GameContext, entityId: string, x: number, y: number, z: number): boolean {
  const actual = ctx.scene.entity.get(entityId)?.position;
  return actual !== undefined && actual[0] === x && actual[1] === y && actual[2] === z;
}

function updateTelemetry(
  state: PlayerMovementState,
  entityId: string,
  grounded: boolean,
  verticalVelocity: number,
  crouching: boolean,
): void {
  state.entityId = entityId;
  const telemetry = state.telemetry ??= { grounded, verticalVelocity, crouching };
  telemetry.grounded = grounded;
  telemetry.verticalVelocity = verticalVelocity;
  telemetry.crouching = crouching;
}

/**
 * Read the entity's last shared movement result through indexed possession ownership. Returns `null` before a
 * step, after movement restore/forget, when a commit policy replaces the motor proposal, or for an entity not
 * currently driven by this motor. Reuses one live view;
 * custom movers supply their own animation parameters. Flight never reports ground contact or a walking crouch.
 *
 * @capability movement-telemetry read physical grounded, vertical velocity and crouch state without animation-store writes
 */
export function playerMovementTelemetry(ctx: GameContext, entityId: string): Readonly<PlayerMovementTelemetry> | null {
  const userId = ctx.player.possession.ownerOf(entityId) ?? entityId;
  if (ctx.player.possession.active(userId) !== entityId || ctx.scene.entity.get(entityId) === null) return null;
  const state = stores.get(ctx)?.players.get(userId);
  return state?.entityId === entityId ? state.telemetry : null;
}

/** One player's current heading (radians), integrated by {@link stepPlayerMovement} — the shell reads it back into its camera/aim yaw. */
export function playerMovementHeading(ctx: GameContext, userId: string): number {
  return stores.get(ctx)?.players.get(userId)?.heading ?? 0;
}

/** One player's serializable movement state: heading, facing, velocities, jump latch and controller capsule. The entity pose lives in the entity store. */
export interface PlayerMovementSnapshot {
  heading: number;
  facing: number | null;
  voxelBody: VoxelPlayerBody | null;
  motion: PlayerMotionState | null;
  flight: FreeFlightState | null;
  controller: CharacterControllerState | null;
  controllerJumpHeld: boolean;
  /** Buffered jump presses; absent in snapshots taken before jump buffering existed. */
  jumpBuffer?: InputBufferSnapshot | null;
}

function copyController(state: CharacterControllerState): CharacterControllerState {
  return { ...state, position: [...state.position], groundNormal: [...state.groundNormal] };
}

/** Copy one player's movement state for prediction, rollback or a save; `null` when the player has not moved yet. */
export function snapshotPlayerMovement(ctx: GameContext, userId: string): PlayerMovementSnapshot | null {
  const state = stores.get(ctx)?.players.get(userId);
  if (state === undefined) return null;
  const controller = state.controller?.snapshot() ?? state.pendingController;
  return {
    heading: state.heading,
    facing: state.facing,
    voxelBody: state.voxelBody === null ? null : { ...state.voxelBody },
    motion: state.motion === null ? null : { ...state.motion },
    flight: state.flight === null ? null : { ...state.flight },
    controller: controller === null ? null : copyController(controller),
    controllerJumpHeld: state.controllerJumpHeld,
    jumpBuffer: state.jumpBuffer?.snapshot() ?? null,
  };
}

/** Put a player's movement state back to a {@link snapshotPlayerMovement} copy, so the next {@link stepPlayerMovement} replays from there. */
export function restorePlayerMovement(ctx: GameContext, userId: string, snapshot: PlayerMovementSnapshot): void {
  const state = stateFor(storeFor(ctx), userId);
  invalidateTelemetry(state);
  state.heading = snapshot.heading;
  state.facing = snapshot.facing;
  state.voxelBody = snapshot.voxelBody === null ? null : { ...snapshot.voxelBody };
  state.motion = snapshot.motion === null ? null : { ...snapshot.motion };
  state.flight = snapshot.flight === null ? null : { ...snapshot.flight };
  state.controllerJumpHeld = snapshot.controllerJumpHeld;
  const jumpBuffer = snapshot.jumpBuffer ?? null;
  if (jumpBuffer === null) {
    state.jumpBuffer = null;
  } else {
    state.jumpBuffer ??= createInputBuffer({ windowMs: jumpBuffer.windowMs });
    state.jumpBuffer.restore(jumpBuffer);
  }
  const controller = snapshot.controller === null ? null : copyController(snapshot.controller);
  if (state.controller !== null && controller !== null) {
    state.controller.restore(controller);
    state.pendingController = null;
  } else {
    if (controller === null) state.controller = null;
    state.pendingController = controller;
  }
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

function flightTuningFor(
  movement: PlayerMovementConfig | undefined,
  ctx: GameContext,
): FreeFlightTuning | null {
  const cfg = movement?.flight;
  if (cfg === undefined || cfg === false) return null;
  if (cfg === true) return { mode: "creative" };
  if (typeof cfg === "object") {
    if (cfg.canFly !== undefined && !cfg.canFly(ctx)) return null;
    return {
      mode: cfg.mode ?? "creative",
      speed: cfg.speed,
      verticalSpeed: cfg.verticalSpeed,
      sprintMultiplier: cfg.sprintMultiplier,
      acceleration: cfg.acceleration,
      gravity: cfg.gravity,
      thrust: cfg.thrust,
      alignWithLook: cfg.alignWithLook,
      collide: cfg.collide,
      bindings: cfg.bindings,
      camera: cfg.camera ?? null,
    };
  }
  return null;
}

/**
 * Integrate one player's movement for a tick from their held-input frame and commit the pose — the single
 * genre-agnostic controller both the shell (its local player) and a host (each connected player in `onTick`) call,
 * so single-player and server-authoritative movement are identical. Reads the player's controlled entity, terrain,
 * scene solids, and pending motion impulses; writes the entity pose via `setPose`. Retains heading + kinematic body
 * per `userId` on the `ctx`. Pass `heading` to override the internally-integrated yaw (the shell owns yaw for its
 * camera); omit it and the controller turns from the frame's `turnLeft`/`turnRight` actions. Pass `pitch` for
 * 6DOF spectator flight when `alignWithLook` is set.
 */
export function stepPlayerMovement(
  ctx: GameContext,
  userId: string,
  input: InputFrame,
  dt: number,
  tuning: PlayerMovementTuning,
  heading?: number,
  pitch?: number,
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
  keys.c = isDown("crouch") && ctx.player.movement.setPose(playerId, "crouch") === null;
  if (!keys.c && tuning.controller === undefined) {
    const currentPose = ctx.player.movement.getPose(playerId);
    if (currentPose !== "prone") ctx.player.movement.setPose(playerId, keys.shift ? "running" : "standing");
  }
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

  const flightTuning = flightTuningFor(tuning.movement, ctx);
  if (flightTuning !== null) {
    const value = (action: string): number => input.analog?.[action] ?? (isDown(action) ? 1 : 0);
    let flightIntent = resolveFreeFlightIntentFromInput(isDown, value, input.pointer, flightTuning.bindings);
    if (tuning.movement?.canSprint !== undefined && !tuning.movement.canSprint(ctx)) {
      flightIntent = { ...flightIntent, sprint: false };
    }
    let flightState = state.flight;
    if (flightState === null) {
      flightState = createFreeFlightState();
      state.flight = flightState;
    }
    if (motionBatch !== null) {
      flightState.vy = applyMotionImpulses(flightState.vy, motionBatch);
      const [hx, hz] = applyHorizontalImpulses(flightState.vx, flightState.vz, motionBatch);
      flightState.vx = hx;
      flightState.vz = hz;
    }
    const normalizedFlightTuning: FreeFlightTuning = {
      mode: flightTuning.mode,
      speed: flightTuning.speed,
      verticalSpeed: flightTuning.verticalSpeed,
      sprintMultiplier: flightTuning.sprintMultiplier,
      acceleration: flightTuning.acceleration,
      gravity: flightTuning.gravity,
      thrust: flightTuning.thrust,
      alignWithLook: flightTuning.alignWithLook,
      collide: flightTuning.collide,
      bindings: flightTuning.bindings,
      camera: flightTuning.camera,
    };
    if (normalizedFlightTuning.collide === undefined) {
      normalizedFlightTuning.collide = normalizedFlightTuning.mode === "creative" || normalizedFlightTuning.mode === "hover";
    }
    if (normalizedFlightTuning.camera !== undefined) {
      const cam = (ctx as unknown as { camera?: { setChaseTuning: (t: unknown) => void } }).camera;
      cam?.setChaseTuning(normalizedFlightTuning.camera ?? null);
    }
    const step = advanceFreeFlight(flightState, flightIntent, state.heading, pitch, dt, normalizedFlightTuning, { authoritativeStep: tuning.authoritativeStep });
    let stepX = step.stepX;
    let stepY = step.stepY;
    let stepZ = step.stepZ;
    if (normalizedFlightTuning.collide !== false && tuning.movement?.collideObjects !== false) {
      const obstacles = gatherMovementObstacles(ctx, player.position, stepX, stepZ);
      const verticalResolved = resolveFlightStep(player.position, stepX, stepY, stepZ, obstacles, DEFAULT_OBSTACLE_PLAYER_RADIUS);
      stepY = verticalResolved.stepY;
      const xzResolved = resolveObstacleStep(player.position, stepX, stepZ, obstacles, DEFAULT_OBSTACLE_PLAYER_RADIUS, 0);
      stepX = xzResolved.stepX;
      stepZ = xzResolved.stepZ;
      const ground = tuning.ground.sampleHeight(player.position[0] + stepX, player.position[2] + stepZ);
      const nextY = player.position[1] + stepY;
      if (nextY < ground + 0.2) {
        stepY = ground + 0.2 - player.position[1];
        if (flightState.vy < 0) flightState.vy = 0;
      }
    }
    let motorProposalAccepted = true;
    let nextX = player.position[0] + stepX;
    let nextY = player.position[1] + stepY;
    let nextZ = player.position[2] + stepZ;
    if (motionBatch !== null && motionBatch.y !== null) {
      motorProposalAccepted = motionBatch.y === nextY;
      nextY = motionBatch.y;
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
        motorProposalAccepted = motorProposalAccepted && replacement[0] === nextX && replacement[1] === nextY && replacement[2] === nextZ;
        nextX = replacement[0];
        nextY = replacement[1];
        nextZ = replacement[2];
      }
    }
    ctx.scene.entity.setPose(playerId, {
      position: [nextX, nextY, nextZ],
      rotationY: resolveBodyFacing(
        state,
        flightIntent.moving,
        flightState.vx,
        flightState.vz,
        player.rotationY,
        tuning.movement?.turnSpeed,
        dt,
      ),
      dt,
    });
    if (motorProposalAccepted && positionAccepted(ctx, playerId, nextX, nextY, nextZ)) updateTelemetry(state, playerId, false, flightState.vy, false);
    else invalidateTelemetry(state);
    return;
  }
  if (flightTuning === null && state.flight !== null) {
    const cam = (ctx as unknown as { camera?: { setChaseTuning: (t: unknown) => void } }).camera;
    cam?.setChaseTuning(null);
  }

  if (tuning.controller !== undefined) {
    let controller = state.controller;
    if (controller === null) {
      controller = createCharacterController(tuning.controller.capsule);
      state.controller = controller;
      controller.restore(
        state.pendingController ?? {
          position: [player.position[0], player.position[1], player.position[2]],
          verticalVelocity: 0,
          grounded: true,
          groundNormal: [0, 1, 0],
          groundBody: null,
          crouching: false,
        },
      );
      state.pendingController = null;
    }

    retuneController(state, tuning.controller.capsule);
    const controllerState = controller.state();
    if (
      Math.hypot(
        controllerState.position[0] - player.position[0],
        controllerState.position[1] - player.position[1],
        controllerState.position[2] - player.position[2],
      ) > 1e-6
    ) {
      controller.restore({
        ...controllerState,
        position: [player.position[0], player.position[1], player.position[2]],
        grounded: false,
        groundBody: null,
      });
    }

    let horizontal = state.motion;
    if (horizontal === null) {
      horizontal = createPlayerMotionState();
      state.motion = horizontal;
    }
    controller.setCrouch(tuning.controller.backend, intent.crouching);
    const grounded = controller.state().grounded;
    horizontal.grounded = grounded;
    horizontal.verticalVelocity = applyMotionImpulses(controller.state().verticalVelocity, motionBatch);
    horizontal.jumpOffset = 0;
    [horizontal.horizontalVelocityX, horizontal.horizontalVelocityZ] = applyHorizontalImpulses(
      horizontal.horizontalVelocityX,
      horizontal.horizontalVelocityZ,
      motionBatch,
    );
    const controllerIntent = {
      ...intent,
      crouching: controller.state().crouching,
      running: intent.running && !controller.state().crouching,
    };
    if (state.jumpBuffer === null) {
      horizontal.jumpHeld = state.controllerJumpHeld;
      state.jumpBuffer = createInputBuffer({ windowMs: tuning.physics?.jumpBufferMs ?? 0 });
    }
    const horizontalStep = advancePlayerMotion(
      horizontal,
      controllerIntent,
      forwardX,
      forwardZ,
      walkSpeed,
      dt,
      tuning.physics,
      { buffer: state.jumpBuffer, externalGrounding: true, authoritativeStep: tuning.authoritativeStep },
    );
    state.controllerJumpHeld = intent.jumping;
    controller.restore({
      ...controller.state(),
      verticalVelocity: horizontal.verticalVelocity,
      grounded: horizontal.grounded,
    });
    const result = controller.move(tuning.controller.backend, {
      motion: [horizontalStep.stepX, 0, horizontalStep.stepZ],
      dt: motionStepSeconds(dt, tuning.authoritativeStep),
    });
    horizontal.verticalVelocity = controller.state().verticalVelocity;
    horizontal.jumpOffset = 0;
    if (!grounded && result.grounded) horizontal.landedAtMs = horizontal.clockMs;
    horizontal.wasAirborne = !result.grounded;
    if (result.grounded) horizontal.jumpRising = false;
    ctx.player.movement.setPose(
      playerId,
      controller.state().crouching ? "crouch" : intent.running ? "running" : "standing",
    );
    let motorProposalAccepted = true;
    let nextPosition: [number, number, number] = [
      controller.state().position[0],
      controller.state().position[1],
      controller.state().position[2],
    ];
    if (motionBatch !== null && motionBatch.y !== null) {
      motorProposalAccepted = motionBatch.y === nextPosition[1];
      nextPosition[1] = motionBatch.y;
      controller.restore({ ...controller.state(), position: nextPosition });
    }
    if (tuning.movement?.beforeCommit !== undefined) {
      const frame: MovementCommitFrame = {
        entityId: playerId,
        current: player.position,
        next: nextPosition,
        dt,
        ctx,
      };
      const replacement = tuning.movement.beforeCommit(frame);
      if (replacement !== undefined) {
        motorProposalAccepted = motorProposalAccepted && replacement[0] === nextPosition[0] && replacement[1] === nextPosition[1] && replacement[2] === nextPosition[2];
        nextPosition = [replacement[0], replacement[1], replacement[2]];
        controller.restore({ ...controller.state(), position: nextPosition });
      }
    }
    horizontal.grounded = result.grounded;
    ctx.scene.entity.setPose(playerId, {
      position: nextPosition,
      rotationY: resolveBodyFacing(
        state,
        intent.moving,
        horizontal.horizontalVelocityX,
        horizontal.horizontalVelocityZ,
        player.rotationY,
        tuning.movement?.turnSpeed,
        dt,
      ),
      dt,
    });
    if (motorProposalAccepted && positionAccepted(ctx, playerId, nextPosition[0], nextPosition[1], nextPosition[2])) updateTelemetry(state, playerId, controller.state().grounded, controller.state().verticalVelocity, controller.state().crouching);
    else invalidateTelemetry(state);
    return;
  }

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
      { authoritativeStep: tuning.authoritativeStep },
    );
    const motorProposalAccepted = motionBatch === null || motionBatch.y === null || motionBatch.y === body.y;
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
    if (motorProposalAccepted && positionAccepted(ctx, playerId, body.x, body.y, body.z)) updateTelemetry(state, playerId, body.grounded, body.velocityY, intent.crouching);
    else invalidateTelemetry(state);
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
  const jumpBufferMs = tuning.physics?.jumpBufferMs ?? 0;
  let jumpBuffer = state.jumpBuffer;
  if (jumpBuffer === null) {
    jumpBuffer = createInputBuffer({ windowMs: jumpBufferMs });
    state.jumpBuffer = jumpBuffer;
  }
  const motionOptions: MotionFrameOptions = submerged
    ? { speedScale: swimSpeedMultiplier, floating: true, buffer: jumpBuffer, authoritativeStep: tuning.authoritativeStep }
    : { buffer: jumpBuffer, authoritativeStep: tuning.authoritativeStep };
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
  const maxClimbGrade = tuning.movement?.maxClimbGrade;
  if (maxClimbGrade !== undefined) {
    const accepted = resolveTerrainGradeStep(
      tuning.movement?.climbGradeHeight ?? tuning.ground,
      player.position,
      nextX - player.position[0],
      nextZ - player.position[2],
      maxClimbGrade,
    );
    nextX = player.position[0] + accepted.stepX;
    nextZ = player.position[2] + accepted.stepZ;
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
  let motorProposalAccepted = true;
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
    motorProposalAccepted = motionBatch.y === nextY;
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
      motorProposalAccepted = motorProposalAccepted && replacement[0] === nextX && replacement[1] === nextY && replacement[2] === nextZ;
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
  if (motorProposalAccepted && positionAccepted(ctx, playerId, nextX, nextY, nextZ)) updateTelemetry(state, playerId, motion.grounded, motion.verticalVelocity, intent.crouching);
  else invalidateTelemetry(state);
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
