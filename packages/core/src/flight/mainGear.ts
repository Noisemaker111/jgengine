// @skill jgengine-world

/**
 * The main gear effect: on the ground the runway pushes up through the main wheels, behind the centre of mass, so the
 * weight on the wheels holds the nose down and the elevator has to beat that moment before the nose lifts. That is
 * what makes a heavy jet rotate late and a light aircraft rotate early.
 */
export interface AircraftMainGear {
  /**
   * Multiplier on the effect: `0` off (the ground pushes at the centre of mass, the simple model), `1` the wheels where
   * they are (default), past `1` the moment scales with the strength; sane over `0..4`.
   */
  strength?: number;
  /** Main wheels' contact point behind the centre of mass, m. */
  arm: number;
}

/**
 * Nose-down pitching moment, N·m, from a ground reaction `load`, N, at the main wheels.
 * @capability aircraft-main-gear weight-on-wheels pitching moment about the centre of mass
 */
export function mainGearMoment(effect: AircraftMainGear, strength: number, load: number): number {
  return Math.max(0, strength) * effect.arm * Math.max(0, load);
}
