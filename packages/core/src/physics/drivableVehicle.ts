import type { AxisInput } from "../input/axisInput";
import type { KinematicVehicleModifiers, KinematicVehicleStep } from "./kinematicVehicle";

/** World-space `[x, y, z]` for a drivable vehicle's resolved pose. */
export type DrivableVehiclePosition = readonly [number, number, number];

/** The pose fields {@link tickDrivableVehicle} reads from a sim step; `KinematicVehicleStep` and `VehicleDynamicsStep` both carry them. */
export interface DrivableSimStep {
  position: readonly [number, number, number];
  heading: number;
  bodyPitch: number;
  bodyRoll: number;
  airOffset: number;
}

/** Any ground-vehicle sim {@link tickDrivableVehicle} can drive: `KinematicVehicle` or `VehicleDynamics`. */
export interface DrivableSim<TModifiers, TStep extends DrivableSimStep> {
  tick(dt: number, axis: AxisInput, modifiers?: TModifiers): TStep;
}

/** Options for {@link tickDrivableVehicle} — ground snapping and per-tick tuning modifiers. */
export interface DrivableVehicleOptions<TModifiers = KinematicVehicleModifiers> {
  /** Resamples world-space Y each tick (terrain height, a ramp, a bridge deck); omit to keep the sim's own flat `y`. */
  groundHeight?: (x: number, z: number) => number;
  modifiers?: TModifiers;
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
export interface DrivableVehicleStep<TStep extends DrivableSimStep = KinematicVehicleStep> {
  pose: DrivableVehiclePose;
  step: TStep;
}

/**
 * Connects an `AxisInput` sample straight through a ground-vehicle sim (`KinematicVehicle` or
 * `VehicleDynamics`) to a scene entity's pose for one tick (#533.1) — the throttle/steer/handbrake → sim → `setPose` loop every drivable-vehicle
 * game hand-rolled. Ground-snaps the result when `groundHeight` is given (terrain-following cars, not
 * just flat racetracks). Pair with `scene/vehicleSeat` for who is allowed to drive and where the camera
 * points; this function only steps the sim and shapes the pose patch, nothing else.
 *
 * @capability drivable-vehicle drive a car from throttle/steer/handbrake input each tick: step the vehicle sim and pose its entity
 */
export function tickDrivableVehicle<TStep extends DrivableSimStep = KinematicVehicleStep, TModifiers = KinematicVehicleModifiers>(
  vehicle: DrivableSim<TModifiers, TStep>,
  dt: number,
  axis: AxisInput,
  options: DrivableVehicleOptions<TModifiers> = {},
): DrivableVehicleStep<TStep> {
  const step = vehicle.tick(dt, axis, options.modifiers);
  const [x, y, z] = step.position;
  // Ground-snap first, then lift by any hop in progress, so a jumping vehicle still follows the
  // terrain beneath it instead of hanging at a fixed world height over a slope.
  const resolvedY = (options.groundHeight === undefined ? y : options.groundHeight(x, z)) + step.airOffset;
  return {
    pose: { position: [x, resolvedY, z], rotationX: step.bodyPitch, rotationY: step.heading, rotationZ: step.bodyRoll, dt },
    step,
  };
}
