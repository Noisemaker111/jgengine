import { createFreeFlightController } from "@jgengine/core/flight/freeFlight";
import { createVehicleDynamics } from "@jgengine/core/physics/vehicleDynamics";
import { VEHICLE_STYLES, vehicleTuning } from "@jgengine/core/physics/vehicleSpec";
import { DEFAULT_WALK_CODES } from "@jgengine/shell/gameKit";

// Walk: bind the movement keys and the shell drives a capsule walker
// with jump, slopes and steps. A new game already does this.
export const input = { ...DEFAULT_WALK_CODES, interact: ["KeyE"] };

// Drive: a force-based car. Start from a style, then set what you
// care about: arcade, sim or drift.
export const car = createVehicleDynamics(
  vehicleTuning({
    ...VEHICLE_STYLES.drift,
    topSpeed: 34,
    accel: 10,
    brake: 16,
    turnRate: 2.4,
  }),
);

// Fly: a jetpack that hovers against gravity and sprints on Shift.
export const jetpack = createFreeFlightController({
  mode: "hover",
  speed: 10,
  gravity: 9,
  thrust: 28,
});
