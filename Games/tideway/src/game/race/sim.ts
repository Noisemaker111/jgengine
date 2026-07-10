import type { RaceState } from "@jgengine/core/game/race";
import { createPathFollow, type PathFollowState, type Waypoint } from "@jgengine/core/nav/pathFollow";
import { racerIds } from "../boats/catalog";
import { createBoatState, type BoatState } from "../boats/momentum";
import { rivalWaypoints } from "../boats/rivalAI";
import { startingGrid, WORLD_SEED } from "../course/track";
import { createTidewayRaceState, EMPTY_SURF_TALLY, type RaceOutcome, type SurfTally } from "./raceLogic";

export type RaceStatus = "start" | "racing" | "finished";

export interface Sim {
  seed: string;
  playerId: string;
  ids: readonly string[];
  raceState: RaceState;
  status: RaceStatus;
  raceStartSec: number | null;
  finishedAtSec: number | null;
  outcome: RaceOutcome | null;
  boats: Map<string, BoatState>;
  rivalWaypointsById: Map<string, readonly Waypoint[]>;
  rivalFollowById: Map<string, PathFollowState>;
  surfTally: SurfTally;
}

export function createSim(playerId: string): Sim {
  const ids = racerIds(playerId);
  const grid = startingGrid(ids);
  const raceState = createTidewayRaceState();
  const boats = new Map<string, BoatState>();
  const rivalWaypointsById = new Map<string, readonly Waypoint[]>();
  const rivalFollowById = new Map<string, PathFollowState>();

  for (const slot of grid) {
    raceState.addRacer(slot.racerId, 0);
    if (slot.racerId === playerId) {
      boats.set(slot.racerId, createBoatState(slot.x, slot.z, slot.headingRad));
    } else {
      const waypoints = rivalWaypoints(slot);
      rivalWaypointsById.set(slot.racerId, waypoints);
      rivalFollowById.set(slot.racerId, createPathFollow({ waypoints, speed: 1 }));
    }
  }

  return {
    seed: WORLD_SEED,
    playerId,
    ids,
    raceState,
    status: "start",
    raceStartSec: null,
    finishedAtSec: null,
    outcome: null,
    boats,
    rivalWaypointsById,
    rivalFollowById,
    surfTally: EMPTY_SURF_TALLY,
  };
}

export function resetSim(sim: Sim): Sim {
  return createSim(sim.playerId);
}

export function startingGridFor(sim: Sim) {
  return startingGrid(sim.ids);
}
