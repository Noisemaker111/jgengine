import type { DirectionalLightingConfig, LightingConfig } from "../game/playableGame";

/** Ambient multiplier applied under image-based light when `iblAmbientScale` is unset. */
export const DEFAULT_IBL_AMBIENT_SCALE = 0.5;

/** Soft key added when authored lighting has no directional light: high, off to one side, shadowless. */
export const FALLBACK_KEY_LIGHT: Readonly<DirectionalLightingConfig> = {
  position: [-22, 40, 16],
  intensity: 0.6,
  castShadow: false,
};

/**
 * Rebalance authored lighting for a scene that also has image-based light: trim the flat ambient term
 * by `iblAmbientScale` (default 0.5) and, when no directional light is authored, add
 * {@link FALLBACK_KEY_LIGHT} tinted by the ambient colour so forms keep a lit and a shaded side.
 * Returns the input unchanged when there is nothing to adjust.
 * @capability balance-ibl-lighting trim flat ambient under IBL and add a key light to directionless lighting
 */
export function balanceLightingForIbl(lighting: LightingConfig | undefined): LightingConfig | undefined {
  if (lighting === undefined) return undefined;
  const scale = Math.max(0, lighting.iblAmbientScale ?? DEFAULT_IBL_AMBIENT_SCALE);
  const needsKey = (lighting.directional?.length ?? 0) === 0 && lighting.fallbackKey !== false;
  const trims = lighting.ambient !== undefined && scale !== 1;
  if (!needsKey && !trims) return lighting;
  const next: LightingConfig = { ...lighting };
  if (trims) next.ambient = { ...lighting.ambient, intensity: (lighting.ambient!.intensity ?? 0.55) * scale };
  if (needsKey) {
    const color = lighting.ambient?.color ?? lighting.hemisphere?.skyColor;
    next.directional = [color === undefined ? FALLBACK_KEY_LIGHT : { ...FALLBACK_KEY_LIGHT, color }];
  }
  return next;
}
