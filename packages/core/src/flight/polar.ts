// @skill jgengine-world
import { sumAeroTerms, type AeroState, type AeroSurfaceTravel, type AeroTerm } from "./aeroTable";

/**
 * Reference geometry and conventions for whole-aircraft coefficient data (the `polar` and `derivatives` effects): forces
 * are `q̄·S·C`, rolling and yawing moments `q̄·S·b·C`, pitching moments `q̄·S·c̄·C`.
 */
export interface AircraftAeroGeometry {
  /** Reference wing area `S`, m². */
  area: number;
  /** Reference span `b`, m. */
  span: number;
  /** Mean aerodynamic chord `c̄`, m. */
  chord: number;
  /**
   * Axes the roll and yaw data are written in: `"body"` (default) or `"stability"` (rotated by the angle of attack, the
   * usual form of published derivatives); the rates in `pHat` and `rHat` are taken in the same axes.
   */
  axes?: "body" | "stability";
  /** Surface angles, rad, at full input per channel; the terms' `pitch`, `roll` and `yaw` read these (default the actuator deflection itself). */
  travel?: { pitch?: AeroSurfaceTravel; roll?: AeroSurfaceTravel; yaw?: AeroSurfaceTravel };
  /**
   * Angle of attack range the data covers, rad `[low, high]` (default unlimited). Outside it the tables are read at the
   * nearest edge, and the polar's lift and drag blend over 0.2 rad into a flat plate's, so a tumbling aircraft stays bounded.
   */
  alphaRange?: readonly [number, number];
  /** Largest sideslip the data covers, rad (default unlimited); beyond it the tables are read at the edge. */
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
  /** Lift coefficient build-up. */
  lift: readonly AeroTerm[];
  /** Drag coefficient build-up (zero-lift drag plus the induced and stalled drag the table carries). */
  drag: readonly AeroTerm[];
  /** Side-force coefficient build-up, positive to the right. */
  side?: readonly AeroTerm[];
  /** Angle of attack where lift peaks, rad; past it the step reports a stall (default: the surfaces decide). */
  stallAngle?: number;
  /** Induced drag factor `k` of `CD = CD0 + k·CL²` (default `0`), for the wing ground effect to relieve. */
  inducedDrag?: number;
}

/** Whole-aircraft force coefficients at one air state. */
export interface PolarCoefficients {
  lift: number;
  drag: number;
  side: number;
}

/**
 * Sums the polar's lift, drag and side-force coefficients at an air state.
 * @capability aircraft-polar whole-aircraft lift, drag and side force from published coefficient data
 */
export function polarCoefficients(effect: AircraftPolar, state: AeroState, out: PolarCoefficients): PolarCoefficients {
  out.lift = sumAeroTerms(effect.lift, state);
  out.drag = sumAeroTerms(effect.drag, state);
  out.side = sumAeroTerms(effect.side, state);
  return out;
}
