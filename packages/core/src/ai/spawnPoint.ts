import type { NavPoint } from "../nav/navGrid";
import {
  pickSpawnPoint,
  type SpawnPointDistanceBias,
  type SpawnPointSelectionOptions,
} from "./spawnDirector";

export type { SpawnPointDistanceBias, SpawnPointSelectionOptions };

/** Selects a spawn point by game intent while keeping weighting mechanics internal.
 * @internal
 */
export function selectSpawnPoint(options: SpawnPointSelectionOptions): NavPoint | null {
  return pickSpawnPoint(options);
}
