import { firstPastPost, raceTrack, type RaceTrack } from "@jgengine/core/game/race";

import { CITY } from "../world/sites";

export const PLAYER_RACER_ID = "player";
export const RIVAL_RACER_ID = "rival";

export const FINISH_HALF_EXTENT: readonly [number, number, number] = [90, 60, 90];

export const CARAVAN_RACE_TRACK: RaceTrack = raceTrack({
  checkpoints: [{ id: "meridaan", center: [CITY.x, 0, CITY.z], half: FINISH_HALF_EXTENT }],
  laps: 1,
});

export const CARAVAN_WIN_CONDITION = firstPastPost(1);
