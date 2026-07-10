import { raceTrack, type Checkpoint, type RaceTrack } from "@jgengine/core/game/race";

import { buildLap, MAIN_LANES, sampleAtDistance } from "./geometry";

const REFERENCE_SEGMENTS = buildLap(MAIN_LANES);

const CHECKPOINT_DISTANCES = [12, 60, 90, 112, 145, 185] as const;

function checkpointAt(id: string, distance: number, halfY: number): Checkpoint {
  const sample = sampleAtDistance(REFERENCE_SEGMENTS, distance);
  return {
    id,
    center: [sample.x, sample.y, sample.z],
    half: [6, halfY, 6],
  };
}

export const CHECKPOINTS: readonly Checkpoint[] = [
  ...CHECKPOINT_DISTANCES.map((distance, index) => checkpointAt(`gate-${index}`, distance, 3)),
  checkpointAt("finish", 0, 2),
];

export const TRACK: RaceTrack = raceTrack({ checkpoints: CHECKPOINTS, laps: 1_000_000 });
