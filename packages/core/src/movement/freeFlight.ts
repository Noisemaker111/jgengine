import { MOVEMENT_TUNING, type AnalogMoveIntent, type CollisionObstacle, type MovementKeysState } from "./movementModel";
import { DEFAULT_OBSTACLE_PLAYER_RADIUS } from "./movementModel";

/** Free-flight families — character-scale 6DOF movement, distinct from vehicle aerodynamics. */
export type FreeFlightMode = "creative" | "spectator" | "noclip" | "hover";

/** Data-first tuning for one free-flight profile. */
export interface FreeFlightTuning {
  mode: FreeFlightMode;
  /** Horizontal base speed (units/s) before sprint. Default 8. */
  speed?: number;
  /** Vertical base speed for ascend/descend. Default = `speed`. */
  verticalSpeed?: number;
  /** Sprint multiplier while shift is held. Default 1.8. */
  sprintMultiplier?: number;
  /** Lerp rate toward target velocity. Default 20. */
  acceleration?: number;
  /** Extra damping applied when no input (0 = rely on lerp). Default 0. */
  damping?: number;
  /** Downward acceleration for hover mode. Default 0 (weightless). */
  gravity?: number;
  /** Upward thrust acceleration while ascending in hover. Default 32. */
  thrust?: number;
  /** When true, forward moves along the look pitch (spectator). Default false. */
  alignWithLook?: boolean;
  /** Top vertical fall speed in hover. Default 20. */
  maxFallSpeed?: number;
  /** Whether to slide against world solids. Default true for creative/hover, false for spectator/noclip. */
  collide?: boolean;
}

/** Velocity state for a free-flight actor — serializable and ownable by the caller. */
export interface FreeFlightState {
  vx: number;
  vy: number;
  vz: number;
}

/** Intent for one free-flight tick — forward/right from WASD/analog, vertical from jump/crouch. */
export interface FreeFlightIntent {
  forward: number;
  right: number;
  vertical: number;
  sprint: boolean;
  moving: boolean;
}

/** World displacement produced by one free-flight tick. */
export interface FreeFlightStep {
  stepX: number;
  stepY: number;
  stepZ: number;
}

/** Stateful handle for any free-flight actor with snapshot/restore/retune. */
export interface FreeFlightController {
  tick(dt: number, intent: FreeFlightIntent, yaw: number, pitch?: number): FreeFlightStep;
  velocity(): readonly [number, number, number];
  snapshot(): FreeFlightState;
  restore(next: FreeFlightState): void;
  retune(next: FreeFlightTuning): void;
  reset(): void;
}

const ANALOG_EPSILON = 0.02;

/** Create an empty flight velocity state. */
export function createFreeFlightState(): FreeFlightState {
  return { vx: 0, vy: 0, vz: 0 };
}

/**
 * Translate held keys + analog into a free-flight intent.
 * Vertical is `space - (control|c)` so jump ascends and crouch descends — the same
 * keys that walk/jump/crouch use, re-mapped for flight without re-binding.
 */
export function resolveFreeFlightIntent(
  keys: MovementKeysState,
  analog: AnalogMoveIntent | null | undefined,
): FreeFlightIntent {
  let forward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  let right = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  if (analog !== undefined && analog !== null) {
    forward = Math.abs(analog.forward) < ANALOG_EPSILON ? 0 : Math.max(-1, Math.min(1, analog.forward));
    right = Math.abs(analog.right) < ANALOG_EPSILON ? 0 : Math.max(-1, Math.min(1, analog.right));
  }
  const vertical = (keys.space ? 1 : 0) - (keys.control || keys.c ? 1 : 0);
  const sprint = keys.shift && vertical >= 0;
  const moving = forward !== 0 || right !== 0 || vertical !== 0;
  return { forward, right, vertical, sprint, moving };
}

/**
 * Advance one frame of free-flight kinematics.
 * Horizontal uses yaw-relative strafe (A = left, D = right) — never roll/bank.
 * Vertical is independent of pitch unless `alignWithLook` is true (spectator).
 */
