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
  /**
   * Optional mass-and-force chassis layer (#1051). When present it supersedes `engineAccel`/`brakeAccel`
   * with force/mass dynamics — a tire friction budget, lateral weight transfer, and engine braking — so
   * vehicles of different mass, drive/brake force, and center-of-gravity drive measurably differently.
   * Omit to preserve the direct arcade acceleration model exactly.
   */
  chassis?: KinematicChassisTuning;
}

/**
 * Mass-and-force chassis layer (#1051); when present it supersedes `engineAccel`/`brakeAccel` with
 * force/mass dynamics. Drive/brake become forces divided by `massKg`, a per-tick tire friction budget
 * (`tireGrip` * grip curve * surface * downforce * m * g) is split lateral-first then longitudinal so
 * hard slides and launches saturate, and `comHeight`/`trackWidth` set weight-transfer washout and body
 * lean. Coasting decelerates from physical road load, not a per-vehicle constant: rolling resistance
 * `μ_rr · m · g` always, plus engine braking `ENGINE_BRAKE_FRACTION · engineForce` routed through the
 * current gear (so it strengthens as the car downshifts) whenever the throttle is lifted and a
 * `powertrain` is configured. All fields are required; omit the whole block for the legacy model.
 */
export interface KinematicChassisTuning {
  /** Total vehicle mass, kg (1200 compact … 11000 bus); divides every drive/brake force into accel. */
  massKg: number;
  /** Peak drive force at the wheels, N — scaled by the powertrain torque curve and throttle. Also sets engine-braking magnitude. */
  engineForce: number;
  /** Peak service-brake force, N; still modulated by the existing ABS logic. */
  brakeForce: number;
  /** Peak tire friction coefficient μ on an ideal surface (~0.9 street, 1.1 sport, 0.7 bus). */
  tireGrip: number;
  /** Center-of-mass height, m (0.45 sports car … 1.4 bus); drives weight transfer and body lean. */
  comHeight: number;
  /** Lateral wheel spacing (track width), m; larger resists lateral weight transfer. */
  trackWidth: number;
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
  /**
   * Demanded drive force exceeded the tire friction budget left after cornering this tick — a
   * traction-limited launch (#1051). Always `false` without a `chassis` block; distinct from
   * `tractionLimited`, which stays owned by the traction-control assist.
   */
  wheelspin: boolean;
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
  const chassis = tuning.chassis;
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
      let wheelspin = false;

      // Powertrain state tracks wheel speed EVERY tick (not just under throttle): the engine keeps
      // spinning with the wheels, so rpm, gear and downshifts stay live while coasting or braking. That
      // is what makes engine braking below gear-dependent. Drive torque itself is still applied only on
      // throttle; `gearLeverage` (current ratio / top-gear ratio) is `1` in top gear and grows in the
      // low gears the car downshifts into as it slows.
      let torqueFactor = 1;
      let gearLeverage = 1;
      if (tuning.powertrain !== undefined) {
        const powertrain = tuning.powertrain;
        shiftRemaining = Math.max(0, shiftRemaining - dt);
        const ratio = powertrain.gears[Math.min(gearIndex, powertrain.gears.length - 1)] ?? 1;
        const topGearRatio = powertrain.gears[powertrain.gears.length - 1] ?? ratio;
        gearLeverage = topGearRatio > 0 ? Math.min(ENGINE_BRAKE_MAX_LEVERAGE, ratio / topGearRatio) : 1;
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
        torqueFactor = torque * (shiftRemaining > 0 ? 0.32 : 1);
      }

