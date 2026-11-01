import { createFreeFlightController } from "@jgengine/core/flight/freeFlight";
import { createVehicleDynamics } from "@jgengine/core/physics/vehicleDynamics";
import { vehicleTuning } from "@jgengine/core/physics/vehicleSpec";
import { DEFAULT_WALK_CODES } from "@jgengine/shell/gameKit";

// Walk: bind the movement keys and the shell drives a capsule walker
// with jump, slopes and steps. A new game already does this.
export const input = { ...DEFAULT_WALK_CODES, interact: ["KeyE"] };

// Drive: a force-based car. Set what you care about; every effect
// (drag, load transfer, each driver aid) can be switched off or retuned.
export const car = createVehicleDynamics(
  vehicleTuning({
    tires: { grip: 1.1, drift: 0.85 },
    engine: { topSpeed: 34, accel: 10 },
    brakes: { brake: 16 },
    steering: { turnRate: 2.4 },
  }),
);

// Fly: a jetpack that hovers against gravity and sprints on Shift.
export const jetpack = createFreeFlightController({
  mode: "hover",
  speed: 10,
  gravity: 9,
  thrust: 28,
});
