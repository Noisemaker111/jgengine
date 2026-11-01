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
  /** Shaft power at sea level and full throttle, W; it falls with air density (default `626 000`, two Allison 250-C20B). */
  enginePower?: number;
  /** Governor closed-loop bandwidth, rad/s (default `2`), and damping ratio (default `0.7`). */
  governorFrequency?: number;
  governorDamping?: number;
  /** Extra shaft load for the tail rotor and accessories, share of the main rotor's torque (default `0.08`). */
  tailShare?: number;
}

/** One substep of rotor speed dynamics. */
export interface AutorotationRates {
  /** d(rotor speed share)/dt, 1/s. */
  speedRate: number;
  /** d(governor integral)/dt, rad/s. */
  governorRate: number;
  /** Torque the engine puts on the shaft, N·m; the airframe takes it back. */
  engineTorque: number;
}

/**
 * Rotor speed and governor rates for a speed share, governor integral, throttle (engine power share) and aerodynamic
 * rotor torque, N·m, in air of `densityRatio` to sea level.
 * @capability aircraft-autorotation rotor speed inertia with an engine governor, so a dead engine autorotates
 */
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

/**
 * The governor integral that holds rated speed against a steady rotor torque, for a clean start.
 * @capability aircraft-autorotation settle the governor for a steady rotor load
 */
export function settledGovernor(effect: AircraftAutorotation, strength: number, rotorTorque: number): number {
  const frequency = effect.governorFrequency ?? 2;
  return (rotorTorque * (1 + (effect.tailShare ?? 0.08))) / ((effect.inertia ?? 926.8) * Math.max(1, strength) * frequency * frequency);
}
