// @skill jgengine-world
import { sumAeroTerms, type AeroState, type AeroSurfaceTravel, type AeroTerm } from "./aeroTable";

export interface AircraftAeroGeometry {
  area: number;
  span: number;
  chord: number;
  axes?: "body" | "stability";
  travel?: { pitch?: AeroSurfaceTravel; roll?: AeroSurfaceTravel; yaw?: AeroSurfaceTravel };
  /**
   * Angle of attack range the data covers, rad `[low, high]` (default unlimited). Outside it the tables are read at the
   * nearest edge, and the polar's lift and drag blend over 0.2 rad into a flat plate's, so a tumbling aircraft stays bounded.
   */
  alphaRange?: readonly [number, number];
  sideslipRange?: number;
}

/**
 * The lift and drag polar effect: whole-aircraft lift, drag and side-force coefficients from published data (tables by
 * angle of attack, sideslip and deflection, plus rate and control terms), with induced drag in the drag polar and the
 * stall in the lift curve. Lift acts across the relative wind in the plane of symmetry, drag along it, side force along
 * the body's right; at strength 1 they replace the lifting surfaces' forces (the surfaces still give the moments unless
 * the `derivatives` effect is on).
 */
export interface AircraftPolar extends AircraftAeroGeometry {
  /**
   * Multiplier on the effect: `0` off (the surfaces' forces, the simple model), `1` the measured polar (default), past
   * `1` the drag scales with the strength while lift stays as measured; sane over `0..4`.
   */
  strength?: number;
  lift: readonly AeroTerm[];
  drag: readonly AeroTerm[];
  side?: readonly AeroTerm[];
  /** Angle of attack where lift peaks, rad; past it the step reports a stall (default: the surfaces decide). */
  stallAngle?: number;
  inducedDrag?: number;
}

export interface PolarCoefficients {
  lift: number;
  drag: number;
  side: number;
}

/** @capability aircraft-polar whole-aircraft lift, drag and side force from published coefficient data */
export function polarCoefficients(effect: AircraftPolar, state: AeroState, out: PolarCoefficients): PolarCoefficients {
  out.lift = sumAeroTerms(effect.lift, state);
  out.drag = sumAeroTerms(effect.drag, state);
  out.side = sumAeroTerms(effect.side, state);
  return out;
}
