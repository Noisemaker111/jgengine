// @skill jgengine-world

/**
 * The nozzle pressure effect of a rocket motor: the motor's thrust curve is its vacuum thrust, and the air pressing on
 * the nozzle exit takes back `p∞·Aₑ`, so a first stage gains about a sixth of its thrust as it climbs out of the air.
 * Mass flow stays tied to the vacuum thrust (constant vacuum specific impulse).
 */
export interface AircraftNozzle {
  /**
   * Multiplier on the effect: `0` off (the curve's thrust everywhere, the simple model), `1` as measured (default), past
   * `1` the back-pressure loss scales with the strength (thrust never below zero); sane over `0..4`.
   */
  strength?: number;
  /** Total nozzle exit area at the curve's peak thrust, m²; it scales with the curve, so shutting engines in a cluster shrinks it. */
  exitArea: number;
}

/**
 * Delivered thrust, N, for the curve's vacuum thrust, its peak and the ambient pressure, Pa.
 * @capability aircraft-nozzle rocket thrust lost to ambient pressure on the nozzle exit
 */
export function nozzleThrust(effect: AircraftNozzle, strength: number, vacuumThrust: number, peakThrust: number, ambientPressure: number): number {
  if (strength <= 0 || vacuumThrust <= 0) return vacuumThrust;
  const area = effect.exitArea * (vacuumThrust / Math.max(1e-9, peakThrust));
  return Math.max(0, vacuumThrust - strength * ambientPressure * area);
}
