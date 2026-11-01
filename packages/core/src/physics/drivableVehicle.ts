import type { AxisInput } from "../input/axisInput";
import type { TireMarks } from "./tireMarks";
import type { VehicleDynamics, VehicleDynamicsModifiers, VehicleDynamicsStep } from "./vehicleDynamics";

/** World-space `[x, y, z]` for a drivable vehicle's resolved pose. */
export type DrivableVehiclePosition = readonly [number, number, number];

/** Where a car's sliding tires leave their trace: skid marks on the ground and smoke in the air. */
export interface DrivableTireEffects {
  /** Unique per car, so each wheel keeps its own strip (`ctx` entity id). */
  id: string;
  /** Game time, s (`ctx.time.now()`). */
  time: number;
  /** Skid-mark pool, usually `ctx.tireMarks`. */
  marks?: TireMarks;
  /** Where tire smoke plays, usually `ctx.particles`. */
  particles?: { play(name: string, request?: { position?: readonly [number, number, number]; burst?: number }): void };
  /** Slip from which wheels mark the ground, `0..1` (default `0.4`). */
  markFrom?: number;
  /** Slip from which the tires smoke, `0..1` (default `0.6`). */
  smokeFrom?: number;
}

/** Options for {@link tickDrivableVehicle} — ground snapping, per-tick modifiers and tire effects. */
export interface DrivableVehicleOptions {
  /** Resamples world-space Y each tick (terrain height, a ramp, a bridge deck); omit to keep the sim's own flat `y`. */
  groundHeight?: (x: number, z: number) => number;
  modifiers?: VehicleDynamicsModifiers | undefined;
  /** Lay skid marks and tire smoke while the car slides; omit for none. */
  tires?: DrivableTireEffects;
}

/** A `setPose`-ready patch — spread straight into `entities.setPose(vehicleId, drive.pose)`. */
export interface DrivableVehiclePose {
  position: DrivableVehiclePosition;
  rotationY: number;
  rotationX: number;
  rotationZ: number;
  dt: number;
}

/** {@link tickDrivableVehicle}'s result — the ready-to-apply pose patch plus the raw sim step for HUD/telemetry reads. */
export interface DrivableVehicleStep {
  pose: DrivableVehiclePose;
  step: VehicleDynamicsStep;
}

const SMOKE_INTERVAL = 0.12;
const lastSmoke = new WeakMap<VehicleDynamics, number>();

/**
 * Connects an `AxisInput` sample straight through a `VehicleDynamics` car to a scene entity's pose for one
 * tick — the throttle/steer/handbrake → sim → `setPose` loop every drivable-vehicle game needs. Ground-snaps
 * the result when `groundHeight` is given (terrain-following cars, not just flat racetracks), and with
 * `tires` lays skid marks and plays tire smoke while the car slides. Pair with `scene/vehicleSeat` for who
 * is allowed to drive and where the camera points.
 *
 * @capability drivable-vehicle drive a car from throttle/steer/handbrake input each tick: step the vehicle sim, pose its entity, mark and smoke its tires
 */
export function tickDrivableVehicle(
  vehicle: VehicleDynamics,
  dt: number,
  axis: AxisInput,
  options: DrivableVehicleOptions = {},
): DrivableVehicleStep {
  const step = vehicle.tick(dt, axis, options.modifiers);
  const [x, y, z] = step.motion.position;
  // Ground-snap first, then lift by any hop in progress, so a jumping vehicle still follows the
  // terrain beneath it instead of hanging at a fixed world height over a slope.
  const ground = options.groundHeight === undefined ? y : options.groundHeight(x, z);
  const resolvedY = ground + step.air.airOffset;
  if (options.tires !== undefined) tireEffects(vehicle, step, axis, ground, options.tires);
  return {
    pose: { position: [x, resolvedY, z], rotationX: step.body.bodyPitch, rotationY: step.motion.heading, rotationZ: step.body.bodyRoll, dt },
    step,
  };
}

function tireEffects(vehicle: VehicleDynamics, step: VehicleDynamicsStep, axis: AxisInput, ground: number, effects: DrivableTireEffects): void {
  const tuning = vehicle.tuning();
  const speed = Math.hypot(step.motion.forwardSpeed, step.motion.lateralSpeed);
  const markFrom = effects.markFrom ?? 0.4;
  const grounded = !step.air.airborne && speed > 2;
  const handbraking = axis.handbrake > 0.3 && speed > 4;
  const rearSliding = grounded && (step.tires.slip >= markFrom || handbraking || (step.tires.wheelspin && tuning.driveFront < 1));
  const frontSliding = grounded && (step.tires.wheelLock || (step.tires.slip >= markFrom && step.tires.frontSaturation > 1.05));
  const marks = effects.marks;
  const a = tuning.wheelbase * (1 - tuning.frontWeight);
  const b = tuning.wheelbase - a;
  const half = tuning.trackWidth / 2;
  const fx = Math.sin(step.motion.heading);
  const fz = Math.cos(step.motion.heading);
  const [x, , z] = step.motion.position;
  const wheel = (along: number, lat: number): readonly [number, number] => [x + fx * along - fz * lat, z + fz * along + fx * lat];
  const width = Math.max(0.12, Math.min(0.35, tuning.trackWidth * 0.14));
  const strength = Math.max(0.35, step.tires.slip);
  if (marks !== undefined) {
    for (let i = 0; i < 4; i += 1) {
      const front = i < 2;
      const key = `${effects.id}:${i}`;
      if (!(front ? frontSliding : rearSliding)) {
        marks.lift(key);
        continue;
      }
      const [wx, wz] = wheel(front ? a : -b, i % 2 === 0 ? -half : half);
      marks.press(key, wx, ground + 0.02, wz, strength, width, effects.time);
    }
  }
  const particles = effects.particles;
  if (particles === undefined || !grounded || speed < 6) return;
  const smoking = step.tires.slip >= (effects.smokeFrom ?? 0.6) || (step.tires.wheelspin && speed < 14 && axis.throttle > 0.6);
  if (!smoking) return;
  const previous = lastSmoke.get(vehicle);
  if (previous !== undefined && effects.time - previous < SMOKE_INTERVAL && effects.time >= previous) return;
  lastSmoke.set(vehicle, effects.time);
  const [sx, sz] = wheel(-b, 0);
  particles.play("smoke/tire", { position: [sx, ground + 0.3, sz], burst: Math.round(3 + 6 * step.tires.slip) });
}
