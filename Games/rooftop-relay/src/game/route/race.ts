import { raceTrack, type RaceTrack } from "@jgengine/core/game/race";

import { HANDOFF_ZONE_RADIUS } from "../tuning";
import { ROUTE, type Route } from "./legs";

export function buildLegTracks(route: Route = ROUTE): readonly RaceTrack[] {
  return route.legs.map((leg) =>
    raceTrack({
      laps: 1,
      checkpoints: [
        {
          id: leg.startCheckpoint.id,
          center: leg.startCheckpoint.position,
          half: [HANDOFF_ZONE_RADIUS, 4, HANDOFF_ZONE_RADIUS],
        },
        {
          id: leg.handoffCheckpoint.id,
          center: leg.handoffCheckpoint.position,
          half: [HANDOFF_ZONE_RADIUS, 4, HANDOFF_ZONE_RADIUS],
        },
      ],
    }),
  );
}

export const LEG_TRACKS: readonly RaceTrack[] = buildLegTracks();
