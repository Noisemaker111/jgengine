import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  createRideSystem,
  type RideDefinition,
  type RideRatings,
  type RideServiceResult,
  type RideSystem,
  type RideSystemSnapshot,
  type RideTickSink,
  type RideView,
} from "@jgengine/core/sim/rides";
import { DEFAULT_QUEUE_SEED_SERVICE_SECONDS, DEFAULT_QUEUE_WINDOW } from "@jgengine/core/sim/queue";

import { park as parkSpec, parkObjects, type ParkObject } from "./park";
import { buildCoasterCircuit, type CoasterCircuit, type TrackPoint } from "./coaster/circuit";

/**
 * The park's rides run on the shared ride sim (`@jgengine/core/sim/rides`): each ride owns its own
 * load → ride → unload cycle, its own line, its own wear and breakdown curve. A breakdown is the
 * world's news (`breakdown` ripple) and the repair is the world's crew order, so the sim is told
 * never to fix a ride itself: it stays down until the crew's order lands and calls {@link fixRide}.
 */

const park: { system: RideSystem | null; key: string } = { system: null, key: "" };

/** A ride the sim never repairs on its own; the world's crew does. */
const HELD_DOWN = 1e9;

/** Every laid track piece as a point; the circuit orders them itself. */
function trackPoints(objects: readonly ParkObject[]): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const obj of objects) if (obj.kind === "track_piece") points.push([obj.x, 0, obj.z]);
  return points;
}

/** The circuit the park's coaster runs, measured from the track it has laid. */
export function coasterCircuit(ctx: GameContext): CoasterCircuit {
  const objects = parkObjects(ctx);
  const station = objects.find((obj) => obj.kind === "ride_coaster") ?? null;
  return buildCoasterCircuit(trackPoints(objects), station === null ? null : [station.x, station.z]);
}

export function trackPieces(ctx: GameContext): number {
  return parkObjects(ctx).filter((obj) => obj.kind === "track_piece").length;
}

/** Scenery in reach lifts a ride's excitement by up to this much at the theme cap. */
const THEME_EXCITEMENT = 0.25;

/**
 * A ride's three ratings on the 0-10 scale: a coaster's come from its circuit, a flat ride's from its
 * own data; the charm of scenery in reach (`<id>.theme`) lifts the excitement of either.
 */
export function rideRatings(obj: ParkObject, circuit: CoasterCircuit, theme = 0): RideRatings {
  const ride = obj.def.ride;
  if (ride === undefined) return { excitement: 0, intensity: 0, nausea: 0 };
  const base = obj.kind === "ride_coaster" ? { excitement: circuit.excitement, intensity: circuit.intensity, nausea: circuit.nausea } : { excitement: ride.excitement, intensity: ride.intensity, nausea: ride.nausea };
  return { ...base, excitement: Math.round((base.excitement + theme * THEME_EXCITEMENT) * 10) / 10 };
}

/** One placed ride as the shared sim's data. */
export function rideDefinition(obj: ParkObject, circuit: CoasterCircuit, theme = 0): RideDefinition {
  const ride = obj.def.ride;
  if (ride === undefined) throw new Error(`brightway-park: "${obj.kind}" is not a ride`);
  // A coaster's lap is the track's own length at the track's own pace, so laying rail changes the ride.
  const rideSeconds = obj.kind === "ride_coaster" && circuit.closed ? Math.max(4, circuit.lapSeconds) : ride.rideSeconds;
  return {
    id: obj.id,
    ratings: rideRatings(obj, circuit, theme),
    capacity: ride.capacity,
    loadSeconds: ride.loadSeconds,
    rideSeconds,
    unloadSeconds: ride.unloadSeconds,
    breakdown: { ...ride.breakdown, repairSeconds: HELD_DOWN, repairCost: 0 },
  };
}

function desiredDefinitions(ctx: GameContext): RideDefinition[] {
  const circuit = coasterCircuit(ctx);
  const w = parkSpec.of(ctx);
  return parkObjects(ctx).filter((obj) => obj.def.ride !== undefined).map((obj) => rideDefinition(obj, circuit, w.num(`${obj.id}.theme`)));
}

function definitionKey(definitions: readonly RideDefinition[]): string {
  return definitions
    .map((d) => [d.id, d.capacity, d.loadSeconds, d.rideSeconds, d.unloadSeconds, d.ratings.excitement, d.ratings.intensity].join(":"))
    .join("|");
}

