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
  /** Optional higher-fidelity powertrain. Omit to preserve the direct arcade acceleration model. */
  powertrain?: KinematicPowertrainTuning;
  /** Optional bicycle-model steering with speed-sensitive lock and smoothed rack response. */
  steering?: KinematicSteeringTuning;
  /** Optional aerodynamic drag/downforce and electronic driver assists. */
  dynamics?: KinematicDynamicsTuning;
}

/** Data-first gearbox and torque-curve tuning for a kinematic ground vehicle. */
export interface KinematicPowertrainTuning {
  idleRpm: number;
  redlineRpm: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  shiftSeconds: number;
  finalDrive: number;
  wheelRadius: number;
  gears: readonly number[];
  torqueCurve: GripCurve;
}

/** Bicycle-model steering settings; all angles are radians. */
export interface KinematicSteeringTuning {
  wheelbase: number;
  maxAngle: number;
  highSpeedAngle: number;
  highSpeedAt: number;
  response: number;
  yawDamping?: number;
}

/** Aerodynamic and electronic-assist settings layered over tire grip. */
export interface KinematicDynamicsTuning {
  aerodynamicDrag?: number;
  downforce?: number;
  tractionControl?: number;
  abs?: number;
  stabilityControl?: number;
  bodyPitchFactor?: number;
  bodyRollFactor?: number;
  maxBodyPitch?: number;
  maxBodyRoll?: number;
  attitudeResponse?: number;
}

export interface KinematicVehicleOptions {
  position?: readonly [number, number, number];
  heading?: number;
  /** Grip multiplier by world position — off-track gravel, ice patches; default `1` everywhere. */
  surfaceFriction?: (x: number, z: number) => number;
  /** Extra velocity damping per second by world position (rough ground drag); default `0`. */
  dragAt?: (x: number, z: number) => number;
  /**
   * Veto or clamp a planar move before it commits — walls, closed gates, arena bounds. Given the
   * attempted `from`→`to` on the XZ plane, return the destination actually allowed; velocity is
   * rederived from the permitted displacement, so motion blocked on an axis stops on that axis
   * instead of grinding into the obstacle. Default: no clamp (the move always commits).
   */
  clampMove?: (
    from: readonly [number, number],
    to: readonly [number, number],
  ) => readonly [number, number];
}

/**
 * Per-tick multipliers layered over the base tuning — the transient overrides games apply for one
 * frame without rebuilding the vehicle: nitro/boost, a braced-plow bonus, or entering a speed zone or
 * slow field. Each defaults to `1` (no change), so passing nothing leaves the base tuning untouched.
 */
export interface KinematicVehicleModifiers {
  /** Scale top speed this tick (sustained boost, speed pads). */
  topSpeedScale?: number;
  /** Scale engine acceleration this tick (boost, brace bonus). */
  accelScale?: number;
  /** Scale turn rate this tick (brace penalty, heavy-load steering). */
  turnRateScale?: number;
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
  /** One-based forward gear, or `0` while reversing/neutral. */
  gear: number;
  rpm: number;
  steerAngle: number;
  yawRate: number;
  longitudinalAcceleration: number;
  tractionLimited: boolean;
  absActive: boolean;
  bodyPitch: number;
  bodyRoll: number;
}

/**
 * The pure-kinematic arcade car every racing game hand-rolled (#282.1): steer-yaw scaled by speed,
 * throttle/brake acceleration, and a grip-curve lateral-slip bleed — no `PhysicsWorld`, no wheels,
 * just the drift-friendly integration the three shipped racers proved out. Games keep their flavor
 * (drift meters, boost, off-track rules) via `surfaceFriction`/`dragAt` hooks and the returned slip.
 */
export interface KinematicVehicle {
  tick(dt: number, axis: AxisInput, modifiers?: KinematicVehicleModifiers): KinematicVehicleStep;
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
  const clampMove = options.clampMove;

  let x = options.position?.[0] ?? 0;
  let y = options.position?.[1] ?? 0;
  let z = options.position?.[2] ?? 0;
  let heading = options.heading ?? 0;
  let vx = 0;
  let vz = 0;
  let gearIndex = 0;
  let rpm = tuning.powertrain?.idleRpm ?? 0;
  let shiftRemaining = 0;
  let steerAngle = 0;
  let yawRate = 0;
  let previousForwardSpeed = 0;
  let bodyPitch = 0;
  let bodyRoll = 0;

