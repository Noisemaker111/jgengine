import type { Waypoint } from "@jgengine/core/nav/pathFollow";

import { pickRivalPersonality, rivalWaypointsFor, type RivalPersonality } from "../rival/personalities";
import { buildRivalWaypoints } from "../rival/route";
import { buildWindSchedule, type WindShift } from "../wind/schedule";
import { DUNE_SEED, terrainField } from "../../world";

export const RUN_SEED = DUNE_SEED;

export const WIND_SCHEDULE: readonly WindShift[] = buildWindSchedule(RUN_SEED);

export const RIVAL_PERSONALITY: RivalPersonality = pickRivalPersonality(RUN_SEED);

export const RIVAL_WAYPOINTS: readonly Waypoint[] = buildRivalWaypoints(
  rivalWaypointsFor(RIVAL_PERSONALITY),
  terrainField,
);
