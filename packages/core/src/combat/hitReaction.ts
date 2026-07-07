import type { EntityPosition } from "../scene/entityStore";

export interface CameraShake {
  amplitude: number;
  decay: number;
}

export interface HitReactionConfig {
  hitstopMs: number;
  knockback: number;
  vertical?: number;
  shake?: CameraShake;
}

export interface HitReactionInput {
  attackerPos: EntityPosition;
  targetPos: EntityPosition;
  power?: number;
}

export interface HitReaction {
  hitstopMs: number;
  impulse: [number, number, number];
  shake: CameraShake | null;
}

export function resolveHitReaction(config: HitReactionConfig, input: HitReactionInput): HitReaction {
  const power = input.power ?? 1;
  const dx = input.targetPos[0] - input.attackerPos[0];
  const dz = input.targetPos[2] - input.attackerPos[2];
  const planar = Math.hypot(dx, dz);
  const nx = planar === 0 ? 0 : dx / planar;
  const nz = planar === 0 ? 0 : dz / planar;
  const magnitude = config.knockback * power;
  const shake = config.shake === undefined
    ? null
    : { amplitude: config.shake.amplitude * power, decay: config.shake.decay };
  return {
    hitstopMs: config.hitstopMs,
    impulse: [nx * magnitude, (config.vertical ?? 0) * power, nz * magnitude],
    shake,
  };
}

export function applyImpulse(position: EntityPosition, impulse: [number, number, number]): EntityPosition {
  return [position[0] + impulse[0], position[1] + impulse[1], position[2] + impulse[2]];
}
