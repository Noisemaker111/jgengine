// @skill jgengine-world

/**
 * The wing ground effect: near the ground the wingtip vortices are squashed and induced drag falls, which shortens the
 * take-off roll and lets an aircraft float in the flare. McCormick's factor `φ = (16h/b)² / (1 + (16h/b)²)` scales the
 * induced drag at wing height `h` over span `b`.
 */
export interface AircraftWingGroundEffect {
  /**
   * Multiplier on the effect: `0` off, `1` McCormick's factor (default), past `1` more of the induced drag relieved
   * (never below none); sane over `0..4`.
   */
  strength?: number;
  /** Wing height above the centre of gravity, m (default `0`; a high wing is about `0.9` on a light aircraft). */
  wingHeight?: number;
  /** Wing span, m. */
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
