import { steerYaw, yawRight } from "@jgengine/core/movement/steering";

import type { DroneAxes } from "./input";

export interface DroneSpawn {
  position: readonly [number, number, number];
  heading: number;
}

export interface DronePose {
  position: readonly [number, number, number];
  heading: number;
  pitchVisual: number;
  rollVisual: number;
  speed: number;
  verticalSpeed: number;
  velocityX: number;
  velocityZ: number;
  climbing: boolean;
  throttleMagnitude: number;
}

export interface DroneTuning {
  yawRate: number;
  forwardThrust: number;
  strafeThrust: number;
  verticalThrust: number;
  boostMultiplier: number;
  dragPerSecond: number;
  maxSpeed: number;
  maxSpeedBoost: number;
  minAltitude: number;
  windAccel: number;
  visualTiltRate: number;
}

export const DEFAULT_DRONE_TUNING: DroneTuning = {
  yawRate: 2.2,
  forwardThrust: 26,
  strafeThrust: 18,
  verticalThrust: 14,
  boostMultiplier: 1.9,
  dragPerSecond: 1.6,
  maxSpeed: 34,
  maxSpeedBoost: 46,
  minAltitude: 0.4,
  windAccel: 0.6,
  visualTiltRate: 8,
};

export interface DroneController {
  tick(dt: number, axes: DroneAxes, wind: readonly [number, number]): DronePose;
  resetTo(position: readonly [number, number, number], heading: number): void;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function createDroneController(spawn: DroneSpawn, tuning: DroneTuning = DEFAULT_DRONE_TUNING): DroneController {
  let x = spawn.position[0];
  let y = spawn.position[1];
  let z = spawn.position[2];
  let heading = spawn.heading;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  let pitchVisual = 0;
  let rollVisual = 0;

  return {
    tick(dt, axes, wind) {
      heading = steerYaw(heading, axes.yaw, tuning.yawRate, dt);
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const [rx, rz] = yawRight(heading);

      const boostMul = axes.boost ? tuning.boostMultiplier : 1;
      const forwardAccel = axes.pitch * tuning.forwardThrust * boostMul;
      const strafeAccel = axes.strafe * tuning.strafeThrust * boostMul;
      const verticalAccel = axes.throttle * tuning.verticalThrust * boostMul;

      vx += (fx * forwardAccel + rx * strafeAccel) * dt;
      vz += (fz * forwardAccel + rz * strafeAccel) * dt;
      vy += verticalAccel * dt;

      vx += wind[0] * tuning.windAccel * dt;
      vz += wind[1] * tuning.windAccel * dt;

      const drag = Math.max(0, 1 - tuning.dragPerSecond * dt);
      vx *= drag;
      vy *= drag;
      vz *= drag;

      const horizontalSpeed = Math.hypot(vx, vz);
      const maxSpeed = axes.boost ? tuning.maxSpeedBoost : tuning.maxSpeed;
      if (horizontalSpeed > maxSpeed) {
        const scale = maxSpeed / horizontalSpeed;
        vx *= scale;
        vz *= scale;
      }

      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      if (y < tuning.minAltitude) {
        y = tuning.minAltitude;
        vy = Math.max(0, vy);
      }

      const targetPitch = clamp(-axes.pitch * 0.5, -0.5, 0.5);
      const targetRoll = clamp(-axes.strafe * 0.45, -0.45, 0.45);
      const tiltBlend = Math.min(1, tuning.visualTiltRate * dt);
      pitchVisual += (targetPitch - pitchVisual) * tiltBlend;
      rollVisual += (targetRoll - rollVisual) * tiltBlend;

      return {
        position: [x, y, z],
        heading,
        pitchVisual,
        rollVisual,
        speed: Math.hypot(vx, vz),
        verticalSpeed: vy,
        velocityX: vx,
        velocityZ: vz,
        climbing: vy > 0.1,
        throttleMagnitude: Math.min(1, (Math.abs(axes.throttle) + Math.hypot(axes.pitch, axes.strafe)) / 2),
      };
    },
    resetTo(position, resetHeading) {
      x = position[0];
      y = position[1];
      z = position[2];
      heading = resetHeading;
      vx = 0;
      vy = 0;
      vz = 0;
      pitchVisual = 0;
      rollVisual = 0;
    },
  };
}
