import { PITCH_RX, PITCH_RZ, pitchBoundaryNormal } from "../arena/geometry";
import type { CraterInfluence } from "../craters/craterField";

export interface BallState {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface BallStepConfig {
  friction: number;
  craterFriction: number;
  craterPull: number;
  restSpeed: number;
}

export const DEFAULT_BALL_STEP_CONFIG: BallStepConfig = {
  friction: 0.55,
  craterFriction: 1.9,
  craterPull: 5.5,
  restSpeed: 0.05,
};

export function createRestingBall(x: number, z: number): BallState {
  return { x, z, vx: 0, vz: 0 };
}

export function stepBall(
  state: BallState,
  dt: number,
  craters: readonly CraterInfluence[],
  config: BallStepConfig = DEFAULT_BALL_STEP_CONFIG,
): BallState {
  if (dt <= 0) return state;
  let ax = 0;
  let az = 0;
  let frictionRate = config.friction;

  for (const crater of craters) {
    const dx = crater.x - state.x;
    const dz = crater.z - state.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= crater.radius) continue;
    const bowl = 1 - dist / crater.radius;
    const pull = config.craterPull * bowl * crater.depth;
    frictionRate += config.craterFriction * bowl * crater.depth;
    if (dist > 1e-4) {
      ax += (dx / dist) * pull;
      az += (dz / dist) * pull;
    }
  }

  let vx = state.vx + ax * dt;
  let vz = state.vz + az * dt;
  const decay = Math.max(0, 1 - frictionRate * dt);
  vx *= decay;
  vz *= decay;
  if (Math.hypot(vx, vz) < config.restSpeed) {
    vx = 0;
    vz = 0;
  }

  return { x: state.x + vx * dt, z: state.z + vz * dt, vx, vz };
}

export interface WallBounceConfig {
  restitution: number;
}

export const DEFAULT_WALL_BOUNCE_CONFIG: WallBounceConfig = { restitution: 0.55 };

export function bounceOffWall(
  state: BallState,
  config: WallBounceConfig = DEFAULT_WALL_BOUNCE_CONFIG,
): BallState {
  const nx2 = (state.x * state.x) / (PITCH_RX * PITCH_RX);
  const nz2 = (state.z * state.z) / (PITCH_RZ * PITCH_RZ);
  if (nx2 + nz2 <= 1) return state;
  const [nx, nz] = pitchBoundaryNormal(state.x, state.z);
  const scale = 1 / Math.sqrt(nx2 + nz2);
  const x = state.x * scale;
  const z = state.z * scale;
  const dot = state.vx * nx + state.vz * nz;
  const vx = (state.vx - 2 * dot * nx) * config.restitution;
  const vz = (state.vz - 2 * dot * nz) * config.restitution;
  return { x, z, vx, vz };
}
