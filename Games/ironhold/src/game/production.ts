import { unitTrainingConfig, type UnitReservation, type UnitTrainingSpec } from "@jgengine/core/work/unitTraining";
import type { UnitSpawnOrder } from "@jgengine/core/work/unitTraining";
import type { WorkQueueConfig } from "@jgengine/core/gameplay";

import { COMBATANTS, TRAINABLE } from "./catalog";

/** The Town Hall's training config: each trainable's cost + food (population) + train time, over the
 * shared work-queue. Completion yields a {@link UnitSpawnOrder} the systems tick routes to a spawn. */
export const TRAINING_CONFIG: WorkQueueConfig<UnitTrainingSpec, UnitReservation, UnitSpawnOrder> = unitTrainingConfig({
  units: Object.fromEntries(
    Object.entries(TRAINABLE).map(([id, t]) => [id, { id, trainSeconds: t.trainSeconds, cost: t.cost, population: COMBATANTS[id]?.food ?? 0 }]),
  ),
  capacity: 6,
});
