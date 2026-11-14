import { unitTrainingConfig, type UnitReservation, type UnitTrainingSpec } from "@jgengine/core/work/unitTraining";
import type { UnitSpawnOrder } from "@jgengine/core/work/unitTraining";
import type { WorkQueueConfig } from "@jgengine/core/gameplay";

import { combatantDef, TRAINABLE } from "./catalog";

/** Eggs that can wait in the brood queue at once. */
export const BROOD_QUEUE = 8;

function config(lanes: number): WorkQueueConfig<UnitTrainingSpec, UnitReservation, UnitSpawnOrder> {
  return unitTrainingConfig({
    units: Object.fromEntries(
      Object.entries(TRAINABLE).map(([id, t]) => [id, { id, trainSeconds: t.trainSeconds, cost: t.cost, population: combatantDef(id)?.food ?? 0 }]),
    ),
    capacity: BROOD_QUEUE,
    concurrency: lanes,
  });
}

/** The queen's single brood lane: what the nest hatches with no Barracks Chamber dug. */
export const TRAINING_CONFIG: WorkQueueConfig<UnitTrainingSpec, UnitReservation, UnitSpawnOrder> = config(1);

const byLanes = new Map<number, WorkQueueConfig<UnitTrainingSpec, UnitReservation, UnitSpawnOrder>>([[1, TRAINING_CONFIG]]);

/**
 * The hatching config for `lanes` eggs at once: the nest is one lane and every standing Barracks
 * Chamber adds another, so digging more barracks is how a colony out-hatches a growing raid.
 */
export function trainingConfigFor(lanes: number): WorkQueueConfig<UnitTrainingSpec, UnitReservation, UnitSpawnOrder> {
  const n = Math.max(1, Math.floor(lanes));
  let found = byLanes.get(n);
  if (found === undefined) {
    found = config(n);
    byLanes.set(n, found);
  }
  return found;
}
