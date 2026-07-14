import type { AxisInput } from "../input/axisInput";
import type { KinematicVehicle, KinematicVehicleModifiers, KinematicVehicleStep } from "./kinematicVehicle";

/** World-space `[x, y, z]` for a drivable vehicle's resolved pose. */
export type DrivableVehiclePosition = readonly [number, number, number];

/** Options for {@link tickDrivableVehicle} — ground snapping and per-tick tuning modifiers. */
export interface DrivableVehicleOptions {
  /** Resamples world-space Y each tick (terrain height, a ramp, a bridge deck); omit to keep the sim's own flat `y`. */
  groundHeight?: (x: number, z: number) => number;
  modifiers?: KinematicVehicleModifiers;
}

/** A `setPose`-ready patch — spread straight into `entities.setPose(vehicleId, drive.pose)`. */
export interface DrivableVehiclePose {
  position: DrivableVehiclePosition;
  rotationY: number;
  dt: number;
}

/** {@link tickDrivableVehicle}'s result — the ready-to-apply pose patch plus the raw sim step for HUD/telemetry reads. */
export interface DrivableVehicleStep {
  pose: DrivableVehiclePose;
  step: KinematicVehicleStep;
}

/**
 * Connects an `AxisInput` sample straight through a {@link KinematicVehicle} to a scene entity's pose
 * for one tick (#533.1) — the throttle/steer/handbrake → sim → `setPose` loop every drivable-vehicle
 * game hand-rolled. Ground-snaps the result when `groundHeight` is given (terrain-following cars, not
 * just flat racetracks). Pair with `scene/vehicleSeat` for who is allowed to drive and where the camera
 * points; this function only steps the sim and shapes the pose patch, nothing else.
 */
export function tickDrivableVehicle(
  vehicle: KinematicVehicle,
  dt: number,
  axis: AxisInput,
  options: DrivableVehicleOptions = {},
): DrivableVehicleStep {
  const step = vehicle.tick(dt, axis, options.modifiers);
  const [x, y, z] = step.position;
  const resolvedY = options.groundHeight === undefined ? y : options.groundHeight(x, z);
  return {
    pose: { position: [x, resolvedY, z], rotationY: step.heading, dt },
    step,
  };
}
