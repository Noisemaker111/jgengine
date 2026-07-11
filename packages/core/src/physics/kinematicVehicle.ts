import type { AxisInput } from "../input/axisInput";
import { steerYaw } from "../movement/steering";
import { DEFAULT_GRIP_CURVE, sampleGripCurve, type GripCurve } from "./vehicleBody";

export interface KinematicVehicleTuning {
  engineAccel: number;
  brakeAccel: number;
  topSpeed: number;
  reverseSpeed: number;
  turnRate: number;
  turnSpeedRef: number;
  grip?: GripCurve;
  gripStrength: number;
  handbrakeGrip: number;
  /** Forward-speed decay per second when coasting (sleds, boats); default `0`. */
  rollingResistance?: number;
}

export interface KinematicVehicleOptions {
  position?: readonly [number, number, number];
  heading?: number;
  /** Grip multiplier by world position — off-track gravel, ice patches; default `1` everywhere. */
  surfaceFriction?: (x: number, z: number) => number;
  /** Extra velocity damping per second by world position (rough ground drag); default `0`. */
  dragAt?: (x: number, z: number) => number;
}

export interface KinematicVehicleStep {
  position: readonly [number, number, number];
  heading: number;
  /** Signed speed along the heading, world units/s. */
  forwardSpeed: number;
  lateralSpeed: number;
  /** Lateral/forward slip ratio driving the grip curve — drift indicators key off it. */
  slip: number;
  /** The `surfaceFriction` sample used this tick (`< 1` = off the ideal surface). */
  surface: number;
}

/**
 * The pure-kinematic arcade car every racing game hand-rolled (#282.1): steer-yaw scaled by speed,
 * throttle/brake acceleration, and a grip-curve lateral-slip bleed — no `PhysicsWorld`, no wheels,
 * just the drift-friendly integration the three shipped racers proved out. Games keep their flavor
 * (drift meters, boost, off-track rules) via `surfaceFriction`/`dragAt` hooks and the returned slip.
 */
export interface KinematicVehicle {
  tick(dt: number, axis: AxisInput): KinematicVehicleStep;
  pose(): { position: readonly [number, number, number]; heading: number };
  velocity(): readonly [number, number];
  /** Scale the current velocity (boost pads, hard collisions). */
  scaleVelocity(factor: number): void;
  resetTo(position: readonly [number, number, number], heading: number): void;
}

export function createKinematicVehicle(
  tuning: KinematicVehicleTuning,
  options: KinematicVehicleOptions = {},
): KinematicVehicle {
  const grip = tuning.grip ?? DEFAULT_GRIP_CURVE;
  const rollingResistance = tuning.rollingResistance ?? 0;
  const surfaceFriction = options.surfaceFriction ?? (() => 1);
  const dragAt = options.dragAt ?? (() => 0);

  let x = options.position?.[0] ?? 0;
  let y = options.position?.[1] ?? 0;
  let z = options.position?.[2] ?? 0;
  let heading = options.heading ?? 0;
  let vx = 0;
  let vz = 0;

  function forward(): readonly [number, number] {
    return [Math.sin(heading), Math.cos(heading)];
  }

  return {
    tick(dt, axis) {
      const [fx0, fz0] = forward();
      const speed = vx * fx0 + vz * fz0;
      const steerScale = Math.min(1, Math.abs(speed) / tuning.turnSpeedRef);
      const direction = speed >= 0 ? 1 : -1;
      heading = steerYaw(heading, axis.steer * steerScale * direction, tuning.turnRate, dt);

      const [fx, fz] = forward();
      let accel = 0;
      if (axis.throttle > 0 && speed < tuning.topSpeed) accel += axis.throttle * tuning.engineAccel;
      if (axis.brake > 0) {
        if (speed > 0.2) accel -= axis.brake * tuning.brakeAccel;
        else if (speed > -tuning.reverseSpeed) accel -= axis.brake * tuning.engineAccel;
      }
      vx += fx * accel * dt;
      vz += fz * accel * dt;

      let forwardSpeed = vx * fx + vz * fz;
      const lateralSpeed = -vx * fz + vz * fx;
      const surface = surfaceFriction(x, z);
      const slip = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 1);
      const handbrakeFactor = 1 - axis.handbrake * (1 - tuning.handbrakeGrip);
      const gripValue = sampleGripCurve(grip, slip) * surface * handbrakeFactor;
      const keep = Math.max(0, 1 - gripValue * tuning.gripStrength * dt);
      const keptLateral = lateralSpeed * keep;
      if (rollingResistance > 0) forwardSpeed *= Math.max(0, 1 - rollingResistance * dt);

      vx = fx * forwardSpeed - fz * keptLateral;
      vz = fz * forwardSpeed + fx * keptLateral;

      const drag = dragAt(x, z);
      if (drag > 0) {
        const damp = Math.max(0, 1 - drag * dt);
        vx *= damp;
        vz *= damp;
      }

      x += vx * dt;
      z += vz * dt;

      return {
        position: [x, y, z],
        heading,
        forwardSpeed: vx * fx + vz * fz,
        lateralSpeed: keptLateral,
        slip,
        surface,
      };
    },
    pose: () => ({ position: [x, y, z], heading }),
    velocity: () => [vx, vz],
    scaleVelocity(factor) {
      vx *= factor;
      vz *= factor;
    },
    resetTo(position, nextHeading) {
      x = position[0];
      y = position[1];
      z = position[2];
      heading = nextHeading;
      vx = 0;
      vz = 0;
    },
  };
}
