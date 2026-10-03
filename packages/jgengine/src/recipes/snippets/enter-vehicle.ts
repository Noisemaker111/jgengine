import { DEFAULT_WALK_CODES, defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { boardVehicle, createVehicleSeats, leaveVehicle, type VehicleSeats } from "@jgengine/core/scene/vehicleSeat";
import { createKinematicVehicle, type KinematicVehicle } from "@jgengine/core/physics/kinematicVehicle";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import type { GameContext } from "@jgengine/shell/gameKit";

const TUNING = {
  engineAccel: 14, brakeAccel: 22, topSpeed: 28, reverseSpeed: 8,
  turnRate: 2.2, turnSpeedRef: 10, gripStrength: 8, handbrakeGrip: 2,
};
const DRIVE = {
  throttle: { positive: ["moveForward"] }, brake: { positive: ["moveBack"] },
  steer: { positive: ["moveRight"], negative: ["moveLeft"] }, handbrake: { positive: ["jump"] },
};
const PEDAL = { min: 0, max: 1 };
const states = new WeakMap<GameContext, { seats: VehicleSeats; sims: Map<string, KinematicVehicle> }>();

function toggleSeat(ctx: GameContext): void {
  const { seats } = states.get(ctx)!;
  const riderId = ctx.player.userId;
  if (seats.isSeated(riderId)) {
    leaveVehicle(ctx, seats, riderId);
    return;
  }
  const vehicleId = ctx.scene.entity.inRadius(riderId, 3, (id) => ctx.scene.entity.get(id)?.name === "car")[0];
  if (vehicleId === undefined) return;
  if (!seats.mounts.isRegistered(vehicleId)) seats.register({ id: vehicleId, kit: { kind: "ground" } });
  boardVehicle(ctx, seats, riderId, vehicleId, { rig: "chase", chase: { distance: 7, height: 3 } });
}

const driving = defineSystem({
  id: "driving",
  tick: { type: "frame" },
  create(ctx) {
    const seats = createVehicleSeats();
    states.set(ctx, { seats, sims: new Map() });
    ctx.game.commands.define("use-vehicle", { apply: toggleSeat });
  },
  save(ctx) {
    const { seats, sims } = states.get(ctx)!;
    return { key: "vehicleSeats", snapshot: () => seats.snapshot(), hydrate(state) {
      for (const car of ctx.scene.entity.list().filter((entity) => entity.name === "car")) {
        if (!seats.mounts.isRegistered(car.id)) seats.register({ id: car.id, kit: { kind: "ground" } });
      }
      seats.restore(state as ReturnType<VehicleSeats["snapshot"]>); sims.clear();
    } };
  },
  reset(ctx) {
    const { seats, sims } = states.get(ctx)!;
    for (const { riderId, mountId } of seats.snapshot()) {
      const pose = ctx.scene.entity.get(mountId) ?? ctx.scene.entity.get(riderId);
      if (pose !== null) leaveVehicle(ctx, seats, riderId, { camera: false, pose });
    }
    seats.reset(); sims.clear(); ctx.camera.reset();
  },
  update(ctx, dt) {
    const { seats, sims } = states.get(ctx)!;
    const riderId = ctx.player.userId, vehicleId = seats.drivenBy(riderId);
    if (vehicleId === null) return;
    const vehicle = ctx.scene.entity.get(vehicleId);
    if (vehicle === null) return;
    let sim = sims.get(vehicleId);
    if (sim === undefined) {
      sim = createKinematicVehicle(TUNING, { position: vehicle.position, heading: vehicle.rotationY });
      sims.set(vehicleId, sim);
    }
    const axis = ctx.input.axis(DRIVE, { throttle: PEDAL, brake: PEDAL, handbrake: PEDAL });
    const drive = tickDrivableVehicle(sim, dt, axis);
    ctx.scene.entity.setPose(vehicleId, drive.pose);
    ctx.scene.entity.setPose(riderId, drive.pose);
  },
});

export const game = defineGame({
  name: "Drive",
  camera: { rig: "orbit" },
  input: { ...DEFAULT_WALK_CODES, "use-vehicle": ["KeyF"] },
  systems: [driving],
});
// Place catalog kind "car" in the editor. Handling remains caller data; see vehicle-feel for force-based motors.
