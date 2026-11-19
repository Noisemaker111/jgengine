import { motionStepSeconds, type AnalogMoveIntent, type CollisionObstacle, type MovementKeysState, type MotionFrameOptions } from "../movement/movementModel";
import { DEFAULT_OBSTACLE_PLAYER_RADIUS } from "../movement/movementModel";
import { sampleAxisBindings, type AxisBinding } from "../input/axisInput";
import type { PointerAxisState } from "../input/pointerAxis";
import type { ChaseCameraTuning } from "../runtime/cameraDirector";

export type FreeFlightMode = "creative" | "spectator" | "noclip" | "hover";

export interface FreeFlightBindings {
  forward?: AxisBinding;
  strafe?: AxisBinding;
  vertical?: AxisBinding;
  sprint?: AxisBinding;
}

export interface FreeFlightTuning {
  mode: FreeFlightMode;
  speed?: number | undefined;
  /** Vertical base speed for ascend/descend. Default = `speed`. */
  verticalSpeed?: number | undefined;
  sprintMultiplier?: number | undefined;
  acceleration?: number | undefined;
  damping?: number;
  gravity?: number | undefined;
  thrust?: number | undefined;
  alignWithLook?: boolean | undefined;
  maxFallSpeed?: number;
  collide?: boolean | undefined;
  bindings?: FreeFlightBindings | undefined;
  camera?: ChaseCameraTuning | null | undefined;
}

export interface FreeFlightState {
  vx: number;
  vy: number;
  vz: number;
}

export interface FreeFlightIntent {
  forward: number;
  right: number;
  vertical: number;
  sprint: boolean;
  moving: boolean;
}

export interface FreeFlightStep {
  stepX: number;
  stepY: number;
  stepZ: number;
}

export interface FreeFlightController {
  tick(dt: number, intent: FreeFlightIntent, yaw: number, pitch?: number): FreeFlightStep;
  velocity(): readonly [number, number, number];
  snapshot(): FreeFlightState;
  restore(next: FreeFlightState): void;
  retune(next: FreeFlightTuning): void;
  reset(): void;
}

const ANALOG_EPSILON = 0.02;

export function createFreeFlightState(): FreeFlightState {
  return { vx: 0, vy: 0, vz: 0 };
}

const DEFAULT_FORWARD_BINDING: AxisBinding = { positive: ["moveForward"], negative: ["moveBack"] };
const DEFAULT_STRAFE_BINDING: AxisBinding = { positive: ["moveRight"], negative: ["moveLeft"] };
const DEFAULT_VERTICAL_BINDING: AxisBinding = { positive: ["jump"], negative: ["crouch", "control", "c"] };
const DEFAULT_SPRINT_BINDING: AxisBinding = { positive: ["sprint"] };

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

export function resolveFreeFlightIntentFromInput(
  isDown: (action: string) => boolean,
  value: (action: string) => number,
  pointer: PointerAxisState | null,
  bindings?: FreeFlightBindings,
): FreeFlightIntent {
  const forwardBinding = bindings?.forward ?? DEFAULT_FORWARD_BINDING;
  const strafeBinding = bindings?.strafe ?? DEFAULT_STRAFE_BINDING;
  const verticalBinding = bindings?.vertical ?? DEFAULT_VERTICAL_BINDING;
  const sprintBinding = bindings?.sprint ?? DEFAULT_SPRINT_BINDING;
  const forward = sampleAxisBindings({ forward: forwardBinding }, isDown, pointer, undefined, value).forward;
  const right = sampleAxisBindings({ strafe: strafeBinding }, isDown, pointer, undefined, value).strafe;
  const vertical = sampleAxisBindings({ vertical: verticalBinding }, isDown, pointer, undefined, value).vertical;
  const sprintVal = sampleAxisBindings({ sprint: sprintBinding }, isDown, pointer, { sprint: { min: 0, max: 1 } }, value).sprint;
  const sprint = sprintVal > 0.5;
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
  options?: Pick<MotionFrameOptions, "authoritativeStep">,
): FreeFlightStep {
  const delta = motionStepSeconds(dt, options?.authoritativeStep);
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

/** @capability free-flight camera-relative creative/spectator/noclip/hover flight with correct strafe, sprint, and optional gravity */
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

export const CREATIVE_FLIGHT_TUNING: FreeFlightTuning = {
  mode: "creative",
  speed: 8,
  verticalSpeed: 8,
  sprintMultiplier: 2.2,
  acceleration: 22,
  collide: true,
};

export const SPECTATOR_FLIGHT_TUNING: FreeFlightTuning = {
  mode: "spectator",
  speed: 12,
  verticalSpeed: 12,
  sprintMultiplier: 2.5,
  acceleration: 18,
  collide: false,
  alignWithLook: true,
};

export const NOCLIP_FLIGHT_TUNING: FreeFlightTuning = {
  mode: "noclip",
  speed: 14,
  verticalSpeed: 14,
  sprintMultiplier: 3,
  acceleration: 18,
  collide: false,
  alignWithLook: false,
};

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
