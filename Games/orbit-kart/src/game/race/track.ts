import { raceTrack, type RaceTrack } from "@jgengine/core/game/race";
import { yawRight } from "@jgengine/core/movement/steering";
import { CHECKPOINT_DEFS } from "../cluster/catalog";
import { KART_Y, LAPS } from "../constants";

export const CHECKPOINT_HALF: readonly [number, number, number] = [11, 6, 11];

export const TRACK: RaceTrack = raceTrack({
  laps: LAPS,
  checkpoints: CHECKPOINT_DEFS.map((checkpoint) => ({
    id: checkpoint.id,
    center: [checkpoint.position[0], KART_Y, checkpoint.position[1]] as const,
    half: CHECKPOINT_HALF,
  })),
});

export interface RacerSpawn {
  position: readonly [number, number, number];
  heading: number;
}

function computeStartHeading(): number {
  const finish = CHECKPOINT_DEFS[CHECKPOINT_DEFS.length - 1]!;
  const first = CHECKPOINT_DEFS[0]!;
  return Math.atan2(first.position[0] - finish.position[0], first.position[1] - finish.position[1]);
}

export const START_HEADING = computeStartHeading();

function gridSlot(index: number): RacerSpawn {
  const finish = CHECKPOINT_DEFS[CHECKPOINT_DEFS.length - 1]!;
  const forwardX = Math.sin(START_HEADING);
  const forwardZ = Math.cos(START_HEADING);
  const [lateralX, lateralZ] = yawRight(START_HEADING);
  const back = 10 + index * 6;
  const lateral = (index % 2 === 0 ? -1 : 1) * (4 + index * 0.5);
  return {
    position: [
      finish.position[0] - forwardX * back + lateralX * lateral,
      KART_Y,
      finish.position[1] - forwardZ * back + lateralZ * lateral,
    ],
    heading: START_HEADING,
  };
}

export const RACER_SPAWNS: Readonly<Record<string, RacerSpawn>> = {
  player: gridSlot(0),
  rival_cautious: gridSlot(1),
  rival_aggressive: gridSlot(2),
};
