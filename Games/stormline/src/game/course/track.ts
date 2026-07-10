import { createRaceState, firstPastPost, raceTrack, type RaceState, type RaceTrack } from "@jgengine/core/game/race";
import { GATES } from "./catalog";

const CHECKPOINT_HALF: readonly [number, number, number] = [200, 5, 40];
export const TRUCK_RACER_ID = "truck";

export function buildTrack(): RaceTrack {
  return raceTrack({
    checkpoints: GATES.map((gate) => ({
      id: `gate-${gate.index}`,
      center: [0, 0, gate.progress],
      half: CHECKPOINT_HALF,
    })),
    laps: 1,
  });
}

export function createTruckRaceState(): RaceState {
  const state = createRaceState({ track: buildTrack(), win: firstPastPost(1) });
  state.addRacer(TRUCK_RACER_ID);
  return state;
}
