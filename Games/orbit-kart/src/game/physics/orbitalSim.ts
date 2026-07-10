import type { AsteroidObstacle, Planetoid, Vec2 } from "../cluster/catalog";

export const KART_RADIUS = 1.1;
export const GRAVITY_CONST = 34;
export const THRUST_ACCEL = 9.5;
export const RETRO_ACCEL = 4.2;
export const ROTATE_SPEED = 3.4;
export const MAX_SPEED = 26;
export const LINEAR_DRAG_PER_SECOND = 0.05;
export const SLING_MAX_SPEED = MAX_SPEED * 1.6;
export const PLANETOID_BOUNCE_RESTITUTION = 0.55;
export const PLANETOID_BOUNCE_LOSS = 0.7;
export const ASTEROID_BOUNCE_RESTITUTION = 0.4;
export const ASTEROID_BOUNCE_LOSS = 0.55;
export const MIN_PLANETOID_EJECT_SPEED = 6;
export const MIN_ASTEROID_EJECT_SPEED = 4;
export const WELL_CHARGE_RATE = 0.55;
export const DISCHARGE_MIN_ANGLE = (18 * Math.PI) / 180;
export const DISCHARGE_MAX_ANGLE = (80 * Math.PI) / 180;
export const DISCHARGE_BONUS_SCALE = 0.85;
export const RIBBON_STEPS = 40;
export const RIBBON_DT = 0.05;

export interface KartPhysicsState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  wellCharge: number;
  wellId: string | null;
}

export interface KartControlInput {
  thrust: boolean;
  retro: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
  discharge: boolean;
}

export const NEUTRAL_INPUT: KartControlInput = {
  thrust: false,
  retro: false,
  rotateLeft: false,
  rotateRight: false,
  discharge: false,
};

export interface StepResult {
  state: KartPhysicsState;
  collided: boolean;
  cleanSling: boolean;
  dischargeAttempted: boolean;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function spawnKartState(x: number, z: number, heading: number): KartPhysicsState {
  return { x, z, vx: 0, vz: 0, heading, wellCharge: 0, wellId: null };
}

export function gravityAt(x: number, z: number, planetoids: readonly Planetoid[]): Vec2 {
  let ax = 0;
  let az = 0;
  for (const planetoid of planetoids) {
    const dx = planetoid.position[0] - x;
    const dz = planetoid.position[1] - z;
    const dist = Math.hypot(dx, dz);
    if (dist <= 0 || dist > planetoid.wellRadius) continue;
    const clampedDist = Math.max(dist, planetoid.radius * 0.55);
    const g = (GRAVITY_CONST * planetoid.mass) / (clampedDist * clampedDist);
    ax += (dx / dist) * g;
    az += (dz / dist) * g;
  }
  return [ax, az];
}

export function currentWellId(x: number, z: number, planetoids: readonly Planetoid[]): string | null {
  let bestId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const planetoid of planetoids) {
    const dist = Math.hypot(planetoid.position[0] - x, planetoid.position[1] - z);
    if (dist <= planetoid.wellRadius && dist < bestDist) {
      bestDist = dist;
      bestId = planetoid.id;
    }
  }
  return bestId;
}

interface ResolvedMotion {
  x: number;
  z: number;
  vx: number;
  vz: number;
  collided: boolean;
}

function resolveCollisions(
  x: number,
  z: number,
  vx: number,
  vz: number,
  planetoids: readonly Planetoid[],
  asteroids: readonly AsteroidObstacle[],
): ResolvedMotion {
  let nx = x;
  let nz = z;
  let nvx = vx;
  let nvz = vz;
  let collided = false;

  for (const planetoid of planetoids) {
    const dx = nx - planetoid.position[0];
    const dz = nz - planetoid.position[1];
    const dist = Math.hypot(dx, dz);
    const minDist = planetoid.radius + KART_RADIUS;
    if (dist >= minDist || dist <= 0) continue;
    const nxu = dx / dist;
    const nzu = dz / dist;
    nx = planetoid.position[0] + nxu * minDist;
    nz = planetoid.position[1] + nzu * minDist;
    const vDotN = nvx * nxu + nvz * nzu;
    if (vDotN < 0) {
      nvx -= nxu * vDotN * (1 + PLANETOID_BOUNCE_RESTITUTION);
      nvz -= nzu * vDotN * (1 + PLANETOID_BOUNCE_RESTITUTION);
    }
    nvx *= PLANETOID_BOUNCE_LOSS;
    nvz *= PLANETOID_BOUNCE_LOSS;
    const outward = nvx * nxu + nvz * nzu;
    if (outward < MIN_PLANETOID_EJECT_SPEED) {
      const boost = MIN_PLANETOID_EJECT_SPEED - outward;
      nvx += nxu * boost;
      nvz += nzu * boost;
    }
    collided = true;
  }

  for (const asteroid of asteroids) {
    const dx = nx - asteroid.position[0];
    const dz = nz - asteroid.position[1];
    const dist = Math.hypot(dx, dz);
    const minDist = asteroid.radius + KART_RADIUS;
    if (dist >= minDist || dist <= 0) continue;
    const nxu = dx / dist;
    const nzu = dz / dist;
    nx = asteroid.position[0] + nxu * minDist;
    nz = asteroid.position[1] + nzu * minDist;
    const vDotN = nvx * nxu + nvz * nzu;
    if (vDotN < 0) {
      nvx -= nxu * vDotN * (1 + ASTEROID_BOUNCE_RESTITUTION);
      nvz -= nzu * vDotN * (1 + ASTEROID_BOUNCE_RESTITUTION);
    }
    nvx *= ASTEROID_BOUNCE_LOSS;
    nvz *= ASTEROID_BOUNCE_LOSS;
    const outwardAsteroid = nvx * nxu + nvz * nzu;
    if (outwardAsteroid < MIN_ASTEROID_EJECT_SPEED) {
      const boost = MIN_ASTEROID_EJECT_SPEED - outwardAsteroid;
      nvx += nxu * boost;
      nvz += nzu * boost;
    }
    collided = true;
  }

  return { x: nx, z: nz, vx: nvx, vz: nvz, collided };
}

