import { createLevelSequence, type LevelSequence } from "@jgengine/core/game/levelSequence";
import { createSpawnPoints, type SpawnPoints } from "@jgengine/core/game/spawnPoints";

import type { CheckpointDef, SectorLayout } from "./course";

export const RETRIES_PER_SECTOR = 2;

export function createSectorSequence(sectors: readonly SectorLayout[]): LevelSequence<SectorLayout> {
  return createLevelSequence({
    levels: sectors.map((sector) => ({ id: sector.id, config: sector })),
    retriesPerLevel: RETRIES_PER_SECTOR,
  });
}

export function createCourseCheckpoints(sectors: readonly SectorLayout[]): SpawnPoints {
  const points = createSpawnPoints();
  for (const sector of sectors) {
    for (const checkpoint of sector.checkpoints) {
      points.record(checkpoint.id, { x: 0, y: 0, z: checkpoint.z });
    }
  }
  return points;
}

export function sectorStartCheckpoint(sector: SectorLayout): CheckpointDef {
  const first = sector.checkpoints[0];
  if (first === undefined) throw new Error(`sector ${sector.id} has no checkpoints`);
  return first;
}

export function lastCheckpointFor(sector: SectorLayout, localZ: number): CheckpointDef {
  let best = sectorStartCheckpoint(sector);
  for (const checkpoint of sector.checkpoints) {
    if (checkpoint.z <= localZ && checkpoint.z >= best.z) best = checkpoint;
  }
  return best;
}

export type AttemptOutcome = "retry" | "failed";

export function consumeSectorAttempt(levels: LevelSequence<SectorLayout>): AttemptOutcome {
  const outcome = levels.fail();
  if (outcome === "retry") levels.retry();
  return outcome;
}

export function retriesRemaining(levels: LevelSequence<SectorLayout>): number {
  const current = levels.current();
  if (current === null) return 0;
  return Math.max(0, RETRIES_PER_SECTOR + 1 - current.attempt);
}
