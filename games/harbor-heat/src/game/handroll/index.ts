import { perContext } from "@jgengine/core/runtime/perContext";
import { createDriving } from "./driving";
import { createPursuit } from "./pursuit";
import { createRace } from "./race";
import type { Handroll } from "./shared";

export {
  MAX_HEAT,
  MAX_STARS,
  PURSUIT_STARS,
  RIVAL_RACER_ID,
  drivingStore,
  raceStore,
  wantedStore,
  type Handroll,
  type RaceSnapshot,
  type SearchAreaSnapshot,
  type VehicleTelemetry,
  type WantedSnapshot,
} from "./shared";

/**
 * The Harbor Heat "handroll" — the game-local driving / wanted-pursuit / race feel, composed from three
 * slices that each own their slice of mutable state: {@link createDriving} owns the vehicle sims and the
 * shared vehicle registry, {@link createPursuit} borrows that registry for cruiser cars, and
 * {@link createRace} reads the player position through the same seam. The tick order is load-bearing.
 */
export function createHandroll(): Handroll {
  const driving = createDriving();
  const pursuit = createPursuit(driving);
  const race = createRace(driving);

  return {
    enterVehicle: (ctx, vehicleId) => driving.enterVehicle(ctx, vehicleId),
    exitVehicle: (ctx, force) => driving.exitVehicle(ctx, force),
    placeVehicle: (ctx, vehicleId, position, heading) => driving.placeVehicle(ctx, vehicleId, position, heading),
    drivingVehicleId: () => driving.drivingVehicleId(),
    carSpeedKmh: () => driving.carSpeedKmh(),
    telemetry: () => driving.telemetry(),
    pursuitSave: () => pursuit.snapshot(),
    restorePursuit: (ctx, state) => pursuit.restore(ctx, state),
    addHeat: (ctx, amount) => pursuit.addHeat(ctx, amount),
    forgiveHeat: (ctx, amount) => pursuit.forgiveHeat(ctx, amount),
    heatForStars: (stars) => pursuit.heatForStars(stars),
    setHidden: (hidden) => pursuit.setHidden(hidden),
    hidden: () => pursuit.hidden(),
    setWitnessFilter: (filter) => pursuit.setWitnessFilter(filter),
    clearWanted: (ctx) => pursuit.clearWanted(ctx),
    wanted: () => pursuit.wanted(),
    startRace: (ctx) => race.startRace(ctx),
    raceActive: () => race.raceActive(),
    vehicleDamageSave: (ctx) => driving.vehicleDamageSave(ctx),
    restoreVehicleDamage: (ctx, sections) => driving.restoreVehicleDamage(ctx, sections),
    retuneOwnedCars: (ctx) => driving.retuneOwnedCars(ctx),
    explodeVehicle(ctx, vehicleId, at) {
      const wasDriven = driving.explodeVehicle(ctx, vehicleId, at);
      if (wasDriven) pursuit.addHeat(ctx, 60);
    },
    tick(ctx, dt) {
      driving.tickDriving(ctx, dt);
      pursuit.tickWanted(ctx, dt);
      pursuit.tickCops(ctx, dt);
      pursuit.tickCruisers(ctx, dt);
      race.tick(ctx, dt);
    },
  };
}

/** Per-`GameContext` handroll instance — replaces the old module-global singleton (#632). */
export const handrollOf = perContext(() => createHandroll());