/** Put saved ride state back over a rebuilt sim; a ride the save never saw starts idle with an empty line. */
function restoreInto(system: RideSystem, definitions: readonly RideDefinition[], saved: RideSystemSnapshot): void {
  const byId = new Map(saved.rides.map((entry) => [entry.definition.id, entry]));
  system.restore({
    elapsed: saved.elapsed,
    rides: definitions.map((definition) => {
      const entry = byId.get(definition.id);
      if (entry !== undefined) return { ...entry, definition };
      return {
        definition, phase: "idle", timer: 0, riders: [], cycles: 0, wear: 0, breakdowns: 0, repairSpend: 0, serviceSpend: 0, boarded: 0,
        queue: { entries: [], boards: [], seedServiceSeconds: DEFAULT_QUEUE_SEED_SERVICE_SECONDS, window: DEFAULT_QUEUE_WINDOW },
      };
    }),
  });
}

/**
 * Keep the sim's ride set in step with the park. A ride built, sold or retracked changes its
 * definition, so the system is rebuilt and the surviving rides are put back from one snapshot.
 */
export function syncRidePark(ctx: GameContext, rng: () => number = ctx.rng): void {
  const definitions = desiredDefinitions(ctx);
  const key = definitionKey(definitions);
  if (key === park.key && park.system !== null) return;
  const saved = park.system?.snapshot() ?? null;
  park.system?.dispose();
  const next = createRideSystem({ rides: definitions, rng, devtoolsName: "park.rides", queueSeedServiceSeconds: 3 });
  if (saved !== null) restoreInto(next, definitions, saved);
  park.system = next;
  park.key = key;
}

/** The live sim, created empty when the park has no rides yet. */
export function rideSystem(): RideSystem {
  if (park.system === null) {
    park.system = createRideSystem({ rides: [], rng: () => 0.5, devtoolsName: "park.rides", queueSeedServiceSeconds: 3 });
    park.key = "";
  }
  return park.system;
}

export function resetRides(): void {
  park.system?.dispose();
  park.system = null;
  park.key = "";
}

export const rideView = (rideId: string): RideView | null => rideSystem().ride(rideId);
export const joinRide = (rideId: string, guestId: string): boolean => rideSystem().join(rideId, guestId);
export const leaveRide = (rideId: string, guestId: string): boolean => rideSystem().leave(rideId, guestId);

/** Clear a ride's wear; the world's `service_*` action already took the money. */
export const serviceRide = (rideId: string): RideServiceResult | null => rideSystem().service(rideId);

/** The crew's order landed: the ride comes back up and boards its waiting line on the next tick. */
export function fixRide(rideId: string): void {
  const system = rideSystem();
  const snapshot = system.snapshot();
  const entry = snapshot.rides.find((candidate) => candidate.definition.id === rideId);
  if (entry === undefined || entry.phase !== "broken") return;
  entry.phase = "idle";
  entry.timer = 0;
  // A repair is a full overhaul: the wear curve starts again from new.
  entry.wear = 0;
  system.restore(snapshot);
}

/** Take a ride down now (the drive's and the tests' way to see a breakdown without waiting on the dice). */
export function breakRide(rideId: string): boolean {
  const system = rideSystem();
  const snapshot = system.snapshot();
  const entry = snapshot.rides.find((candidate) => candidate.definition.id === rideId);
  if (entry === undefined || entry.phase === "broken") return false;
  entry.phase = "broken";
  entry.timer = HELD_DOWN;
  entry.breakdowns += 1;
  system.restore(snapshot);
  return true;
}

/** This guest's 0-based place in a ride's line, or 0 when it is not waiting. */
export function queuePosition(rideId: string, guestId: string): number {
  const position = rideSystem().queue(rideId)?.positionOf(guestId) ?? -1;
  return position < 0 ? 0 : position;
}

export const rideSnapshot = (): RideSystemSnapshot => rideSystem().snapshot();

export function restoreRides(ctx: GameContext, snapshot: RideSystemSnapshot | null): void {
  resetRides();
  syncRidePark(ctx);
  if (snapshot !== null) restoreInto(rideSystem(), rideSystem().definitions(), snapshot);
}

export interface RideBoard {
  rides: number;
  online: number;
  broken: number;
  queued: number;
  riders: number;
}

/** What the park's dashboard says about its rides' lines. */
export function rideBoard(): RideBoard {
  const stats = rideSystem().stats();
  return { rides: stats.rides, online: stats.rides - stats.broken, broken: stats.broken, queued: stats.queued, riders: stats.riders };
}

/** Advance every ride's own cycle by `dt`; the sink hears every boarding, alighting and breakdown. */
export function tickRides(ctx: GameContext, dt: number, sink: RideTickSink): void {
  syncRidePark(ctx);
  rideSystem().tick(dt, sink);
}
