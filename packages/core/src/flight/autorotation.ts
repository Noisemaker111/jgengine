// @skill jgengine-world

/**
 * The autorotation effect: rotor speed is a spinning inertia driven by the engine through a speed governor and slowed
 * by the rotor's aerodynamic torque, so when the engine stops the rotor keeps turning on its stored energy, and air
 * coming up through a descending disc drives it back toward flight speed. The airframe feels the engine's torque, not
 * the rotor's, so a dead engine stops the yaw kick.
 */
export interface AircraftAutorotation {
  /**
   * Multiplier on the effect: `0` off (rotor speed follows the throttle at `spoolRate`, the simple model), `1` as
   * measured (default), past `1` the rotor inertia scales with the strength (more stored energy); sane over `0..4`.
   */
  strength?: number;
  /** Polar inertia of the rotor and drive train about the shaft, kg·m² (default `926.8`, the Bo-105's four blades). */
  inertia?: number;
  /** Rated rotor speed, rad/s (default `44.5`, the Bo-105). */
  ratedSpeed?: number;
  enginePower?: number;
  /** Governor closed-loop bandwidth, rad/s (default `2`), and damping ratio (default `0.7`). */
  governorFrequency?: number;
  governorDamping?: number;
  tailShare?: number;
}

export interface AutorotationRates {
  speedRate: number;
  /** d(governor integral)/dt, rad/s. */
  governorRate: number;
  engineTorque: number;
}

/** @capability aircraft-autorotation rotor speed inertia with an engine governor, so a dead engine autorotates */
export function autorotationRates(effect: AircraftAutorotation, strength: number, speedShare: number, governor: number, throttle: number, rotorTorque: number, densityRatio: number, out: AutorotationRates): AutorotationRates {
  const rated = effect.ratedSpeed ?? 44.5;
  const inertia = (effect.inertia ?? 926.8) * Math.max(1, strength);
  const frequency = effect.governorFrequency ?? 2;
  const damping = effect.governorDamping ?? 0.7;
  const speed = Math.max(1e-3, speedShare * rated);
  const load = rotorTorque * (1 + (effect.tailShare ?? 0.08));
  const error = rated - speed;
  const command = inertia * (2 * damping * frequency * error + frequency * frequency * governor);
  const available = ((effect.enginePower ?? 626000) * Math.max(0, Math.min(1, throttle)) * densityRatio) / Math.max(speed, 0.2 * rated);
  const engine = Math.max(0, Math.min(available, command));
  out.engineTorque = engine;
  out.speedRate = (engine - load) / inertia / rated;
  out.governorRate = (command > available && error > 0) || (command < 0 && error < 0) ? 0 : error;
  return out;
}

/** @capability aircraft-autorotation settle the governor for a steady rotor load */
export function settledGovernor(effect: AircraftAutorotation, strength: number, rotorTorque: number): number {
  const frequency = effect.governorFrequency ?? 2;
  return (rotorTorque * (1 + (effect.tailShare ?? 0.08))) / ((effect.inertia ?? 926.8) * Math.max(1, strength) * frequency * frequency);
}
