// @skill jgengine-world

/**
 * The engine spool effect: a turbine takes seconds to wind up, slowest from idle, so thrust follows the throttle through
 * a lag whose time constant grows with the size of the step (the shape of Stevens and Lewis's F100 power lag, from
 * NASA TP-1538),
 * and a running engine at closed throttle still gives its idle thrust.
 */
export interface AircraftEngineSpool {
  /**
   * Multiplier on the effect: `0` off (the tuning's first-order `spoolRate`, no idle thrust), `1` as measured
   * (default), past `1` every time constant grows with the strength (a slower engine); sane over `0..4`.
   */
  strength?: number;
  timeConstant?: number;
  largeStepTimeConstant?: number;
  smallStep?: number;
  largeStep?: number;
  idle?: number;
}

/** @capability aircraft-engine-spool jet engine spool response rate by step size under a strength dial */
export function spoolRate(effect: AircraftEngineSpool, strength: number, simpleRate: number, step: number): number {
  if (strength <= 0) return simpleRate;
  const fast = 1 / Math.max(1e-3, effect.timeConstant ?? 1.25);
  const slow = 1 / Math.max(1e-3, effect.largeStepTimeConstant ?? 10);
  const small = effect.smallStep ?? 0.5;
  const large = Math.max(small + 1e-6, effect.largeStep ?? 1);
  const size = Math.abs(step);
  const physical = size <= small ? fast : size >= large ? slow : fast + ((slow - fast) * (size - small)) / (large - small);
  return strength <= 1 ? simpleRate + (physical - simpleRate) * strength : physical / strength;
}

/**
 * Thrust share of full dry thrust at a spool position `0..1`, with idle thrust blended in up to strength 1.
 * @capability aircraft-engine-spool thrust share from spool position with idle thrust
 */
export function spoolThrust(effect: AircraftEngineSpool, strength: number, spool: number): number {
  const idle = (effect.idle ?? 0.085) * Math.min(1, Math.max(0, strength));
  return idle + (1 - idle) * Math.min(1, spool);
}
