import type { BodyHandle, BodyShape, PhysicsBackend, PhysicsVec3 } from "../physics/physicsBackend";

/** Capsule dimensions and the walk rules a controller applies; every field is retunable during play. */
export interface CharacterControllerConfig {
  radius: number;
  /** Standing height from feet to crown. */
  height: number;
  /** Height the feet may pop up to clear a ledge in one move. Default 0.35. */
  stepHeight?: number;
  /** Steepest walkable slope in degrees; steeper surfaces are walls to slide along. Default 50. */
  maxSlopeDeg?: number;
  /** Gap kept between the capsule and any surface so casts never start inside geometry. Default 0.02. */
  skinWidth?: number;
  /** Height while crouched. Default `height * 0.6`. */
  crouchHeight?: number;
  /** How far below the feet the ground may be while still counting as grounded (stairs down, small bumps). Default 0.3. */
  snapDistance?: number;
  /** Slide iterations per move. Default 4. */
  maxSlides?: number;
  /** Collision mask for the controller's casts. Default all layers. */
  mask?: number;
}

/** The controller's serializable state. `position` is the feet point; the capsule stands above it. */
export interface CharacterControllerState {
  position: [number, number, number];
  verticalVelocity: number;
  grounded: boolean;
  groundNormal: [number, number, number];
  groundBody: BodyHandle | null;
  crouching: boolean;
}

/** One step of intent for {@link CharacterController.move}. */
export interface CharacterMoveInput {
  /** Desired horizontal displacement this step, world units. */
  motion: PhysicsVec3;
  dt: number;
  /** Downward acceleration applied to `verticalVelocity`. Default 0 (caller integrates vertical motion itself). */
  gravity?: number;
  /** Upward velocity to set this step; ignored unless grounded. */
  jumpVelocity?: number;
  /** Request crouch (`true`) or stand (`false`); standing waits until there is headroom. */
  crouch?: boolean;
  /** Body the controller itself is represented by, excluded from its own casts. */
  self?: BodyHandle;
}

/** What one move did. */
export interface CharacterMoveResult {
  moved: [number, number, number];
  grounded: boolean;
  groundNormal: [number, number, number];
  hitWall: boolean;
  hitCeiling: boolean;
  steppedUp: boolean;
  /** Set when a stand request was refused for lack of headroom. */
  crouchBlocked: boolean;
}

/** The controller handle: config, state, and the per-step move. */
export interface CharacterController {
  config(): Readonly<Required<CharacterControllerConfig>>;
  retune(next: Partial<CharacterControllerConfig>): void;
  state(): CharacterControllerState;
  snapshot(): CharacterControllerState;
  restore(next: CharacterControllerState): void;
  /** Current capsule as a backend shape (crouch-aware). */
  shape(): BodyShape;
  /** Capsule center for the current state. */
  center(): [number, number, number];
  move(backend: PhysicsBackend, input: CharacterMoveInput): CharacterMoveResult;
}

function resolve(config: CharacterControllerConfig): Required<CharacterControllerConfig> {
  return {
    radius: config.radius,
    height: config.height,
    stepHeight: config.stepHeight ?? 0.35,
    maxSlopeDeg: config.maxSlopeDeg ?? 50,
    skinWidth: config.skinWidth ?? 0.02,
    crouchHeight: config.crouchHeight ?? config.height * 0.6,
    snapDistance: config.snapDistance ?? 0.3,
    maxSlides: config.maxSlides ?? 4,
    mask: config.mask ?? 0xffffffff,
  };
}

/**
 * Collide-and-slide capsule controller over any {@link PhysicsBackend}: horizontal slide along walls, step-up over
 * ledges, slope limit, ceiling test, crouch with headroom check, ground snapping, and moving-platform carry read from
 * the ground body's velocity. Pure over the backend's `shapecast`/`overlap`; the caller owns input and gravity policy.
 *
 * @capability character-controller capsule walk over the physics backend — slide, step-up, slopes, crouch, platforms
 */
