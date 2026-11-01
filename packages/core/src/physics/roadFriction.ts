/**
 * Road friction: how much grip the surface under the car allows next to the dry test track the tyres were fitted on,
 * one number for the whole road (`0.6` a wet road) and one per named surface the `surfaceAt` option reports
 * (`{ asphalt: 1, gravel: 0.6, ice: 0.1 }`). It scales every tyre's friction coefficient, so the tyres still slide the
 * way their curves say, only sooner.
 */
export interface VehicleRoadFrictionEffect {
  /** Multiplier on the effect: `0` off (every surface grips like the test track), `1` the frictions as given (default), past `1` further from `1` (never below `0.02`); sane over `0..4`. */
  strength?: number;
  /** Friction of the road everywhere, relative to the test track (default `1`; wet asphalt ~`0.6`, packed snow ~`0.3`, ice ~`0.1`). */
  friction?: number;
  /** Friction per surface name, multiplied onto `friction` where `surfaceAt` reports that name. */
  surfaces?: Readonly<Record<string, number>>;
}

/**
 * The tyre-friction multiplier the road gives on surface `surface`, with its distance from the test track scaled by
 * `strength`.
 * @capability road-friction road surface friction as one number per road and per named surface, scaling every tyre's grip
 */
export function roadFrictionAt(effect: VehicleRoadFrictionEffect, surface: string | undefined, strength: number): number {
  const named = surface === undefined ? undefined : effect.surfaces?.[surface];
  const friction = Math.max(0, (effect.friction ?? 1) * (named ?? 1));
  return strength === 1 ? Math.max(0.02, friction) : Math.max(0.02, 1 + strength * (friction - 1));
}
