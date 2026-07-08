import { raceTrack, type RaceTrack } from "@jgengine/core/game/race";

import { cumulativeLengths, sampleCheckpoints, stadiumCenterline, tangentAt, type Vec2 } from "./geometry";

export const TRACK_WIDTH = 12;
export const LAPS = 3;

const STRAIGHT_LENGTH = 70;
const TURN_RADIUS = 24;
const TURN_SEGMENTS = 20;
const CHECKPOINT_COUNT = 10;

export const TRACK_CENTERLINE: readonly Vec2[] = stadiumCenterline({
  straightLength: STRAIGHT_LENGTH,
  turnRadius: TURN_RADIUS,
  segmentsPerTurn: TURN_SEGMENTS,
});

export const TRACK_LENGTHS = cumulativeLengths(TRACK_CENTERLINE);

export const TRACK_CHECKPOINTS = sampleCheckpoints(TRACK_CENTERLINE, TRACK_LENGTHS, CHECKPOINT_COUNT, TRACK_WIDTH);

export const TRACK: RaceTrack = raceTrack({ checkpoints: TRACK_CHECKPOINTS, laps: LAPS });

const spawnTangent = tangentAt(TRACK_CENTERLINE, TRACK_LENGTHS, 0);

export const SPAWN_HEADING = Math.atan2(spawnTangent.x, spawnTangent.z);

export const SPAWN_POSITION: readonly [number, number, number] = [
  TRACK_CHECKPOINTS[0]!.center[0],
  0.5,
  TRACK_CHECKPOINTS[0]!.center[2],
];