export function advanceCoast(
  x: number,
  z: number,
  vx: number,
  vz: number,
  dt: number,
  planetoids: readonly Planetoid[],
  asteroids: readonly AsteroidObstacle[],
): ResolvedMotion {
  const [ax, az] = gravityAt(x, z, planetoids);
  const drag = Math.max(0, 1 - LINEAR_DRAG_PER_SECOND * dt);
  const freeVx = (vx + ax * dt) * drag;
  const freeVz = (vz + az * dt) * drag;
  const freeX = x + freeVx * dt;
  const freeZ = z + freeVz * dt;
  const resolved = resolveCollisions(freeX, freeZ, freeVx, freeVz, planetoids, asteroids);
  const speed = Math.hypot(resolved.vx, resolved.vz);
  if (speed <= MAX_SPEED) return resolved;
  const scale = MAX_SPEED / speed;
  return { ...resolved, vx: resolved.vx * scale, vz: resolved.vz * scale };
}

export function angleBetween(a: Vec2, b: Vec2): number {
  const la = Math.hypot(a[0], a[1]);
  const lb = Math.hypot(b[0], b[1]);
  if (la === 0 || lb === 0) return 0;
  const dot = clamp((a[0] * b[0] + a[1] * b[1]) / (la * lb), -1, 1);
  return Math.acos(dot);
}

export function isDischargeWindow(radial: Vec2, velocity: Vec2): boolean {
  const angle = angleBetween(radial, velocity);
  return angle >= DISCHARGE_MIN_ANGLE && angle <= DISCHARGE_MAX_ANGLE;
}

export function dischargeMultiplier(charge: number): number {
  return 1 + clamp(charge, 0, 1) * DISCHARGE_BONUS_SCALE;
}

export function stepKart(
  state: KartPhysicsState,
  input: KartControlInput,
  dt: number,
  planetoids: readonly Planetoid[],
  asteroids: readonly AsteroidObstacle[],
): StepResult {
  let heading = state.heading;
  if (input.rotateLeft) heading -= ROTATE_SPEED * dt;
  if (input.rotateRight) heading += ROTATE_SPEED * dt;

  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  let vx = state.vx;
  let vz = state.vz;
  if (input.thrust) {
    vx += forwardX * THRUST_ACCEL * dt;
    vz += forwardZ * THRUST_ACCEL * dt;
  }
  if (input.retro) {
    vx -= forwardX * RETRO_ACCEL * dt;
    vz -= forwardZ * RETRO_ACCEL * dt;
  }

  const resolved = advanceCoast(state.x, state.z, vx, vz, dt, planetoids, asteroids);

  const wellIdNow = currentWellId(resolved.x, resolved.z, planetoids);
  let wellCharge = wellIdNow !== null ? Math.min(1, state.wellCharge + WELL_CHARGE_RATE * dt) : 0;

  let finalVx = resolved.vx;
  let finalVz = resolved.vz;
  let cleanSling = false;
  let dischargeAttempted = false;

  if (input.discharge && wellIdNow !== null && wellCharge > 0) {
    dischargeAttempted = true;
    const planetoid = planetoids.find((p) => p.id === wellIdNow);
    if (planetoid !== undefined) {
      const radial: Vec2 = [resolved.x - planetoid.position[0], resolved.z - planetoid.position[1]];
      const velocity: Vec2 = [finalVx, finalVz];
      if (isDischargeWindow(radial, velocity)) {
        const multiplier = dischargeMultiplier(wellCharge);
        finalVx *= multiplier;
        finalVz *= multiplier;
        const speed = Math.hypot(finalVx, finalVz);
        if (speed > SLING_MAX_SPEED) {
          const scale = SLING_MAX_SPEED / speed;
          finalVx *= scale;
          finalVz *= scale;
        }
        cleanSling = true;
        wellCharge = 0;
      }
    }
  }

  return {
    state: {
      x: resolved.x,
      z: resolved.z,
      vx: finalVx,
      vz: finalVz,
      heading,
      wellCharge,
      wellId: wellIdNow,
    },
    collided: resolved.collided,
    cleanSling,
    dischargeAttempted,
  };
}

export function predictTrajectory(
  state: KartPhysicsState,
  planetoids: readonly Planetoid[],
  asteroids: readonly AsteroidObstacle[],
  steps: number = RIBBON_STEPS,
  dt: number = RIBBON_DT,
): readonly Vec2[] {
  const points: Vec2[] = [[state.x, state.z]];
  let x = state.x;
  let z = state.z;
  let vx = state.vx;
  let vz = state.vz;
  for (let i = 0; i < steps; i += 1) {
    const resolved = advanceCoast(x, z, vx, vz, dt, planetoids, asteroids);
    x = resolved.x;
    z = resolved.z;
    vx = resolved.vx;
    vz = resolved.vz;
    points.push([x, z]);
    if (resolved.collided) break;
  }
  return points;
}
