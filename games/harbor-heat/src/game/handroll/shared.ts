import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

/** The last-sighting circle HHPD is working; `center` is world XZ, `radius` metres. */
export interface SearchAreaSnapshot {
  center: readonly [number, number];
  radius: number;
  lastSeenAt: number;
}

export interface WantedSnapshot {
  heat: number;
  /** Escalation tier, 0 (clean) to {@link MAX_STARS}. */
  stars: number;
  peakStars: number;
  /** What HHPD is doing about it right now. */
  response: "patrol" | "investigate" | "pursue" | "roadblock";
  /** Where the search is, from the last sighting; null while clean. */
  search: SearchAreaSnapshot | null;
}

export const MAX_STARS = 5;
/** Heat at the top tier; the HUD bar is a fraction of this. */
export const MAX_HEAT = MAX_STARS * 100;
export const PURSUIT_STARS = 3;
export const RIVAL_RACER_ID = "race_rival";

export interface RaceSnapshot {
  routeId: string;
  label: string;
  active: boolean;
  checkpoint: number;
  total: number;
  position: number;
  timeSec: number;
  finished: boolean;
  won: boolean;
}

export interface VehicleTelemetry {
  mode: "ground" | "aircraft";
  /** Raw ground/air speed in meters per second; the HUD converts to km/h via `formatSpeed` at the edge. */
  speedMs: number;
  altitude: number;
  verticalSpeed: number;
  gear: number;
  rpm: number;
  stalled: boolean;
  vtol: boolean;
}

export const wantedStore = defineStore<WantedSnapshot | undefined>("harbor.wanted", undefined);
export const drivingStore = defineStore<string | null | undefined>("harbor.driving", undefined);
export const raceStore = defineStore<RaceSnapshot | undefined>("harbor.race", undefined);

export interface Handroll {
  /** The heat and pursuit state a reload must keep; null until the pursuit has been built. */
  pursuitSave(): import("./pursuit").PursuitSave;
  restorePursuit(ctx: GameContext, state: import("./pursuit").PursuitSave): void;
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
  setWitnessFilter(filter: import("./pursuit").WitnessFilter | null): void;
  clearWanted(ctx: GameContext): void;
  wanted(): WantedSnapshot;
  startRace(ctx: GameContext): boolean;
  raceActive(): boolean;
  /** Each live car's bodywork stages, for the save document. */
  vehicleDamageSave(ctx: GameContext): Record<string, import("@jgengine/core/physics/vehicleDamage").VehicleDamageState>;
  restoreVehicleDamage(ctx: GameContext, sections: Record<string, import("@jgengine/core/physics/vehicleDamage").VehicleDamageState>): void;
  /** Re-bake every owned car's handling after a mod was bought; dents stay. */
  retuneOwnedCars(ctx: GameContext): void;
  explodeVehicle(ctx: GameContext, vehicleId: string, at: readonly [number, number, number]): void;
}