export function advanceFreeFlight(
  state: FreeFlightState,
  intent: FreeFlightIntent,
  yaw: number,
  pitch: number | undefined,
  dt: number,
  tuning: FreeFlightTuning,
): FreeFlightStep {
  const delta = Math.min(dt, MOVEMENT_TUNING.maxFrameSeconds);
  if (delta <= 0) return { stepX: 0, stepY: 0, stepZ: 0 };
  const speed = tuning.speed ?? 8;
  const verticalSpeed = tuning.verticalSpeed ?? speed;
  const sprintMult = tuning.sprintMultiplier ?? 1.8;
  const accel = tuning.acceleration ?? 20;
  const damping = tuning.damping ?? 0;
  const gravity = tuning.gravity ?? 0;
  const thrust = tuning.thrust ?? 32;
  const maxFall = tuning.maxFallSpeed ?? 20;
  const align = tuning.alignWithLook === true && pitch !== undefined;

  const sprintScale = intent.sprint ? sprintMult : 1;

  let targetX = 0;
  let targetZ = 0;
  let targetY = 0;

  if (align) {
    const cp = Math.cos(pitch!);
    const sp = Math.sin(pitch!);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const fx = sy * cp;
    const fy = sp;
    const fz = cy * cp;
    const rx = cy;
    const rz = -sy;
    const rawX = fx * intent.forward + rx * intent.right;
    const rawY = fy * intent.forward;
    const rawZ = fz * intent.forward + rz * intent.right;
    const hLen = Math.hypot(rawX, rawY, rawZ);
    if (hLen > 1e-6) {
      const scale = Math.min(1, hLen) / hLen;
      const sx = rawX * scale;
      const sy2 = rawY * scale;
      const sz = rawZ * scale;
      const horizScale = speed * sprintScale;
      const vertScale = verticalSpeed * sprintScale;
      targetX = sx * horizScale;
      targetY = sy2 * horizScale + intent.vertical * vertScale;
      targetZ = sz * horizScale;
    } else {
      targetY = intent.vertical * verticalSpeed * sprintScale;
    }
  } else {
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    let fx = sy;
    let fz = cy;
    const lenSq = fx * fx + fz * fz;
    if (lenSq < 1e-6) {
      fx = 0;
      fz = -1;
    } else {
      const inv = 1 / Math.sqrt(lenSq);
      fx *= inv;
      fz *= inv;
    }
    const rx = -fz;
    const rz = fx;
    let rawX = fx * intent.forward + rx * intent.right;
    let rawZ = fz * intent.forward + rz * intent.right;
    const len = Math.hypot(rawX, rawZ);
    if (len > 1e-6) {
      const scale = Math.min(1, len) / len;
      rawX *= scale;
      rawZ *= scale;
    } else {
      rawX = 0;
      rawZ = 0;
    }
    targetX = rawX * speed * sprintScale;
    targetZ = rawZ * speed * sprintScale;
    targetY = intent.vertical * verticalSpeed * sprintScale;
  }

  if (gravity > 0) {
    const alpha = 1 - Math.exp(-accel * delta);
    state.vx += (targetX - state.vx) * alpha;
    state.vz += (targetZ - state.vz) * alpha;
    if (damping > 0 && !intent.moving) {
      const damp = Math.exp(-damping * delta);
      state.vx *= damp;
      state.vz *= damp;
    }
    const thrustAccel = intent.vertical * thrust;
    state.vy += (thrustAccel - gravity) * delta;
    if (intent.vertical !== 0) {
      const vyTarget = targetY;
      const vyAlpha = 1 - Math.exp(-accel * delta);
      state.vy += (vyTarget - state.vy) * vyAlpha * 0.5;
    }
    if (damping > 0 && intent.vertical === 0) {
      state.vy *= Math.exp(-damping * delta * 0.5);
    }
    if (state.vy < -maxFall) state.vy = -maxFall;
  } else {
    const alpha = 1 - Math.exp(-accel * delta);
    state.vx += (targetX - state.vx) * alpha;
    state.vy += (targetY - state.vy) * alpha;
    state.vz += (targetZ - state.vz) * alpha;
    if (damping > 0 && !intent.moving) {
      const damp = Math.exp(-damping * delta);
      state.vx *= damp;
      state.vy *= damp;
      state.vz *= damp;
    }
  }

  return { stepX: state.vx * delta, stepY: state.vy * delta, stepZ: state.vz * delta };
}

