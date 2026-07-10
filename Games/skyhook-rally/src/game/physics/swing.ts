import { yawRight } from "@jgengine/core/movement/steering";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const APEX_WINDOW_SECONDS = 0.35;

export interface ApexDetector {
  prevSpeed: number;
  prevDelta: number;
  windowRemaining: number;
}

export function createApexDetector(): ApexDetector {
  return { prevSpeed: 0, prevDelta: 0, windowRemaining: 0 };
}

export function advanceApex(detector: ApexDetector, speed: number, dt: number): ApexDetector {
  const delta = speed - detector.prevSpeed;
  let windowRemaining = Math.max(0, detector.windowRemaining - dt);
  if (detector.prevDelta > 0 && delta <= 0) windowRemaining = APEX_WINDOW_SECONDS;
  return { prevSpeed: speed, prevDelta: delta, windowRemaining };
}

export function isApexOpen(detector: ApexDetector): boolean {
  return detector.windowRemaining > 0;
}

export function vecLength(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export interface SwingState {
  position: Vec3;
  velocity: Vec3;
  attached: boolean;
  anchor: Vec3 | null;
  ropeLength: number;
  apex: ApexDetector;
}

export function createSwingState(position: Vec3): SwingState {
  return {
    position,
    velocity: { x: 0, y: 0, z: 0 },
    attached: false,
    anchor: null,
    ropeLength: 0,
    apex: createApexDetector(),
  };
}

/**
 * One physics step: gravity + integration, then — while attached — a rigid-rope
 * constraint (project back onto the anchor sphere) and a radial-velocity
 * removal (only the tangential swing speed survives), matching a pendulum.
 * Apex detection only runs while attached, since "release at the apex" is a
 * swinging-only mechanic.
 */
export function stepSwing(state: SwingState, gravity: number, dt: number): SwingState {
  let vx = state.velocity.x;
  let vy = state.velocity.y + gravity * dt;
  let vz = state.velocity.z;
  let x = state.position.x + vx * dt;
  let y = state.position.y + vy * dt;
  let z = state.position.z + vz * dt;
  let apex = state.apex;

  if (state.attached && state.anchor !== null) {
    const dx = x - state.anchor.x;
    const dy = y - state.anchor.y;
    const dz = z - state.anchor.z;
    const dist = Math.hypot(dx, dy, dz) || 1e-6;
    const scale = state.ropeLength / dist;
    x = state.anchor.x + dx * scale;
    y = state.anchor.y + dy * scale;
    z = state.anchor.z + dz * scale;

    const rx = dx / dist;
    const ry = dy / dist;
    const rz = dz / dist;
    const radialSpeed = vx * rx + vy * ry + vz * rz;
    vx -= radialSpeed * rx;
    vy -= radialSpeed * ry;
    vz -= radialSpeed * rz;

    apex = advanceApex(state.apex, Math.hypot(vx, vy, vz), dt);
  }

  return {
    position: { x, y, z },
    velocity: { x: vx, y: vy, z: vz },
    attached: state.attached,
    anchor: state.anchor,
    ropeLength: state.ropeLength,
    apex,
  };
}

export function attachSwing(state: SwingState, anchor: Vec3, minRopeLength = 1.5): SwingState {
  const dist = Math.hypot(state.position.x - anchor.x, state.position.y - anchor.y, state.position.z - anchor.z);
  return {
    ...state,
    attached: true,
    anchor: { ...anchor },
    ropeLength: Math.max(minRopeLength, dist),
    apex: createApexDetector(),
  };
}

export function releaseSwing(state: SwingState): SwingState {
  return { ...state, attached: false, anchor: null, apex: createApexDetector() };
}

/** Gentle camera-relative lateral (A/D) and vertical (W/S) nudge while airborne. */
export function applyAirSteer(
  velocity: Vec3,
  yaw: number,
  steer: number,
  pitch: number,
  dt: number,
  steerAccel: number,
  pitchAccel: number,
): Vec3 {
  if (steer === 0 && pitch === 0) return velocity;
  const [rightX, rightZ] = yawRight(yaw);
  return {
    x: velocity.x + rightX * steer * steerAccel * dt,
    y: velocity.y + pitch * pitchAccel * dt,
    z: velocity.z + rightZ * steer * steerAccel * dt,
  };
}

/** Ballistic projection under constant gravity, using the same integration scheme as `stepSwing`'s free-fall branch — the route ribbon and the runtime physics never disagree. */
export function predictTrajectory(position: Vec3, velocity: Vec3, gravity: number, dt: number, steps: number): Vec3[] {
  const points: Vec3[] = [];
  let p = { ...position };
  let v = { ...velocity };
  for (let i = 0; i < steps; i += 1) {
    v = { x: v.x, y: v.y + gravity * dt, z: v.z };
    p = { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt };
    points.push(p);
  }
  return points;
}

export function isBelowCloudLayer(y: number, triggerY: number): boolean {
  return y < triggerY;
}

export function forwardVector(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return { x: Math.sin(yaw) * cosPitch, y: Math.sin(pitch), z: Math.cos(yaw) * cosPitch };
}
