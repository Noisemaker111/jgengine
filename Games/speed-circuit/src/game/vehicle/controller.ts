import type { AxisInput } from "@jgengine/core/input/axisInput";
import { steerYaw } from "@jgengine/core/movement/steering";
import { DEFAULT_GRIP_CURVE, sampleGripCurve, type GripCurve } from "@jgengine/core/physics/vehicleBody";

import { lateralOffset } from "../race/geometry";
import { TRACK_CENTERLINE, TRACK_WIDTH } from "../race/track";

const OFF_TRACK_GRIP = 0.4;
const OFF_TRACK_DAMPING_PER_SECOND = 1.4;
const METERS_PER_SECOND_TO_KMH = 3.6;

export interface VehicleTuning {
  engineAccel: number;
  brakeAccel: number;
  topSpeed: number;
  reverseSpeed: number;
  turnRate: number;
  turnSpeedRef: number;
  grip: GripCurve;
  gripStrength: number;
  handbrakeGrip: number;
}

const DEFAULT_TUNING: VehicleTuning = {
  engineAccel: 22,
  brakeAccel: 30,
  topSpeed: 34,
  reverseSpeed: 9,
  turnRate: 2.0,
  turnSpeedRef: 8,
  grip: DEFAULT_GRIP_CURVE,
  gripStrength: 8,
  handbrakeGrip: 0.25,
};

export interface VehiclePose {
  position: readonly [number, number, number];
  heading: number;
  speedKmh: number;
  offTrack: boolean;
}

export interface VehicleController {
  tick(dt: number, axis: AxisInput): VehiclePose;
  resetTo(position: readonly [number, number, number], heading: number): void;
}

function isOffTrack(x: number, z: number): boolean {
  return lateralOffset([x, z], TRACK_CENTERLINE) > TRACK_WIDTH / 2;
}

export function createVehicleController(
  spawn: { position: readonly [number, number, number]; heading: number },
  tuning: VehicleTuning = DEFAULT_TUNING,
): VehicleController {
  let x = spawn.position[0];
  const y = spawn.position[1];
  let z = spawn.position[2];
  let heading = spawn.heading;
  let vx = 0;
  let vz = 0;

  function forward(): [number, number] {
    return [Math.sin(heading), Math.cos(heading)];
  }

  return {
    tick(dt, axis) {
      const [fx0, fz0] = forward();
      const speed = vx * fx0 + vz * fz0;
      const steerScale = Math.min(1, Math.abs(speed) / tuning.turnSpeedRef);
      const dir = speed >= 0 ? 1 : -1;
      heading = steerYaw(heading, axis.steer * steerScale * dir, tuning.turnRate, dt);

      const [fx, fz] = forward();
      let accel = 0;
      if (axis.throttle > 0 && speed < tuning.topSpeed) accel += axis.throttle * tuning.engineAccel;
      if (axis.brake > 0) {
        if (speed > 0.2) accel -= axis.brake * tuning.brakeAccel;
        else if (speed > -tuning.reverseSpeed) accel -= axis.brake * tuning.engineAccel;
      }
      vx += fx * accel * dt;
      vz += fz * accel * dt;

      const forwardSpeed = vx * fx + vz * fz;
      const lateralSpeed = -vx * fz + vz * fx;
      const offTrack = isOffTrack(x, z);
      const surface = offTrack ? OFF_TRACK_GRIP : 1;
      const slip = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 1);
      const handbrakeFactor = 1 - axis.handbrake * (1 - tuning.handbrakeGrip);
      const grip = sampleGripCurve(tuning.grip, slip) * surface * handbrakeFactor;
      const keep = Math.max(0, 1 - grip * tuning.gripStrength * dt);
      const newLateral = lateralSpeed * keep;

      vx = fx * forwardSpeed - fz * newLateral;
      vz = fz * forwardSpeed + fx * newLateral;

      if (offTrack) {
        const damp = Math.max(0, 1 - OFF_TRACK_DAMPING_PER_SECOND * dt);
        vx *= damp;
        vz *= damp;
      }

      x += vx * dt;
      z += vz * dt;

      return {
        position: [x, y, z],
        heading,
        speedKmh: Math.abs(vx * fx + vz * fz) * METERS_PER_SECOND_TO_KMH,
        offTrack,
      };
    },
    resetTo(position, resetHeading) {
      x = position[0];
      z = position[2];
      heading = resetHeading;
      vx = 0;
      vz = 0;
    },
  };
}
