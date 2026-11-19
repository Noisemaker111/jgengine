import type { DirectionalLightingConfig, LightingConfig } from "@jgengine/core/game/playableGame";

export const DEFAULT_IBL_AMBIENT_SCALE = 0.5;

export const FALLBACK_KEY_LIGHT: Readonly<DirectionalLightingConfig> = {
  position: [-22, 40, 16],
  intensity: 0.6,
  castShadow: false,
};

/** @capability balance-ibl-lighting trim flat ambient under IBL and add a key light to directionless lighting */
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
