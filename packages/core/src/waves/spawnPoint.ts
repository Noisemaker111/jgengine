import type { NavPoint } from "../nav/navGrid";
import { distanceBiasRegion } from "../world/spatialSample";

export type SpawnPointDistanceBias = "near" | "far" | "none";

export type SpawnPointBiasStrength = "subtle" | "moderate" | "strong";

export interface SpawnPointSelectionOptions {
  candidates: readonly NavPoint[];
  avoid?: readonly NavPoint[];
  random: () => number;
  distanceBias?: SpawnPointDistanceBias;
  biasStrength?: SpawnPointBiasStrength;
}

/** @capability spawn-point-select select a spawn location by its distance preference from avoided positions */
export function selectSpawnPoint(options: SpawnPointSelectionOptions): NavPoint | null {
  const region = distanceBiasRegion(options.candidates, {
    bias: options.distanceBias ?? "near",
    strength: options.biasStrength ?? "moderate",
    ...(options.avoid === undefined ? {} : { avoid: options.avoid }),
  });
  if (region.isEmpty) return null;
  const picked = region.sample(() => Math.max(0, Math.min(1, options.random())));
  // The candidate table copies its points; hand back the caller's own entry so a lane lookup by identity works.
  return options.candidates.find((candidate) => candidate[0] === picked[0] && candidate[1] === picked[1]) ?? picked;
}