      if (axis.throttle > 0 && speed < topSpeed) {
        accel += chassis === undefined
          ? axis.throttle * engineAccel * torqueFactor
          : (axis.throttle * chassis.engineForce * (modifiers?.accelScale ?? 1) * torqueFactor) / chassis.massKg;
      }
      if (axis.brake > 0) {
        if (speed > 0.2) {
          const abs = tuning.dynamics?.abs ?? 0;
          const brakeScale = Math.max(0.15, 1 - abs * Math.max(0, Math.abs(speed) / Math.max(1, topSpeed) - 0.72));
          absActive = brakeScale < 0.999;
          accel -= chassis === undefined
            ? axis.brake * tuning.brakeAccel * brakeScale
            : (axis.brake * chassis.brakeForce * brakeScale) / chassis.massKg;
        }
        else if (speed > -tuning.reverseSpeed) {
          accel -= chassis === undefined
            ? axis.brake * engineAccel
            : (axis.brake * chassis.engineForce * (modifiers?.accelScale ?? 1)) / chassis.massKg;
        }
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
      // Coast resistance for the mass-and-force chassis (#1051) — derived from the vehicle's own weight,
      // gravity, and gearing, never a flat "brake force" constant. Two weight-based terms:
      //   • rolling resistance  F = μ_rr · m · g                    (always, the road-load floor)
      //   • engine braking      F = μ_eb · m · g · gearLeverage     (throttle lifted, in gear)
      // Engine braking is routed through the CURRENT gear, so it strengthens as the car downshifts toward
      // a stop — exactly like lifting off in a real drivetrain. Both are forces (∝ m·g) whose per-mass
      // deceleration is weight-independent and gear-scaled; the per-tick decel is capped so coasting can
      // never push the car backwards.
      if (chassis !== undefined && dt > 0 && Math.abs(speed) > 1e-4) {
        let resistDecel = ROLLING_RESISTANCE_COEFFICIENT * GRAVITY;
        if (axis.throttle <= 0 && tuning.powertrain !== undefined) {
          resistDecel += ENGINE_BRAKE_COEFFICIENT * GRAVITY * gearLeverage;
        }
        accel -= Math.sign(speed) * Math.min(resistDecel, Math.abs(speed) / dt);
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
      let keptLateral = lateralSpeed * keep * Math.max(0, 1 - stability * Math.abs(axis.steer) * dt);
      if (chassis !== undefined) {
        // Friction budget (#1051): total tire force F = μeff * m * g, with μeff = tireGrip * gripValue
        // (grip curve * surface * handbrake * downforce). Lateral load transfer (|centripetal accel| *
        // comHeight / (trackWidth * g), capped ~0.6) shrinks the lateral share so tall/narrow chassis wash
        // out earlier. Lateral consumes its capped share first; only the remainder feeds drive/brake.
        const capacity = chassis.tireGrip * gripValue * chassis.massKg * GRAVITY;
        const transfer = Math.min(
          0.6,
          (Math.abs(yawRate * forwardSpeed) * chassis.comHeight) / (Math.max(0.1, chassis.trackWidth) * GRAVITY),
        );
        const lateralCapacity = capacity * (1 - 0.5 * transfer);
        const reductionWanted = lateralSpeed - keptLateral;
        const maxReduction = dt > 0 ? (lateralCapacity * dt) / chassis.massKg : 0;
        let reductionActual = reductionWanted;
        if (Math.abs(reductionWanted) > maxReduction) {
          reductionActual = Math.sign(reductionWanted) * maxReduction;
          keptLateral = lateralSpeed - reductionActual;
        }
        const lateralForceUsed = dt > 0 ? (chassis.massKg * Math.abs(reductionActual)) / dt : 0;
        const remainingLong = Math.max(0, capacity - lateralForceUsed);
        if (chassis.massKg * Math.abs(accel) > remainingLong) {
          const actualAccel = (Math.sign(accel) * remainingLong) / chassis.massKg;
          forwardSpeed -= (accel - actualAccel) * dt;
          if (accel > 0 && axis.throttle > 0) wheelspin = true;
        }
      }
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

      // Rest snap (#1051): parked with no throttle/brake/handbrake and sub-threshold motion → exact zero,
      // killing residual creep and jitter. Zeroing previousForwardSpeed keeps the stop free of a pitch spike.
      if (
        chassis !== undefined &&
        axis.throttle <= 0 &&
        axis.brake <= 0 &&
        axis.handbrake <= 0 &&
        Math.abs(vx * fx + vz * fz) < 0.2 &&
        Math.abs(-vx * fz + vz * fx) < 0.2
      ) {
        vx = 0;
        vz = 0;
        forwardSpeed = 0;
        previousForwardSpeed = 0;
      }

      const longitudinalAcceleration = dt > 0 ? (forwardSpeed - previousForwardSpeed) / dt : 0;
      previousForwardSpeed = forwardSpeed;
      const attitudeResponse = 1 - Math.exp(-Math.max(0, tuning.dynamics?.attitudeResponse ?? 7) * Math.max(0, dt));
      // comHeight scales brake dive / throttle squat and cornering lean (#1051); `1` without a chassis.
      const comScale = chassis !== undefined ? chassis.comHeight : 1;
      const targetPitch = clampSigned(
        -longitudinalAcceleration * (tuning.dynamics?.bodyPitchFactor ?? 0) * comScale,
        tuning.dynamics?.maxBodyPitch ?? 0.12,
      );
      const targetRoll = clampSigned(
        -yawRate * forwardSpeed * (tuning.dynamics?.bodyRollFactor ?? 0) * comScale,
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
        wheelspin,
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

/** Gravitational acceleration, m/s², for the chassis friction budget and weight-transfer ratio (#1051). */
const GRAVITY = 9.81;

/**
 * Tyre rolling-resistance coefficient μ_rr (#1051). The always-present coast force is `μ_rr · m · g`
 * (the road-load floor) — a little high vs. a real ~0.013 tyre so a lifted-off car settles to a stop
 * in a game-reasonable distance rather than gliding for tens of seconds.
 */
const ROLLING_RESISTANCE_COEFFICIENT = 0.03;

/**
 * Engine-braking drag as a weight fraction (#1051): the lift-off force is `μ_eb · m · g` routed through
 * the current gear (`ratio / top-gear ratio`, capped by {@link ENGINE_BRAKE_MAX_LEVERAGE}). Like rolling
 * resistance it scales with the vehicle's own weight and gravity — not a per-car constant — so every car
 * settles with a consistent, firm lift-off deceleration that grows as it downshifts toward a stop, while
 * always staying well short of the service brakes.
 */
const ENGINE_BRAKE_COEFFICIENT = 0.11;
/** Cap on low-gear engine-braking leverage so lifting off never bites as hard as the brake pedal. */
const ENGINE_BRAKE_MAX_LEVERAGE = 2.5;

function clampSigned(value: number, magnitude: number): number {
  return Math.max(-Math.abs(magnitude), Math.min(Math.abs(magnitude), value));
}
