import type { GraphicsProfile } from "@jgengine/core/settings/graphicsProfile";

/** Shadow map size when neither the game nor a profile names one. @internal */
export const DEFAULT_SHADOW_MAP_SIZE = 1024;

/** Cascades when neither the game nor a profile names a count. @internal */
export const DEFAULT_CASCADES = 3;

/**
 * Shadow map size a tier will pay for. A game's authored size is a ceiling for its art, not a floor
 * under the player's tier, so the profile caps it: a game built for 2048 renders 512 on `low`.
 * @internal
 */
export function resolveShadowMapSize(profile?: GraphicsProfile, authored?: number): number {
  const wanted = authored ?? profile?.shadowMapSize ?? DEFAULT_SHADOW_MAP_SIZE;
  return profile === undefined ? wanted : Math.min(wanted, profile.shadowMapSize);
}

/**
 * Cascades a tier will pay for, capped the same way. `low` asks for one, which the lighting tree
 * mounts as a single shadow-casting light instead of a cascade rig.
 * @internal
 */
export function resolveCascadeCount(profile?: GraphicsProfile, authored?: number): number {
  const wanted = authored ?? profile?.cascades ?? DEFAULT_CASCADES;
  return profile === undefined ? wanted : Math.min(wanted, profile.cascades);
}

/**
 * Multiplier on the far cascades' refresh interval, by shadow map size. A tier that halves its map
 * also accepts a far cascade lagging a frame or two longer: at 1024 and below the depth pass is
 * cheap per cascade but there are several of them, and a half-res silhouette moving is harder to
 * see than a full-res one. `high` and `ultra` keep the cadence they had.
 * @internal
 */
export const SHADOW_REFRESH_SCALE_BY_MAP_SIZE: Readonly<Record<number, number>> = {
  512: 2,
  1024: 2,
  2048: 1,
  4096: 1,
};

/** Refresh-interval multiplier for a shadow map of `mapSize`. @internal */
export function shadowRefreshScale(mapSize: number): number {
  return SHADOW_REFRESH_SCALE_BY_MAP_SIZE[mapSize] ?? 1;
}

/**
 * Map size at which a caster's silhouette is still a few texels wide, the reference
 * {@link MIN_SHADOW_CASTER_RADIUS} was measured at. A smaller map resolves less, so the smallest
 * shadow worth a depth draw grows with it.
 * @internal
 */
export const SHADOW_CASTER_RADIUS_REFERENCE_MAP = 2048;

/** Smallest caster radius worth a depth draw at `mapSize`, in metres. @internal */
export function minShadowCasterRadius(mapSize: number, reference = 0.5): number {
  return reference * Math.max(1, SHADOW_CASTER_RADIUS_REFERENCE_MAP / mapSize);
}
