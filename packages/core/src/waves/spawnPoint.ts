import type { NavPoint } from "../nav/navGrid";
import { distanceBiasRegion } from "../world/spatialSample";

/** Which way a spawn's chance leans, relative to `avoid`: closer, farther, or unweighted. */
export type SpawnPointDistanceBias = "near" | "far" | "none";

/** How strongly the distance preference weighs candidates — a named intent, not a weighting exponent. */
export type SpawnPointBiasStrength = "subtle" | "moderate" | "strong";

/** Semantic options for selecting a spawn point without exposing weighting internals. */
export interface SpawnPointSelectionOptions {
  candidates: readonly NavPoint[];
  avoid?: readonly NavPoint[];
  random: () => number;
  /** Default `"near"`. */
  distanceBias?: SpawnPointDistanceBias;
  /** Default `"moderate"`. */
  biasStrength?: SpawnPointBiasStrength;
}

/**
 * Select a spawn point by game intent, keeping the weighting in the placement part's candidate table.
 *
 * @capability spawn-point-select select a spawn location by its distance preference from avoided positions
 */
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
