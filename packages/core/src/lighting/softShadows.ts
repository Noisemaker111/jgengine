import type { DirectionalLightingConfig, LightingConfig } from "@jgengine/core/game/playableGame";
import type { GraphicsProfile } from "@jgengine/core/settings/graphicsProfile";

/** PCF radius, in texels, a directional light filters with when it sets no `shadowRadius`. */
export const DEFAULT_SHADOW_RADIUS = 1.25;

/** The sun's angular diameter seen from the ground, in degrees: the reference `lightSize` for daylight. */
export const SUN_ANGULAR_DIAMETER_DEG = 0.53;

/** Metres between a typical caster and the ground it shadows, used when a light leaves it unset. */
export const DEFAULT_OCCLUDER_DISTANCE = 4;

/** What a soft shadow needs to know about one shadow map. */
export interface SoftShadowInput {
  /** The light's angular diameter in degrees; 0.53 is the sun, larger reads as haze or an area light. */
  lightSize: number;
  /** Metres from caster to receiver the penumbra is sized for. */
  occluderDistance?: number | undefined;
  /** Width the shadow map covers, world units. */
  frustumWidth: number;
  /** Shadow map texels along that width. */
  mapSize: number;
  /** The filter radius the light uses without soft shadows; a soft shadow never gets sharper than it. */
  baseRadius: number;
  /** Widest filter the graphics tier pays for, in texels. */
  maxRadius: number;
}

/**
 * PCF filter radius, in shadow-map texels, for a light of angular size `lightSize`: the penumbra a
 * disc of that size throws across `occluderDistance` metres, measured in this map's texels. It never
 * drops below `baseRadius` and never passes `maxRadius`, so a far cascade with coarse texels keeps its
 * base filter and a near one widens to the physical penumbra. Finite and monotone in `lightSize`.
 * three r187 filters with five Vogel-disk taps over a hardware-compare sampler, which has no blocker
 * search, so the penumbra is sized for one caster distance rather than per pixel.
 * @capability soft-shadow-radius size a shadow's penumbra from its light's angular size, per shadow map
 */
export function softShadowRadius(input: SoftShadowInput): number {
  const base = Math.max(0, input.baseRadius);
  const cap = Math.max(base, input.maxRadius);
  const size = Number.isFinite(input.lightSize) ? Math.min(Math.max(input.lightSize, 0), 30) : 0;
  const distance = Math.max(0, input.occluderDistance ?? DEFAULT_OCCLUDER_DISTANCE);
  if (size === 0 || distance === 0 || !(input.frustumWidth > 0) || !(input.mapSize > 0)) return base;
  const penumbra = 2 * distance * Math.tan(((size / 2) * Math.PI) / 180);
  const texel = input.frustumWidth / input.mapSize;
  return Math.min(cap, Math.max(base, penumbra / texel));
}

/**
 * The PCF radius one shadow map of `entry` filters with: its fixed `shadowRadius`, widened to the
 * penumbra its `lightSize` throws while the profile's soft shadows are on.
 */
export function lightShadowRadius(entry: DirectionalLightingConfig, profile: GraphicsProfile | undefined, frustumWidth: number, mapSize: number): number {
  const base = entry.shadowRadius ?? DEFAULT_SHADOW_RADIUS;
  if (entry.lightSize === undefined || profile === undefined || !profile.softShadows) return base;
  return softShadowRadius({
    lightSize: entry.lightSize,
    occluderDistance: entry.occluderDistance,
    frustumWidth,
    mapSize,
    baseRadius: base,
    maxRadius: profile.softShadowMaxRadius,
  });
}

/** True when a shadow-casting directional light in `lighting` sets `lightSize`, so the soft-shadows setting changes something. */
export function lightingHasSoftShadows(lighting: LightingConfig | undefined): boolean {
  return (lighting?.directional ?? []).some((light) => light.castShadow === true && light.lightSize !== undefined);
}
