import { DEFAULT_WALK_CODES, defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { createVehicleSeats } from "@jgengine/core/scene/vehicleSeat";
import { createKinematicVehicle, type KinematicVehicle, type KinematicVehicleTuning } from "@jgengine/core/physics/kinematicVehicle";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import type { GameContext } from "@jgengine/shell/gameKit";

// The joint: VehicleSeats decides who sits where and returns the patches to apply
// (freeze the rider, point the camera at the car); the game applies them. While
// seated, the walk actions double as the drive axes: ctx.input.axis samples ACTION
// names, not key codes. tickDrivableVehicle steps the sim into a setPose-ready pose.
const TUNING: KinematicVehicleTuning = {
  engineAccel: 14,
  brakeAccel: 22,
  topSpeed: 28,
  reverseSpeed: 8,
  turnRate: 2.2,
  turnSpeedRef: 10,
  gripStrength: 8,
  handbrakeGrip: 2,
};
const DRIVE = {
  throttle: { positive: ["moveForward"] },
  brake: { positive: ["moveBack"] },
  steer: { positive: ["moveRight"], negative: ["moveLeft"] },
  handbrake: { positive: ["jump"] },
};
const PEDAL = { min: 0, max: 1 };

const seats = createVehicleSeats();
const sims = new Map<string, KinematicVehicle>();

// driveTarget returns the rider's own id when they are not seated, so check isSeated first.
function carDrivenBy(riderId: string): string | null {
  return seats.isSeated(riderId) ? seats.mounts.driveTarget(riderId) : null;
}

function toggleSeat(ctx: GameContext): void {
  const me = ctx.player.userId;
  const rider = ctx.scene.entity.get(me);
  if (rider === null) return;
  const seatedIn = carDrivenBy(me);
  if (seatedIn !== null) {
    const car = ctx.scene.entity.get(seatedIn);
    if (car === null) return;
    const out = seats.exit(me, { position: car.position, rotationY: car.rotationY });
    if (!out.ok) return;
    ctx.scene.entity.setPose(me, out.placement);
    ctx.scene.entity.update(me, { hidden: false, movement: { ...rider.movement, ...out.riderMovementPatch } });
    ctx.camera.follow(out.cameraTarget);
    return;
  }
  const car = ctx.scene.entity.list().find((e) => e.name === "car" && (ctx.scene.entity.distance(me, e.id) ?? Infinity) < 3);
  if (car === undefined) return;
  if (!sims.has(car.id)) {
    seats.register({ id: car.id, kit: { kind: "ground" }, seats: [{ id: "driver", offset: [0, 0, 0], control: true }] });
    sims.set(car.id, createKinematicVehicle(TUNING, { position: car.position, heading: car.rotationY }));
  }
  const inn = seats.enter(me, car.id);
  if (!inn.ok) return;
  ctx.scene.entity.update(me, { hidden: true, movement: { ...rider.movement, ...inn.riderMovementPatch } });
  ctx.camera.follow(inn.cameraTarget);
}

const driving = defineSystem({
  id: "driving",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.commands.define("use-vehicle", { apply: (state) => toggleSeat(state) });
  },
  update(ctx, dt) {
    const me = ctx.player.userId;
    const carId = carDrivenBy(me);
    const sim = carId === null ? undefined : sims.get(carId);
    if (carId === null || sim === undefined) return;
    const axis = ctx.input.axis(DRIVE, { throttle: PEDAL, brake: PEDAL, handbrake: PEDAL });
    const drive = tickDrivableVehicle(sim, dt, axis);
    ctx.scene.entity.setPose(carId, drive.pose);
    ctx.scene.entity.setPose(me, { position: drive.pose.position, rotationY: drive.pose.rotationY });
  },
});

export const game = defineGame({
  name: "Drive",
  input: { ...DEFAULT_WALK_CODES, "use-vehicle": ["KeyF"] },
  systems: [driving],
});
// Place the car in the editor as a spawn of catalog kind "car" (role "vehicle"). Chase feel:
// ctx.camera.setChaseTuning(...) with `camera: { rig: "chase" }`. Handling that matters: `recipe`
// vehicle-feel in jgengine-world (createVehicleDynamics + measureHandling).
