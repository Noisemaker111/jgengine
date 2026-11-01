import type { AxisInput } from "@jgengine/core/input/axisInput";
import type { VehicleStepBody, VehicleStepMotion, VehicleStepSteering } from "@jgengine/core/physics/vehicleDynamics";
import {
  createReferenceMotorcycle,
  type ReferenceMotorcycle,
  type ReferenceMotorcycleOptions,
  type ReferenceMotorcycleSpec,
  type ReferenceMotorcycleState,
  type ReferenceMotorcycleStep,
} from "./referenceMotorcycle";

/** Settings for {@link createRiddenMotorcycle}. */
export interface MotorcycleRiderOptions extends ReferenceMotorcycleOptions {
  /** Lean the rider asks for at full steer, rad (default `0.785`: 45°, the steady-turn lean Sharp et al. trim to). */
  maxLean?: number;
  /** How fast the rider moves the lean they ask for, rad/s (default `1.5`). */
  leanRate?: number;
  /** Bar torque per radian of lean error, N·m/rad (default `250`). */
  leanGain?: number;
  /** Bar torque per rad/s of lean rate, `damping / speed` N·m·s/rad, between 15 and 60 (default `480`). */
  leanDamping?: number;
  /** Bar torque per rad·s of integrated lean error, N·m/(rad·s) (default `100`). */
  leanIntegral?: number;
  /** Largest bar torque the rider applies, N·m (default `120`). */
  maxTorque?: number;
}

/** Serializable state of a {@link RiddenMotorcycle}. */
export interface RiddenMotorcycleState {
  bike: ReferenceMotorcycleState;
  integral: number;
  lastLean: number;
  target: number;
}

/** One ridden-bike tick in the grouped shape the handling probes read, plus the full reference sample. */
export interface RiddenMotorcycleStep {
  motion: Pick<VehicleStepMotion, "position" | "heading" | "forwardSpeed" | "lateralSpeed" | "yawRate" | "lateralAccel" | "longitudinalAccel">;
  steering: Pick<VehicleStepSteering, "steerAngle">;
  body: Pick<VehicleStepBody, "lean">;
  sample: ReferenceMotorcycleStep;
}

/**
 * A reference motorcycle with a rider on it, driven like a game bike: `steer` asks for a lean (`steer · maxLean`,
 * positive right), throttle and brake go to the bike's own launch, shift, wheelie and brake-limit logic.
 */
export interface RiddenMotorcycle {
  tick(dt: number, input: AxisInput): RiddenMotorcycleStep;
  velocity(): readonly [number, number];
  pose(): { position: readonly [number, number, number]; heading: number };
  readonly bike: ReferenceMotorcycle;
  readonly maxLean: number;
  snapshot(): RiddenMotorcycleState;
  restore(state: Readonly<RiddenMotorcycleState>): void;
  reset(): void;
}

const RIDER_STEP = 1 / 1000;

/**
 * Puts a steering-torque rider on a reference motorcycle; the bike only ever gets a bar torque, so countersteer, the
 * lean response and its limits come from the multibody physics. The rider runs at 1 kHz: bar torque from lean error
 * (proportional and integral) and lean rate, with the rate damping falling with speed as the bike's own lean
 * damping rises (more of it at speed excites wobble). The structure is Sharp, Evangelou & Limebeer's (2004) steering
 * controller; the gains are retuned for a quick, well-damped lean from 6 to 75 m/s. Steady turns, lane changes and
 * slaloms are then scored through the same `AxisInput` a game bike takes.
 * @capability motorcycle-rider steering-torque rider for the reference motorcycle — steady turns, lane changes, slaloms
 */
export function createRiddenMotorcycle(spec: ReferenceMotorcycleSpec, options: MotorcycleRiderOptions = {}): RiddenMotorcycle {
  const bike = createReferenceMotorcycle(spec, options);
  const maxLean = options.maxLean ?? 0.785;
  const leanRate = options.leanRate ?? 1.5;
  const kp = options.leanGain ?? 250;
  const damping = options.leanDamping ?? 480;
  const ki = options.leanIntegral ?? 100;
  const maxTorque = options.maxTorque ?? 120;
  let integral = 0;
  let target = 0;
  let carry = 0;
  let last = bike.sample();
  let lastLean = last.lean;
  return {
    bike,
    maxLean,
    tick(dt, input) {
      const wanted = Math.max(-1, Math.min(1, input.steer)) * maxLean;
      carry += Math.max(0, dt);
      while (carry >= RIDER_STEP - 1e-12) {
        carry -= RIDER_STEP;
        target += Math.max(-leanRate * RIDER_STEP, Math.min(leanRate * RIDER_STEP, wanted - target));
        const lean = last.lean;
        const rate = (lean - lastLean) / RIDER_STEP;
        lastLean = lean;
        const error = target - lean;
        // Below walking pace the feet hold the bike; the bar loop runs once it rolls.
        const active = last.forwardSpeed > 3;
        integral = active ? Math.max(-0.3, Math.min(0.3, integral + error * RIDER_STEP)) : 0;
        const kd = Math.max(15, Math.min(60, damping / Math.max(1, last.forwardSpeed)));
        // Positive torque steers right: a lean error to the right asks for bar to the left first.
        const torque = active ? Math.max(-maxTorque, Math.min(maxTorque, -kp * error - ki * integral + kd * rate)) : 0;
        last = bike.step(RIDER_STEP, { steerTorque: torque, throttle: input.throttle, brake: input.brake });
      }
      return {
        motion: {
          position: last.position,
          heading: last.heading,
          forwardSpeed: last.forwardSpeed,
          lateralSpeed: last.lateralSpeed,
          yawRate: last.yawRate,
          lateralAccel: last.lateralAccel,
          longitudinalAccel: last.longitudinalAccel,
        },
        steering: { steerAngle: last.steerAngle },
        body: { lean: last.lean },
        sample: last,
      };
    },
    velocity: () => bike.velocity(),
    pose: () => bike.pose(),
    snapshot: () => ({ bike: bike.snapshot(), integral, lastLean, target }),
    restore(state) {
      bike.restore(state.bike);
      integral = state.integral;
      lastLean = state.lastLean;
      target = state.target;
      last = bike.sample();
    },
    reset() {
      bike.reset();
      integral = 0;
      target = 0;
      carry = 0;
      last = bike.sample();
      lastLean = last.lean;
    },
  };
}
