import type { AxisInput } from "@jgengine/core/input/axisInput";
import { DEFAULT_GRIP_CURVE, sampleGripCurve, type GripCurve } from "@jgengine/core/physics/vehicleBody";

import {
  BOOST_SPEED_MULTIPLIER,
  chargeDriftMeter,
  driftStyleFromSlip,
  initialDriftMeter,
  startBoost,
  tickBoost,
  type DriftMeterState,
} from "./driftMeter";

const METERS_PER_SECOND_TO_KMH = 3.6;
const DRIFT_MIN_SPEED = 3;
const DRIFT_MIN_SLIP = 0.18;
const DRIFT_MIN_STEER = 0.15;
const DRIFT_MIN_HANDBRAKE = 0.5;

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

export const DEFAULT_TUNING: VehicleTuning = {
  engineAccel: 20,
  brakeAccel: 28,
  topSpeed: 30,
  reverseSpeed: 9,
  turnRate: 2.2,
  turnSpeedRef: 7,
  grip: DEFAULT_GRIP_CURVE,
  gripStrength: 7,
  handbrakeGrip: 0.22,
};

export interface VehiclePose {
  position: readonly [number, number, number];
  heading: number;
  speedKmh: number;
  drifting: boolean;
  slip: number;
  driftMeter: DriftMeterState;
}

export interface VehicleController {
  tick(dt: number, axis: AxisInput, boostPressed: boolean): VehiclePose;
  resetTo(position: readonly [number, number, number], heading: number): void;
}

export function createVehicleController(
  spawn: { position: readonly [number, number, number]; heading: number },
  tuning: VehicleTuning = DEFAULT_TUNING,
): VehicleController {
  let x = spawn.position[0];
  let y = spawn.position[1];
  let z = spawn.position[2];
  let heading = spawn.heading;
  let vx = 0;
  let vz = 0;
  let driftMeter = initialDriftMeter();

  function forward(): [number, number] {
    return [Math.sin(heading), Math.cos(heading)];
  }

  return {
    tick(dt, axis, boostPressed) {
      const [fx0, fz0] = forward();
      const speed0 = vx * fx0 + vz * fz0;
      const steerScale = Math.min(1, Math.abs(speed0) / tuning.turnSpeedRef);
      const dir = speed0 >= 0 ? 1 : -1;
      heading += axis.steer * tuning.turnRate * steerScale * dir * dt;

      const [fx, fz] = forward();
      const boostMultiplier = driftMeter.boosting ? BOOST_SPEED_MULTIPLIER : 1;
      const topSpeed = tuning.topSpeed * boostMultiplier;

      let accel = 0;
      if (axis.throttle > 0 && speed0 < topSpeed) accel += axis.throttle * tuning.engineAccel * boostMultiplier;
      if (axis.brake > 0) {
        if (speed0 > 0.2) accel -= axis.brake * tuning.brakeAccel;
        else if (speed0 > -tuning.reverseSpeed) accel -= axis.brake * tuning.engineAccel;
      }
      vx += fx * accel * dt;
      vz += fz * accel * dt;

      const forwardSpeed = vx * fx + vz * fz;
      const lateralSpeed = -vx * fz + vz * fx;
      const slip = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 1);
      const handbrakeFactor = 1 - axis.handbrake * (1 - tuning.handbrakeGrip);
      const grip = sampleGripCurve(tuning.grip, slip) * handbrakeFactor;
      const keep = Math.max(0, 1 - grip * tuning.gripStrength * dt);
      const newLateral = lateralSpeed * keep;

      vx = fx * forwardSpeed - fz * newLateral;
      vz = fz * forwardSpeed + fx * newLateral;

      x += vx * dt;
      z += vz * dt;

      const drifting =
        axis.handbrake >= DRIFT_MIN_HANDBRAKE &&
        Math.abs(axis.steer) >= DRIFT_MIN_STEER &&
        Math.abs(forwardSpeed) >= DRIFT_MIN_SPEED &&
        slip >= DRIFT_MIN_SLIP;

      if (boostPressed) driftMeter = startBoost(driftMeter);
      driftMeter = driftMeter.boosting
        ? tickBoost(driftMeter, dt)
        : chargeDriftMeter(driftMeter, dt, drifting ? driftStyleFromSlip(slip) : 0);

      return {
        position: [x, y, z],
        heading,
        speedKmh: Math.abs(forwardSpeed) * METERS_PER_SECOND_TO_KMH,
        drifting,
        slip,
        driftMeter,
      };
    },
    resetTo(position, resetHeading) {
      x = position[0];
      y = position[1];
      z = position[2];
      heading = resetHeading;
      vx = 0;
      vz = 0;
      driftMeter = initialDriftMeter();
    },
  };
}