/** Resolve a flight step against world solids (XZ slide + Y clamp). */
export function resolveFlightStep(
  position: readonly [number, number, number],
  stepX: number,
  stepY: number,
  stepZ: number,
  obstacles: readonly CollisionObstacle[],
  radius: number = DEFAULT_OBSTACLE_PLAYER_RADIUS,
): { stepX: number; stepY: number; stepZ: number } {
  const feetY = position[1];
  const headY = feetY + 1.8;
  let clampedY = stepY;
  const nextY = feetY + stepY;
  const nextHead = nextY + 1.8;
  for (const ob of obstacles) {
    const ox = ob.position[0] + (ob.offset?.[0] ?? 0);
    const oy = ob.position[1] + (ob.offset?.[1] ?? 0);
    const oz = ob.position[2] + (ob.offset?.[2] ?? 0);
    const hx = ob.halfExtents?.[0] ?? 0.5;
    const hy = ob.halfExtents?.[1] ?? 0.5;
    const hz = ob.halfExtents?.[2] ?? 0.5;
    if (ob.boxes !== undefined && ob.boxes.length > 0) {
      for (const box of ob.boxes) {
        const minX = ox + box.min[0] - radius;
        const maxX = ox + box.max[0] + radius;
        const minY = oy + box.min[1];
        const maxY = oy + box.max[1];
        const minZ = oz + box.min[2] - radius;
        const maxZ = oz + box.max[2] + radius;
        const insideXZ = position[0] > minX && position[0] < maxX && position[2] > minZ && position[2] < maxZ;
        if (!insideXZ) continue;
        if (stepY > 0 && feetY < maxY && nextHead > minY && nextHead > maxY && feetY < minY) {
          clampedY = Math.min(clampedY, minY - headY - 1e-3);
        } else if (stepY < 0 && headY > minY && nextY < maxY && nextY < minY && headY > maxY) {
          clampedY = Math.max(clampedY, maxY - feetY + 1e-3);
        }
      }
      continue;
    }
    const minX = ox - hx - radius;
    const maxX = ox + hx + radius;
    const minY = oy - hy;
    const maxY = oy + hy;
    const minZ = oz - hz - radius;
    const maxZ = oz + hz + radius;
    const insideXZ = position[0] > minX && position[0] < maxX && position[2] > minZ && position[2] < maxZ;
    if (!insideXZ) continue;
    if (stepY > 0 && feetY < maxY && nextHead > minY && nextHead > maxY && feetY < minY) {
      clampedY = Math.min(clampedY, minY - headY - 1e-3);
    } else if (stepY < 0 && headY > minY && nextY < maxY && nextY < minY && headY > maxY) {
      clampedY = Math.max(clampedY, maxY - feetY + 1e-3);
    }
  }
  return { stepX, stepY: clampedY, stepZ };
}

/**
 * Totally free flight for any actor — character, camera, drone, or debug rig.
 * Horizontal is always yaw-relative strafe; vertical is jump/crouch. Use `alignWithLook`
 * for a 6DOF spectator that flies where the camera looks.
 * @capability free-flight camera-relative creative/spectator/noclip/hover flight with correct strafe, sprint, and optional gravity
 */
export function createFreeFlightController(
  initialTuning: FreeFlightTuning,
  options: { yaw?: number; pitch?: number; state?: FreeFlightState } = {},
): FreeFlightController {
  let tuning = initialTuning;
  const state: FreeFlightState = options.state !== undefined ? { ...options.state } : createFreeFlightState();
  let yaw = options.yaw ?? 0;
  let pitch = options.pitch ?? 0;

  return {
    tick(dt, intent, nextYaw, nextPitch) {
      yaw = nextYaw;
      if (nextPitch !== undefined) pitch = nextPitch;
      return advanceFreeFlight(state, intent, yaw, pitch, dt, tuning);
    },
    velocity: () => [state.vx, state.vy, state.vz],
    snapshot: () => ({ ...state }),
    restore(next) {
      state.vx = next.vx;
      state.vy = next.vy;
      state.vz = next.vz;
    },
    retune(next) {
      tuning = next;
    },
    reset() {
      state.vx = 0;
      state.vy = 0;
      state.vz = 0;
    },
  };
}

/** Preset for Minecraft-like creative flight — weightless, collides, yaw-relative strafe. */
export const CREATIVE_FLIGHT_TUNING: FreeFlightTuning = {
  mode: "creative",
  speed: 8,
  verticalSpeed: 8,
  sprintMultiplier: 2.2,
  acceleration: 22,
  collide: true,
};

/** Preset for spectator — weightless, noclips, flies where the camera looks. */
export const SPECTATOR_FLIGHT_TUNING: FreeFlightTuning = {
  mode: "spectator",
  speed: 12,
  verticalSpeed: 12,
  sprintMultiplier: 2.5,
  acceleration: 18,
  collide: false,
  alignWithLook: true,
};

/** Preset for noclip — weightless, noclips, yaw-relative with independent vertical. */
export const NOCLIP_FLIGHT_TUNING: FreeFlightTuning = {
  mode: "noclip",
  speed: 14,
  verticalSpeed: 14,
  sprintMultiplier: 3,
  acceleration: 18,
  collide: false,
  alignWithLook: false,
};

/** Preset for hover/jetpack — gravity + thrust, useful for short bursts. */
export const HOVER_FLIGHT_TUNING: FreeFlightTuning = {
  mode: "hover",
  speed: 6,
  verticalSpeed: 6,
  sprintMultiplier: 1.6,
  acceleration: 16,
  gravity: 18,
  thrust: 34,
  collide: true,
};
