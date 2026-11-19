// @skill jgengine-world

export interface AircraftWingGroundEffect {
  /**
   * Multiplier on the effect: `0` off, `1` McCormick's factor (default), past `1` more of the induced drag relieved
   * (never below none); sane over `0..4`.
   */
  strength?: number;
  wingHeight?: number;
  span: number;
}

/**
 * Share of free-air induced drag left at a centre-of-gravity height above the ground, `0..1`, at a strength.
 * @capability aircraft-wing-ground-effect induced drag relief near the ground
 */
export function inducedDragFactor(effect: AircraftWingGroundEffect, strength: number, heightAboveGround: number): number {
  if (strength <= 0) return 1;
  const height = Math.max(0.1, heightAboveGround + (effect.wingHeight ?? 0));
  const ratio = ((16 * height) / Math.max(1e-3, effect.span)) ** 2;
  const phi = ratio / (1 + ratio);
  return Math.max(0, 1 - strength * (1 - phi));
}
