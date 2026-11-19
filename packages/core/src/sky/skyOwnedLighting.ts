import type { LightingConfig } from "../game/playableGame";
import type { SkyEnvironmentConfig } from "../world/features";

export interface SkyOwnedLighting {
  sky: LightingConfig;
  rest: LightingConfig;
}

/**
 * Splits authored lighting into the sun/ambient terms a time-of-day sky drives and the rest.
 * Returns an empty `sky` when the game authored no lighting, so callers can keep engine defaults.
 * @capability day-night-sky hand the sun and ambient fill to the day cycle while authored lamps keep running
 */
export function splitSkyOwnedLighting(lighting: LightingConfig | undefined): SkyOwnedLighting {
  if (lighting === undefined) return { sky: {}, rest: {} };
  const directional = lighting.directional ?? [];
  const [sun, ...fill] = directional;
  const sky: LightingConfig = {
    ...(sun === undefined ? {} : { directional: [sun] }),
    ...(lighting.ambient === undefined ? {} : { ambient: lighting.ambient }),
    ...(lighting.hemisphere === undefined ? {} : { hemisphere: lighting.hemisphere }),
  };
  const rest: LightingConfig = {
    ...(fill.length === 0 ? {} : { directional: fill }),
    ...(lighting.point === undefined ? {} : { point: lighting.point }),
    ...(lighting.spot === undefined ? {} : { spot: lighting.spot }),
    ...(lighting.maxDynamicLights === undefined ? {} : { maxDynamicLights: lighting.maxDynamicLights }),
    ...(lighting.iblAmbientScale === undefined ? {} : { iblAmbientScale: lighting.iblAmbientScale }),
    ...(lighting.fallbackKey === undefined ? {} : { fallbackKey: lighting.fallbackKey }),
  };
  return { sky, rest };
}

/**
 * The authored `lighting` as the day cycle's **noon keyframes**, filling only the sky fields the
 * game left unset. A game's midday sun, fill and fog therefore become the peak the cycle scales
 * and cross-fades from, so an authored world gets a sunset and a night without re-authoring the
 * same numbers in the sky. Authored sky fields always win over the lighting config.
 * @capability day-night-sky read authored lighting as the day cycle's noon keyframe
 */
export function skyNoonKeyframes<T extends SkyEnvironmentConfig>(
  sky: T,
  lighting: LightingConfig | undefined,
  fogColor?: string,
): T {
  const sun = lighting?.directional?.[0];
  const fill = lighting?.hemisphere?.intensity ?? lighting?.ambient?.intensity;
  const noon: SkyEnvironmentConfig = { ...sky };
  if (noon.sunIntensity === undefined && sun?.intensity !== undefined) noon.sunIntensity = sun.intensity;
  if (noon.ambientIntensity === undefined && fill !== undefined) noon.ambientIntensity = fill;
  if (noon.sunColor === undefined && sun?.color !== undefined) noon.sunColor = sun.color;
  if (noon.fogColor === undefined && fogColor !== undefined) noon.fogColor = fogColor;
  return noon as T;
}
