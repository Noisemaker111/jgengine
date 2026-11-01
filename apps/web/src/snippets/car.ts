import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import { createVehicleDynamics } from "@jgengine/core/physics/vehicleDynamics";
import { vehicleTuning } from "@jgengine/core/physics/vehicleSpec";
import { DEFAULT_DRIVE_CODES, defineGame, defineSystem } from "@jgengine/shell/gameKit";

// Tire grip, weight transfer and drag come built in. Set the numbers
// you care about; any effect can be switched off or retuned.
const car = createVehicleDynamics(
  vehicleTuning({
    engine: { topSpeed: 34, accel: 10 },
    brakes: { brake: 16 },
    steering: { turnRate: 2.4 },
    tires: { grip: 1.1, drift: 0.85 },
    aids: {
      // Each aid is its own number: abs, tractionControl, stability, selfAlign.
      stability: 0.73,
    },
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
  camera: { rig: "chase", rigs: { chase: { distance: 7, height: 3 } } },
  systems: [driving],
});
