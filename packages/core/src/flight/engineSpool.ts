// @skill jgengine-world

/**
 * The engine spool effect: a turbine takes seconds to wind up, so thrust follows the throttle through the spool's time
 * constant, and a running engine at closed throttle still gives its idle thrust.
 */
export interface AircraftEngineSpool {
  /**
   * Multiplier on the effect: `0` off (the tuning's `spoolRate`, no idle thrust), `1` as measured (default), past `1`
   * the time constant grows with the strength (a slower engine); sane over `0..4`.
   */
  strength?: number;
  /**
   * First-order time constant from idle toward full power, s (default `1.68`: the F100-PW-220 cycle's 3.86 s from idle
   * to 90% of dry thrust, which Stevens & Lewis's F100 power lag also gives).
   */
  timeConstant?: number;
  /** Thrust at closed throttle as a share of full dry thrust (default `0.085`, the F100 cycle's sea-level idle). */
  idle?: number;
}

/**
 * The spool response rate, 1/s, at a strength: blends from the simple `spoolRate` to `1 / timeConstant` up to
 * strength 1, then divides by the strength.
 * @capability aircraft-engine-spool jet engine spool response rate under a strength dial
 */
export function spoolRate(effect: AircraftEngineSpool, strength: number, simpleRate: number): number {
  const physical = 1 / Math.max(1e-3, effect.timeConstant ?? 1.68);
  if (strength <= 0) return simpleRate;
  return strength <= 1 ? simpleRate + (physical - simpleRate) * strength : physical / strength;
}

/**
 * Thrust share of full dry thrust at a spool position `0..1`, with idle thrust blended in up to strength 1.
 * @capability aircraft-engine-spool thrust share from spool position with idle thrust
 */
export function spoolThrust(effect: AircraftEngineSpool, strength: number, spool: number): number {
  const idle = (effect.idle ?? 0.085) * Math.min(1, Math.max(0, strength));
  return idle + (1 - idle) * spool;
}
