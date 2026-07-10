import { DEFAULT_GRIP_CURVE, sampleGripCurve } from "@jgengine/core/physics/vehicleBody";

import { blockedZ } from "../route/gates";
import type { KartTuning } from "../parts/build";

const METERS_PER_SECOND_TO_KMH = 3.6;
const GRAVITY = 22;
const STUB_HOP_IMPULSE = 3.2;
const BRACE_ACCEL_BONUS = 0.18;
const BRACE_TURN_PENALTY = 0.25;
const GRIP_STRENGTH = 7;
const TURN_SPEED_REF = 6;
const ROLLING_DRAG = 3.5;

export interface DriveAxis {
  throttle: number;
  brake: number;
  steer: number;
}

export interface VehiclePose {
  position: readonly [number, number, number];
  heading: number;
  speedKmh: number;
  airborne: boolean;
  blockedByGate: boolean;
}

export interface VehicleController {
  tick(
    dt: number,
    axis: DriveAxis,
    tuning: KartTuning,
    input: { jumpPressed: boolean; plowBracing: boolean },
    groundHeightAt: (x: number, z: number) => number,
  ): VehiclePose;
  resetTo(position: readonly [number, number, number], heading: number): void;
}

export function createVehicleController(spawn: {
  position: readonly [number, number, number];
  heading: number;
}): VehicleController {
  let x = spawn.position[0];
  let z = spawn.position[2];
  let heading = spawn.heading;
  let vx = 0;
  let vz = 0;
  let airOffset = 0;
  let verticalVelocity = 0;

  function forward(): [number, number] {
    return [Math.sin(heading), Math.cos(heading)];
  }

  return {
    tick(dt, axis, tuning, input, groundHeightAt) {
      const brace = input.plowBracing && tuning.hasPlow;
      const accel = brace ? tuning.engineAccel * (1 + BRACE_ACCEL_BONUS) : tuning.engineAccel;
      const topSpeed = brace ? tuning.topSpeed * (1 + BRACE_ACCEL_BONUS) : tuning.topSpeed;
      const turnRate = brace ? tuning.turnRate * (1 - BRACE_TURN_PENALTY) : tuning.turnRate;

      const [fx0, fz0] = forward();
      const speed0 = vx * fx0 + vz * fz0;
      const steerScale = Math.min(1, Math.abs(speed0) / TURN_SPEED_REF);
      const dir = speed0 >= 0 ? 1 : -1;
      heading += axis.steer * turnRate * steerScale * dir * dt;

      const [fx, fz] = forward();
      let drive = 0;
      if (axis.throttle > 0 && speed0 < topSpeed) drive += axis.throttle * accel;
      if (axis.brake > 0) {
        if (speed0 > 0.2) drive -= axis.brake * accel * 1.3;
        else if (speed0 > -topSpeed * 0.35) drive -= axis.brake * accel * 0.6;
      } else if (axis.throttle <= 0 && Math.abs(speed0) > 0.05) {
        drive -= Math.sign(speed0) * Math.min(Math.abs(speed0) / dt, ROLLING_DRAG);
      }
      vx += fx * drive * dt;
      vz += fz * drive * dt;

      const forwardSpeed = vx * fx + vz * fz;
      const lateralSpeed = -vx * fz + vz * fx;
      const slip = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 1);
      const grip = sampleGripCurve(DEFAULT_GRIP_CURVE, slip);
      const keep = Math.max(0, 1 - grip * GRIP_STRENGTH * dt);
      const newLateral = lateralSpeed * keep;
      vx = fx * forwardSpeed - fz * newLateral;
      vz = fz * forwardSpeed + fx * newLateral;

      const candidateX = x + vx * dt;
      const candidateZ = z + vz * dt;
      const allowedZ = blockedZ(candidateX, z, candidateZ, tuning);
      const blockedByGate = allowedZ < candidateZ - 1e-6;
      if (blockedByGate) vz = 0;
      x = candidateX;
      z = Math.min(candidateZ, allowedZ);

      if (input.jumpPressed && airOffset <= 0.01) {
        verticalVelocity = STUB_HOP_IMPULSE + tuning.jumpPower;
      }
      if (airOffset > 0 || verticalVelocity > 0) {
        verticalVelocity -= GRAVITY * dt;
        airOffset += verticalVelocity * dt;
        if (airOffset <= 0) {
          airOffset = 0;
          verticalVelocity = 0;
        }
      }

      const groundY = groundHeightAt(x, z);
      return {
        position: [x, groundY + airOffset, z],
        heading,
        speedKmh: Math.abs(forwardSpeed) * METERS_PER_SECOND_TO_KMH,
        airborne: airOffset > 0,
        blockedByGate,
      };
    },
    resetTo(position, resetHeading) {
      x = position[0];
      z = position[2];
      heading = resetHeading;
      vx = 0;
      vz = 0;
      airOffset = 0;
      verticalVelocity = 0;
    },
  };
}
