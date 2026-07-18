import { perContext } from "@jgengine/core/runtime/perContext";
import { createDriving } from "./driving";
import { createPursuit } from "./pursuit";
import { createRace } from "./race";
import type { Handroll } from "./shared";

export {
  MAX_STARS,
  PURSUIT_STARS,
  RIVAL_RACER_ID,
  drivingStore,
  raceStore,
  wantedStore,
  type Handroll,
  type RaceSnapshot,
  type VehicleTelemetry,
  type WantedSnapshot,
} from "./shared";

/**
 * The Vice Isle "handroll" — the game-local driving / wanted-pursuit / race feel, composed from three
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
    exitVehicle: (ctx) => driving.exitVehicle(ctx),
    drivingVehicleId: () => driving.drivingVehicleId(),
    carSpeedKmh: () => driving.carSpeedKmh(),
    telemetry: () => driving.telemetry(),
    addHeat: (ctx, amount) => pursuit.addHeat(ctx, amount),
    clearWanted: (ctx) => pursuit.clearWanted(ctx),
    wanted: () => pursuit.wanted(),
    startRace: (ctx) => race.startRace(ctx),
    raceActive: () => race.raceActive(),
    explodeVehicle(ctx, vehicleId, at) {
      const wasDriven = driving.explodeVehicle(ctx, vehicleId, at);
      if (wasDriven) pursuit.addHeat(ctx, 60);
    },
    tick(ctx, dt) {
      driving.tickDriving(ctx, dt);
      pursuit.tickWanted(ctx, dt);
      pursuit.tickPedPanic(ctx);
      pursuit.tickCops(ctx, dt);
      pursuit.tickCruisers(ctx, dt);
      race.tick(ctx, dt);
    },
  };
}

/** Per-`GameContext` handroll instance — replaces the old module-global singleton (#632). */
export const handrollOf = perContext(() => createHandroll());
