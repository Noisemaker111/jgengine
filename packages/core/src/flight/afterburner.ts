// @skill jgengine-world

/**
 * The afterburner effect: throttle past the dry stop lights reheat, which adds thrust on top of full dry power once the
 * core has spooled up to full dry.
 */
export interface AircraftAfterburner {
  /**
   * Multiplier on the effect: `0` off (throttle runs to full dry, no reheat), `1` as measured (default), past `1` more
   * reheat thrust (the extra over dry scales with the strength); sane over `0..4`.
   */
  strength?: number;
  /** Full afterburner over full dry thrust at sea-level static (default `1.627`, the F100-PW-220 cycle; published 1.63). */
  thrustRatio?: number;
  /** Throttle position of full dry power; past it the afterburner lights (default `0.77`, the F-16's throttle gearing). */
  dryThrottle?: number;
  /** How fast reheat follows its command once the core is at full dry, 1/s first-order (default `5`, the F100 power lag). */
  rate?: number;
}

/**
 * Splits a throttle position into dry and afterburner commands, `0..1` each, at a strength: the dry stop moves from
 * full throttle to `dryThrottle` up to strength 1.
 * @capability aircraft-afterburner split a throttle into dry power and afterburner commands
 */
export function afterburnerCommand(effect: AircraftAfterburner, strength: number, throttle: number): { dry: number; reheat: number } {
  const s = Math.min(1, Math.max(0, strength));
  const stop = 1 + ((effect.dryThrottle ?? 0.77) - 1) * s;
  if (s <= 0 || stop >= 1) return { dry: throttle, reheat: 0 };
  return { dry: Math.min(1, throttle / stop), reheat: Math.max(0, (throttle - stop) / (1 - stop)) };
}

/**
 * The thrust ratio at full afterburner over full dry, at a strength.
 * @capability aircraft-afterburner afterburner thrust ratio under a strength dial
 */
export function afterburnerRatio(effect: AircraftAfterburner, strength: number): number {
  return 1 + ((effect.thrustRatio ?? 1.627) - 1) * Math.max(0, strength);
}
