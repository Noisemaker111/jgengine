// @skill jgengine-world
import { aeroTermValue, type AeroState, type AeroTerm } from "./aeroTable";
import type { AircraftAeroGeometry } from "./polar";

/**
 * The stability and control derivatives effect: whole-aircraft rolling, pitching and yawing moment coefficients from
 * published data, so static stability, control power and the damping of each rate come out as measured. Roll rate under
 * full aileron is set by aileron power against roll damping (`Clδa` against `Clp`), the short period by `Cmα`, `Cmq`
 * and `Cmα̇`. At strength 1 these replace the lifting surfaces' moments.
 */
export interface AircraftDerivatives extends AircraftAeroGeometry {
  /**
   * Multiplier on the effect: `0` off (the surfaces' moments, the simple model), `1` as measured (default), past `1`
   * the damping terms (those times `pHat`, `qHat`, `rHat` or `alphaDotHat`) scale with the strength while static
   * stability and control power stay as measured; sane over `0..4`.
   */
  strength?: number;
  /** Rolling moment coefficient build-up, positive right wing down. */
  roll: readonly AeroTerm[];
  /** Pitching moment coefficient build-up about the centre of gravity, positive nose up. */
  pitch: readonly AeroTerm[];
  /** Yawing moment coefficient build-up, positive nose right. */
  yaw: readonly AeroTerm[];
}

/** Moment coefficients split into static-and-control and damping parts. */
export interface DerivativeMoments {
  roll: number;
  pitch: number;
  yaw: number;
  rollDamping: number;
  pitchDamping: number;
  yawDamping: number;
}

function isDamping(term: AeroTerm): boolean {
  return term.times === "pHat" || term.times === "qHat" || term.times === "rHat" || term.times === "alphaDotHat";
}

function sumSplit(terms: readonly AeroTerm[], state: AeroState): [number, number] {
  let fixed = 0;
  let damping = 0;
  for (const term of terms) {
    const value = aeroTermValue(term, state);
    if (isDamping(term)) damping += value;
    else fixed += value;
  }
  return [fixed, damping];
}

/**
 * Sums the moment coefficients at an air state, keeping the damping part apart so the strength can scale it alone.
 * @capability aircraft-derivatives whole-aircraft moment coefficients from stability, damping and control derivatives
 */
export function derivativeMoments(effect: AircraftDerivatives, state: AeroState, out: DerivativeMoments): DerivativeMoments {
  [out.roll, out.rollDamping] = sumSplit(effect.roll, state);
  [out.pitch, out.pitchDamping] = sumSplit(effect.pitch, state);
  [out.yaw, out.yawDamping] = sumSplit(effect.yaw, state);
  return out;
}