  function forward(): readonly [number, number] {
    return [Math.sin(heading), Math.cos(heading)];
  }

  return {
    tick(dt, axis, modifiers) {
      const topSpeed = tuning.topSpeed * (modifiers?.topSpeedScale ?? 1);
      const engineAccel = tuning.engineAccel * (modifiers?.accelScale ?? 1);
      const turnRate = tuning.turnRate * (modifiers?.turnRateScale ?? 1);

      const [fx0, fz0] = forward();
      const speed = vx * fx0 + vz * fz0;
      if (tuning.steering === undefined) {
        const steerScale = Math.min(1, Math.abs(speed) / tuning.turnSpeedRef);
        const direction = speed >= 0 ? 1 : -1;
        heading = steerYaw(heading, axis.steer * steerScale * direction, turnRate, dt);
        yawRate = dt > 0 ? -axis.steer * steerScale * direction * turnRate : 0;
        steerAngle = axis.steer;
      } else {
        const steering = tuning.steering;
        const speedBlend = Math.min(1, Math.abs(speed) / Math.max(0.001, steering.highSpeedAt));
        const lock = steering.maxAngle + (steering.highSpeedAngle - steering.maxAngle) * speedBlend;
        const targetAngle = axis.steer * lock * (modifiers?.turnRateScale ?? 1);
        const response = 1 - Math.exp(-Math.max(0, steering.response) * Math.max(0, dt));
        steerAngle += (targetAngle - steerAngle) * response;
        const targetYaw = Math.abs(speed) < 0.05 ? 0 : -(speed / Math.max(0.1, steering.wheelbase)) * Math.tan(steerAngle);
        const yawResponse = 1 - Math.exp(-Math.max(0, steering.yawDamping ?? 10) * Math.max(0, dt));
        yawRate += (targetYaw - yawRate) * yawResponse;
        heading += yawRate * dt;
      }

      const [fx, fz] = forward();
      let accel = 0;
      let tractionLimited = false;
      let absActive = false;
      if (axis.throttle > 0 && speed < topSpeed) {
        if (tuning.powertrain === undefined) {
          accel += axis.throttle * engineAccel;
        } else {
          const powertrain = tuning.powertrain;
          shiftRemaining = Math.max(0, shiftRemaining - dt);
          const ratio = powertrain.gears[Math.min(gearIndex, powertrain.gears.length - 1)] ?? 1;
          const wheelRpm = Math.abs(speed) / Math.max(0.01, powertrain.wheelRadius) * 60 / (Math.PI * 2);
          rpm = Math.max(powertrain.idleRpm, Math.min(powertrain.redlineRpm, wheelRpm * ratio * powertrain.finalDrive));
          if (shiftRemaining <= 0 && rpm >= powertrain.shiftUpRpm && gearIndex < powertrain.gears.length - 1) {
            gearIndex += 1;
            shiftRemaining = powertrain.shiftSeconds;
          } else if (shiftRemaining <= 0 && rpm <= powertrain.shiftDownRpm && gearIndex > 0) {
            gearIndex -= 1;
            shiftRemaining = powertrain.shiftSeconds;
          }
          const normalizedRpm = (rpm - powertrain.idleRpm) / Math.max(1, powertrain.redlineRpm - powertrain.idleRpm);
          const torque = sampleGripCurve(powertrain.torqueCurve, normalizedRpm);
          const drive = shiftRemaining > 0 ? 0.32 : 1;
          accel += axis.throttle * engineAccel * torque * drive;
        }
      }
      if (axis.brake > 0) {
        if (speed > 0.2) {
          const abs = tuning.dynamics?.abs ?? 0;
          const brakeScale = Math.max(0.15, 1 - abs * Math.max(0, Math.abs(speed) / Math.max(1, topSpeed) - 0.72));
          absActive = brakeScale < 0.999;
          accel -= axis.brake * tuning.brakeAccel * brakeScale;
        }
        else if (speed > -tuning.reverseSpeed) accel -= axis.brake * engineAccel;
      }
      const traction = tuning.dynamics?.tractionControl ?? 0;
      if (traction > 0 && Math.abs(speed) > 0.5) {
        const lateral = Math.abs(-vx * fz + vz * fx);
        const excess = Math.max(0, lateral / (Math.abs(speed) + 1) - 0.18);
        if (excess > 0) {
          accel *= Math.max(0.2, 1 - excess * traction * 3);
          tractionLimited = true;
        }
      }
      vx += fx * accel * dt;
      vz += fz * accel * dt;

      let forwardSpeed = vx * fx + vz * fz;
      const lateralSpeed = -vx * fz + vz * fx;
      const surface = surfaceFriction(x, z);
      const slip = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 1);
      const handbrakeFactor = 1 - axis.handbrake * (1 - tuning.handbrakeGrip);
      const downforce = 1 + (tuning.dynamics?.downforce ?? 0) * Math.min(1, Math.abs(forwardSpeed) / Math.max(1, topSpeed));
      const gripValue = sampleGripCurve(grip, slip) * surface * handbrakeFactor * downforce;
      const keep = Math.max(0, 1 - gripValue * tuning.gripStrength * dt);
      const stability = tuning.dynamics?.stabilityControl ?? 0;
      const keptLateral = lateralSpeed * keep * Math.max(0, 1 - stability * Math.abs(axis.steer) * dt);
      if (rollingResistance > 0) forwardSpeed *= Math.max(0, 1 - rollingResistance * dt);
      const aerodynamicDrag = tuning.dynamics?.aerodynamicDrag ?? 0;
      if (aerodynamicDrag > 0) {
        forwardSpeed *= 1 / (1 + aerodynamicDrag * Math.abs(forwardSpeed) * dt);
      }

      vx = fx * forwardSpeed - fz * keptLateral;
      vz = fz * forwardSpeed + fx * keptLateral;

      const drag = dragAt(x, z);
      let dragDamp = 1;
      if (drag > 0) {
        dragDamp = Math.max(0, 1 - drag * dt);
        vx *= dragDamp;
        vz *= dragDamp;
      }

      const toX = x + vx * dt;
      const toZ = z + vz * dt;
      if (clampMove !== undefined && dt > 0) {
        const allowed = clampMove([x, z], [toX, toZ]);
        vx = (allowed[0] - x) / dt;
        vz = (allowed[1] - z) / dt;
        x = allowed[0];
        z = allowed[1];
      } else {
        x = toX;
        z = toZ;
      }

      const longitudinalAcceleration = dt > 0 ? (forwardSpeed - previousForwardSpeed) / dt : 0;
      previousForwardSpeed = forwardSpeed;
      const attitudeResponse = 1 - Math.exp(-Math.max(0, tuning.dynamics?.attitudeResponse ?? 7) * Math.max(0, dt));
      const targetPitch = clampSigned(
        -longitudinalAcceleration * (tuning.dynamics?.bodyPitchFactor ?? 0),
        tuning.dynamics?.maxBodyPitch ?? 0.12,
      );
      const targetRoll = clampSigned(
        -yawRate * forwardSpeed * (tuning.dynamics?.bodyRollFactor ?? 0),
        tuning.dynamics?.maxBodyRoll ?? 0.16,
      );
      bodyPitch += (targetPitch - bodyPitch) * attitudeResponse;
      bodyRoll += (targetRoll - bodyRoll) * attitudeResponse;
      return {
        position: [x, y, z],
        heading,
        forwardSpeed: vx * fx + vz * fz,
        lateralSpeed: -vx * fz + vz * fx,
        slip,
        surface,
        gear: speed < -0.2 ? 0 : gearIndex + 1,
        rpm,
        steerAngle,
        yawRate,
        longitudinalAcceleration,
        tractionLimited,
        absActive,
        bodyPitch,
        bodyRoll,
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
      gearIndex = 0;
      rpm = tuning.powertrain?.idleRpm ?? 0;
      shiftRemaining = 0;
      steerAngle = 0;
      yawRate = 0;
      previousForwardSpeed = 0;
      bodyPitch = 0;
      bodyRoll = 0;
    },
  };
}

function clampSigned(value: number, magnitude: number): number {
  return Math.max(-Math.abs(magnitude), Math.min(Math.abs(magnitude), value));
}
