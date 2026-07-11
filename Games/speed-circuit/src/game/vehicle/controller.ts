import type { AxisInput } from "@jgengine/core/input/axisInput";
import { DEFAULT_GRIP_CURVE, type GripCurve } from "@jgengine/core/physics/vehicleBody";
import { createKinematicVehicle } from "@jgengine/core/physics/kinematicVehicle";

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
  const y = spawn.position[1];
  const vehicle = createKinematicVehicle(tuning, {
    position: spawn.position,
    heading: spawn.heading,
    surfaceFriction: (x, z) => (isOffTrack(x, z) ? OFF_TRACK_GRIP : 1),
    dragAt: (x, z) => (isOffTrack(x, z) ? OFF_TRACK_DAMPING_PER_SECOND : 0),
  });

  return {
    tick(dt, axis) {
      const step = vehicle.tick(dt, axis);
      return {
        position: step.position,
        heading: step.heading,
        speedKmh: Math.abs(step.forwardSpeed) * METERS_PER_SECOND_TO_KMH,
        offTrack: step.surface < 1,
      };
    },
    resetTo(position, heading) {
      vehicle.resetTo([position[0], y, position[2]], heading);
    },
  };
}