export function createCharacterController(initial: CharacterControllerConfig): CharacterController {
  let cfg = resolve(initial);
  let state: CharacterControllerState = {
    position: [0, 0, 0],
    verticalVelocity: 0,
    grounded: false,
    groundNormal: [0, 1, 0],
    groundBody: null,
    crouching: false,
  };

  function currentHeight(): number {
    return state.crouching ? cfg.crouchHeight : cfg.height;
  }

  function shapeFor(height: number): BodyShape {
    const halfHeight = Math.max(0, height / 2 - cfg.radius);
    return { kind: "capsule", radius: cfg.radius, halfHeight };
  }

  function centerFor(position: readonly number[], height: number): [number, number, number] {
    return [position[0]!, position[1]! + height / 2, position[2]!];
  }

  function walkable(normal: PhysicsVec3): boolean {
    return normal[1] >= Math.cos((cfg.maxSlopeDeg * Math.PI) / 180);
  }

  function cast(backend: PhysicsBackend, from: readonly number[], height: number, motion: PhysicsVec3, self?: BodyHandle) {
    return backend.shapecast({
      shape: shapeFor(height),
      position: centerFor(from, height),
      motion,
      mask: cfg.mask,
      ...(self === undefined ? {} : { exclude: self }),
    });
  }

  /** Move along `motion`, stopping `skinWidth` short of the first hit. Returns the fraction travelled and the hit. */
  function sweep(backend: PhysicsBackend, pos: [number, number, number], height: number, motion: PhysicsVec3, self?: BodyHandle) {
    const len = Math.hypot(motion[0], motion[1], motion[2]);
    if (!(len > 1e-9)) return { fraction: 1, hit: null };
    const hit = cast(backend, pos, height, motion, self);
    if (hit === null) {
      pos[0] += motion[0];
      pos[1] += motion[1];
      pos[2] += motion[2];
      return { fraction: 1, hit: null };
    }
    const back = cfg.skinWidth / len;
    const fraction = Math.max(0, hit.toi - back);
    pos[0] += motion[0] * fraction;
    pos[1] += motion[1] * fraction;
    pos[2] += motion[2] * fraction;
    return { fraction, hit };
  }

  return {
    config: () => cfg,
    retune(next) {
      cfg = resolve({ ...cfg, ...next });
    },
    state: () => state,
    snapshot: () => ({
      position: [state.position[0], state.position[1], state.position[2]],
      verticalVelocity: state.verticalVelocity,
      grounded: state.grounded,
      groundNormal: [state.groundNormal[0], state.groundNormal[1], state.groundNormal[2]],
      groundBody: state.groundBody,
      crouching: state.crouching,
    }),
    restore(next) {
      state = {
        position: [next.position[0], next.position[1], next.position[2]],
        verticalVelocity: next.verticalVelocity,
        grounded: next.grounded,
        groundNormal: [next.groundNormal[0], next.groundNormal[1], next.groundNormal[2]],
        groundBody: next.groundBody,
        crouching: next.crouching,
      };
    },
    shape: () => shapeFor(currentHeight()),
    center: () => centerFor(state.position, currentHeight()),
    move(backend, input) {
      const { dt, self } = input;
      const result: CharacterMoveResult = {
        moved: [0, 0, 0],
        grounded: false,
        groundNormal: [0, 1, 0],
        hitWall: false,
        hitCeiling: false,
        steppedUp: false,
        crouchBlocked: false,
      };
      const start: [number, number, number] = [state.position[0], state.position[1], state.position[2]];
      const pos: [number, number, number] = [start[0], start[1], start[2]];

      if (input.crouch === true && !state.crouching) {
        state.crouching = true;
      } else if (input.crouch === false && state.crouching) {
        const standing = backend.overlap({
          shape: shapeFor(cfg.height),
          position: centerFor(pos, cfg.height),
          mask: cfg.mask,
          ...(self === undefined ? {} : { exclude: self }),
        });
        if (standing.length === 0) state.crouching = false;
        else result.crouchBlocked = true;
      }
      const height = currentHeight();

      let carry: [number, number, number] = [0, 0, 0];
      if (state.grounded && state.groundBody !== null) {
        const ground = backend.body(state.groundBody);
        if (ground !== null) carry = [ground.velocity[0] * dt, ground.velocity[1] * dt, ground.velocity[2] * dt];
      }

      let remaining: [number, number, number] = [input.motion[0] + carry[0], 0, input.motion[2] + carry[2]];
      for (let i = 0; i < cfg.maxSlides; i += 1) {
        const { hit, fraction } = sweep(backend, pos, height, remaining, self);
        if (hit === null) break;
        const left = [remaining[0] * (1 - fraction), remaining[1] * (1 - fraction), remaining[2] * (1 - fraction)];
        const dot = left[0]! * hit.normal[0] + left[1]! * hit.normal[1] + left[2]! * hit.normal[2];
        const slid: [number, number, number] = [
          left[0]! - hit.normal[0] * dot,
          left[1]! - hit.normal[1] * dot,
          left[2]! - hit.normal[2] * dot,
        ];
        if (!walkable(hit.normal)) {
          result.hitWall = true;
          slid[1] = 0;
          if (cfg.stepHeight > 0 && !result.steppedUp && tryStepUp(backend, pos, height, remaining, self)) {
            result.steppedUp = true;
            result.hitWall = false;
            break;
          }
        }
        if (Math.hypot(slid[0], slid[1], slid[2]) < 1e-6) break;
        remaining = slid;
      }

      if (input.gravity !== undefined) state.verticalVelocity -= input.gravity * dt;
      if (input.jumpVelocity !== undefined && state.grounded) {
        state.verticalVelocity = input.jumpVelocity;
        state.grounded = false;
      }
      const wasGrounded = state.grounded;
      let vertical = state.verticalVelocity * dt + carry[1];
      if (wasGrounded && vertical <= 0) vertical -= cfg.snapDistance;
      const { hit: verticalHit } = sweep(backend, pos, height, [0, vertical, 0], self);
      if (verticalHit !== null && vertical > 0) {
        result.hitCeiling = true;
        state.verticalVelocity = 0;
        state.grounded = false;
        state.groundBody = null;
      } else if (verticalHit !== null && walkable(verticalHit.normal)) {
        state.grounded = true;
        state.groundNormal = [verticalHit.normal[0], verticalHit.normal[1], verticalHit.normal[2]];
        state.groundBody = verticalHit.body;
        if (state.verticalVelocity < 0) state.verticalVelocity = 0;
        // A contact at t=0 means touching or already inside; lift by the skin so the next casts start clear.
        if (verticalHit.toi <= 0) pos[1] += cfg.skinWidth;
      } else {
        state.grounded = false;
        state.groundBody = null;
        state.groundNormal = [0, 1, 0];
      }

      state.position = pos;
      result.moved = [pos[0] - start[0], pos[1] - start[1], pos[2] - start[2]];
      result.grounded = state.grounded;
      result.groundNormal = [state.groundNormal[0], state.groundNormal[1], state.groundNormal[2]];
      return result;
    },
  };

  function tryStepUp(
    backend: PhysicsBackend,
    pos: [number, number, number],
    height: number,
    motion: PhysicsVec3,
    self: BodyHandle | undefined,
  ): boolean {
    const probe: [number, number, number] = [pos[0], pos[1], pos[2]];
    const up = sweep(backend, probe, height, [0, cfg.stepHeight, 0], self);
    if (up.hit !== null && up.fraction <= 0) return false;
    const forward = sweep(backend, probe, height, motion, self);
    if (forward.hit !== null && forward.fraction < 0.05) return false;
    const drop = -(probe[1] - pos[1]);
    const down = sweep(backend, probe, height, [0, drop, 0], self);
    if (down.hit === null || !walkable(down.hit.normal)) return false;
    if (probe[1] <= pos[1] + 1e-6) return false;
    pos[0] = probe[0];
    pos[1] = probe[1];
    pos[2] = probe[2];
    return true;
  }
}
