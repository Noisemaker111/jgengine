export interface BlastSource {
  x: number;
  z: number;
}

export interface BlastTarget {
  x: number;
  z: number;
}

export interface BlastConfig {
  radius: number;
  power: number;
}

export interface BlastImpulse {
  vx: number;
  vz: number;
  falloff: number;
}

const FALLBACK_DIRECTION: readonly [number, number] = [0, 1];

export function computeBlastImpulse(source: BlastSource, target: BlastTarget, config: BlastConfig): BlastImpulse | null {
  const dx = target.x - source.x;
  const dz = target.z - source.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= config.radius) return null;
  const falloff = 1 - dist / config.radius;
  const magnitude = config.power * falloff;
  const [dirX, dirZ] = dist > 1e-4 ? [dx / dist, dz / dist] : FALLBACK_DIRECTION;
  return { vx: dirX * magnitude, vz: dirZ * magnitude, falloff };
}

export interface Movable {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export function applyBlastImpulse<T extends Movable>(source: BlastSource, target: T, config: BlastConfig): T {
  const impulse = computeBlastImpulse(source, target, config);
  if (impulse === null) return target;
  return { ...target, vx: target.vx + impulse.vx, vz: target.vz + impulse.vz };
}
