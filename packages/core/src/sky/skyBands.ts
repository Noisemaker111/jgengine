import type { BiomeBand, SkyEnvironmentDescriptor } from "@jgengine/core/world/features";

/**
 * The terrain biome bands a sky cross-fades through. They belong to the world's own sky, so they
 * apply whenever the sky in force is that sky, even after the shell derives a copy of it (a sun
 * bearing taken from the game's lighting, noon keyframes); a look preset's backdrop sky replaces
 * the world's sky and drops them.
 */
export function biomeBandsForSky(
  authoredSky: SkyEnvironmentDescriptor | undefined,
  worldSky: SkyEnvironmentDescriptor | undefined,
  bands: readonly BiomeBand[] | undefined,
): readonly BiomeBand[] | undefined {
  return authoredSky !== undefined && authoredSky === worldSky ? bands : undefined;
}
