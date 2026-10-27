import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import { createVehicleDynamics } from "@jgengine/core/physics/vehicleDynamics";
import { VEHICLE_STYLES, vehicleTuning } from "@jgengine/core/physics/vehicleSpec";
import { DEFAULT_DRIVE_CODES, defineGame, defineSystem } from "@jgengine/shell/gameKit";

// Tire grip, weight transfer, drift and steering help come
// from the style. Set the numbers you care about.
const car = createVehicleDynamics(
  vehicleTuning({
    ...VEHICLE_STYLES.drift,
    topSpeed: 34,
    accel: 10,
    brake: 16,
    turnRate: 2.4,
    grip: 1.1,
    drift: 0.85,
  }),
);

const PEDALS = {
  throttle: { positive: ["throttle"] },
  brake: { positive: ["brake"] },
  steer: { positive: ["steerRight"], negative: ["steerLeft"] },
  handbrake: { positive: ["handbrake"] },
};
const PEDAL = { min: 0, max: 1 };

const driving = defineSystem({
  id: "driving",
  tick: { type: "frame" },
  update(ctx, dt) {
    const axis = ctx.input.axis(PEDALS, { throttle: PEDAL, brake: PEDAL, handbrake: PEDAL });
    const drive = tickDrivableVehicle(car, dt, axis, {
      groundHeight: (x, z) => ctx.world.groundHeightAt(x, z),
    });
    ctx.scene.entity.setPose(ctx.player.userId, drive.pose);
  },
});

export const game = defineGame({
  name: "Drive",
  input: DEFAULT_DRIVE_CODES, // WASD or arrows, Space for the handbrake
  camera: { rig: "chase", chase: { distance: 7, height: 3 } },
  systems: [driving],
});
