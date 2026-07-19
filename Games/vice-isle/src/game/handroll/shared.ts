import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

export interface WantedSnapshot {
  heat: number;
  stars: number;
  peakStars: number;
}

export const MAX_STARS = 5;
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

export const wantedStore = defineStore<WantedSnapshot | undefined>("vice.wanted", undefined);
export const drivingStore = defineStore<string | null | undefined>("vice.driving", undefined);
export const raceStore = defineStore<RaceSnapshot | undefined>("vice.race", undefined);

export interface Handroll {
  enterVehicle(ctx: GameContext, vehicleId: string): void;
  exitVehicle(ctx: GameContext): void;
  drivingVehicleId(): string | null;
  carSpeedKmh(): number;
  telemetry(): VehicleTelemetry;
  tick(ctx: GameContext, dt: number): void;
  addHeat(ctx: GameContext, amount: number): void;
  clearWanted(ctx: GameContext): void;
  wanted(): WantedSnapshot;
  startRace(ctx: GameContext): boolean;
  raceActive(): boolean;
  explodeVehicle(ctx: GameContext, vehicleId: string, at: readonly [number, number, number]): void;
}
