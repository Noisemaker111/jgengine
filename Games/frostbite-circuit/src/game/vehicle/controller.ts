import type { AxisInput } from "@jgengine/core/input/axisInput";
import { steerYaw } from "@jgengine/core/movement/steering";
import { sampleGripCurve, type GripCurve } from "@jgengine/core/physics/vehicleBody";

const METERS_PER_SECOND_TO_KMH = 3.6;

export interface SledTuning {
  engineAccel: number;
  brakeAccel: number;
  topSpeed: number;
  reverseSpeed: number;
  turnRate: number;
  turnSpeedRef: number;
  grip: GripCurve;
  gripStrength: number;
  handbrakeGrip: number;
  rollingResistance: number;
}

export const ICE_GRIP_CURVE: GripCurve = {
  points: [
    [0, 0.62],
    [0.15, 0.58],
    [0.4, 0.34],
    [1, 0.16],
  ],
};

export const DEFAULT_SLED_TUNING: SledTuning = {
  engineAccel: 15,
  brakeAccel: 18,
  topSpeed: 24,
  reverseSpeed: 7,
  turnRate: 1.9,
  turnSpeedRef: 6,
  grip: ICE_GRIP_CURVE,
  gripStrength: 4.2,
  handbrakeGrip: 0.16,
  rollingResistance: 0.12,
};

export interface SledPose {
  position: readonly [number, number, number];
  heading: number;
  speedKmh: number;
  forwardSpeed: number;
  drifting: boolean;
  slip: number;
}

export interface SledController {
  tick(dt: number, axis: AxisInput): SledPose;
  resetTo(position: readonly [number, number, number], heading: number): void;
  pose(): SledPose;
}

const DRIFT_MIN_SPEED = 2.5;
const DRIFT_MIN_SLIP = 0.14;
const DRIFT_MIN_STEER = 0.12;

function forwardOf(heading: number): readonly [number, number] {
  return [Math.sin(heading), Math.cos(heading)];
}

export function createSledController(
  spawn: { position: readonly [number, number, number]; heading: number },
  tuning: SledTuning = DEFAULT_SLED_TUNING,
): SledController {
  let x = spawn.position[0];
  let y = spawn.position[1];
  let z = spawn.position[2];
  let heading = spawn.heading;
  let vx = 0;
  let vz = 0;
  let lastPose: SledPose = {
    position: [x, y, z],
    heading,
    speedKmh: 0,
    forwardSpeed: 0,
    drifting: false,
    slip: 0,
  };

  return {
    tick(dt, axis) {
      const [fx0, fz0] = forwardOf(heading);
      const speed0 = vx * fx0 + vz * fz0;
      const steerScale = Math.min(1, Math.abs(speed0) / tuning.turnSpeedRef);
      const dir = speed0 >= 0 ? 1 : -1;
      heading = steerYaw(heading, axis.steer * steerScale * dir, tuning.turnRate, dt);

      const [fx, fz] = forwardOf(heading);

      let accel = 0;
      if (axis.throttle > 0 && speed0 < tuning.topSpeed) accel += axis.throttle * tuning.engineAccel;
      if (axis.brake > 0) {
        if (speed0 > 0.2) accel -= axis.brake * tuning.brakeAccel;
        else if (speed0 > -tuning.reverseSpeed) accel -= axis.brake * tuning.engineAccel;
      }
      vx += fx * accel * dt;
      vz += fz * accel * dt;

      const forwardSpeed = vx * fx + vz * fz;
      const lateralSpeed = -vx * fz + vz * fx;
      const roll = Math.max(0, 1 - tuning.rollingResistance * dt);
      const rolled = forwardSpeed * roll;

      const slip = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 1);
      const handbrakeFactor = 1 - axis.handbrake * (1 - tuning.handbrakeGrip);
      const grip = sampleGripCurve(tuning.grip, slip) * handbrakeFactor;
      const keep = Math.max(0, 1 - grip * tuning.gripStrength * dt);
      const newLateral = lateralSpeed * keep;

      vx = fx * rolled - fz * newLateral;
      vz = fz * rolled + fx * newLateral;

      x += vx * dt;
      z += vz * dt;

      const drifting =
        axis.handbrake >= 0.4 &&
        Math.abs(axis.steer) >= DRIFT_MIN_STEER &&
        Math.abs(forwardSpeed) >= DRIFT_MIN_SPEED &&
        slip >= DRIFT_MIN_SLIP;

      lastPose = {
        position: [x, y, z],
        heading,
        speedKmh: Math.abs(forwardSpeed) * METERS_PER_SECOND_TO_KMH,
        forwardSpeed,
        drifting,
        slip,
      };
      return lastPose;
    },
    resetTo(position, resetHeading) {
      x = position[0];
      y = position[1];
      z = position[2];
      heading = resetHeading;
      vx = 0;
      vz = 0;
      lastPose = { position: [x, y, z], heading, speedKmh: 0, forwardSpeed: 0, drifting: false, slip: 0 };
    },
    pose() {
      return lastPose;
    },
  };
}
