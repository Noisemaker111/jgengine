// @skill jgengine-world

/**
 * The engine spool effect: a turbine takes seconds to wind up, slowest from idle, so thrust follows the throttle through
 * a lag whose time constant grows with the size of the step (Stevens and Lewis's F100 power lag, from NASA TP-1538),
 * and a running engine at closed throttle still gives its idle thrust.
 */
export interface AircraftEngineSpool {
  /**
   * Multiplier on the effect: `0` off (the tuning's first-order `spoolRate`, no idle thrust), `1` as measured
   * (default), past `1` every time constant grows with the strength (a slower engine); sane over `0..4`.
   */
  strength?: number;
  /** Time constant for steps up to `smallStep` of the dry range, s (default `1`). */
  timeConstant?: number;
  /** Time constant for steps of `largeStep` and more, s (default `10`); between the two the response rate is linear in the step. */
  largeStepTimeConstant?: number;
  /** Step sizes, share of the dry range, where the small and large time constants apply (default `0.5` and `1`). */
  smallStep?: number;
  largeStep?: number;
  /** Where the spool heads while full dry or reheat is asked for and it is not there yet, share of dry (default `1.2`). */
  overshoot?: number;
  /** Thrust at closed throttle as a share of full dry thrust (default `0.085`, the F100 cycle's sea-level idle). */
  idle?: number;
}

/**
 * The spool's response rate, 1/s, for a step of `step` (share of the dry range) toward its target, at a strength:
 * blends from the simple `spoolRate` up to strength 1, then divides by the strength.
 * @capability aircraft-engine-spool jet engine spool response rate by step size under a strength dial
 */
export function spoolRate(effect: AircraftEngineSpool, strength: number, simpleRate: number, step: number): number {
  if (strength <= 0) return simpleRate;
  const fast = 1 / Math.max(1e-3, effect.timeConstant ?? 1);
  const slow = 1 / Math.max(1e-3, effect.largeStepTimeConstant ?? 10);
  const small = effect.smallStep ?? 0.5;
  const large = Math.max(small + 1e-6, effect.largeStep ?? 1);
  const size = Math.abs(step);
  const physical = size <= small ? fast : size >= large ? slow : fast + ((slow - fast) * (size - small)) / (large - small);
  return strength <= 1 ? simpleRate + (physical - simpleRate) * strength : physical / strength;
}

/**
 * Where the spool heads for a dry command `0..1` at a strength: at the dry stop it aims beyond full dry until it gets there.
 * @capability aircraft-engine-spool spool target for a dry power command
 */
export function spoolTarget(effect: AircraftEngineSpool, strength: number, command: number, spool: number): number {
  if (command < 1 || spool >= 1) return command;
  return 1 + ((effect.overshoot ?? 1.2) - 1) * Math.min(1, Math.max(0, strength));
}

/**
 * Thrust share of full dry thrust at a spool position `0..1`, with idle thrust blended in up to strength 1.
 * @capability aircraft-engine-spool thrust share from spool position with idle thrust
 */
export function spoolThrust(effect: AircraftEngineSpool, strength: number, spool: number): number {
  const idle = (effect.idle ?? 0.085) * Math.min(1, Math.max(0, strength));
  return idle + (1 - idle) * Math.min(1, spool);
}
