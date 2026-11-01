import { perContext } from "@jgengine/core/runtime/perContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { VehicleDamageState } from "@jgengine/core/physics/vehicleDamage";
import { createDriving, type VehicleTelemetry } from "./driving/driving";
import { createPursuit, type PursuitSave, type WantedSnapshot, type WitnessFilter } from "./hhpd/pursuit";
import { createRace } from "./race/race";

export { drivingStore, type VehicleTelemetry } from "./driving/driving";
export { MAX_HEAT, MAX_STARS, PURSUIT_STARS, wantedStore, type WantedSnapshot } from "./hhpd/pursuit";
export { RIVAL_RACER_ID, raceStore, type RaceSnapshot } from "./race/race";

export interface StreetPlay {
  /** The heat and pursuit state a reload must keep; null until the pursuit has been built. */
  pursuitSave(): PursuitSave;
  restorePursuit(ctx: GameContext, state: PursuitSave): void;
  enterVehicle(ctx: GameContext, vehicleId: string): void;
  exitVehicle(ctx: GameContext, force?: boolean): void;
  /** Put a ground car somewhere else, at rest (dev staging and warps). */
  placeVehicle(ctx: GameContext, vehicleId: string, position: readonly [number, number, number], heading: number): void;
  drivingVehicleId(): string | null;
  carSpeedKmh(): number;
  telemetry(): VehicleTelemetry;
  tick(ctx: GameContext, dt: number): void;
  addHeat(ctx: GameContext, amount: number): void;
  /** Take heat off at once; returns the stars left. */
  forgiveHeat(ctx: GameContext, amount: number): number;
  /** Heat at the threshold of a star count. */
  heatForStars(stars: number): number;
  /** The player is in cover HHPD can't see into this tick. */
  setHidden(hidden: boolean): void;
  hidden(): boolean;
  /** Who keeps quiet when HHPD asks the street. */
  setWitnessFilter(filter: WitnessFilter | null): void;
  clearWanted(ctx: GameContext): void;
  wanted(): WantedSnapshot;
  startRace(ctx: GameContext): boolean;
  raceActive(): boolean;
  /** Each live car's bodywork stages, for the save document. */
  vehicleDamageSave(ctx: GameContext): Record<string, VehicleDamageState>;
  restoreVehicleDamage(ctx: GameContext, sections: Record<string, VehicleDamageState>): void;
  /** Re-bake every owned car's handling after a mod was bought; dents stay. */
  retuneOwnedCars(ctx: GameContext): void;
  explodeVehicle(ctx: GameContext, vehicleId: string, at: readonly [number, number, number]): void;
}

/**
 * Harbor Heat's street play — the game-local driving / wanted-pursuit / race feel, composed from three
 * slices that each own their slice of mutable state: {@link createDriving} owns the vehicle sims and the
 * shared vehicle registry, {@link createPursuit} borrows that registry for cruiser cars, and
 * {@link createRace} reads the player position through the same seam. The tick order is load-bearing.
 */
export function createStreetPlay(): StreetPlay {
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

/** Per-`GameContext` streetPlay instance — replaces the old module-global singleton (#632). */
export const streetPlayOf = perContext(() => createStreetPlay());
