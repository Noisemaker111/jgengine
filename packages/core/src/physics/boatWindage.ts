// @skill jgengine-world
/**
 * Wind on the part of a hull above the water, the `wind` option of a boat: drag on the relative wind resolved along and
 * across the hull, F = ½ ρ_air C A |U_r| U_r on the frontal and lateral areas, as ship windage is tabulated (Isherwood
 * 1972; Fujiwara et al. 2005). The yaw moment that weathervanes a hull is not modelled yet.
 *
 * @capability boat-windage push a hull with the shared wind field on its above-water areas, its own 0-upward strength dial
 */
import type { WindField } from "../world/wind";

/** Sea-level air density, kg/m³ (ISA). */
export const AIR_DENSITY = 1.225;

/**
 * A boat in a {@link WindField}. `strength` `0` is no windage, `1` the drag the coefficients give, past `1` more; the force
 * is linear in it, so it stays finite and monotone over the sane range `0..4`.
 */
export interface BoatWind {
  field: WindField;
  strength?: number;
  /** Frontal area above the water, m². Default `beam · 0.5 · beam`. */
  frontalArea?: number;
  /** Lateral area above the water, m². Default `length · 0.5 · beam`. */
  lateralArea?: number;
  /** Drag coefficient on the frontal area (head wind). Default 0.6. */
  frontalCoefficient?: number;
  /** Drag coefficient on the lateral area (beam wind). Default 0.9. */
  lateralCoefficient?: number;
  /** Height the wind is read at, m. Default 10 (where windage coefficients are referenced). */
  heightM?: number;
}

/**
 * Windage force, N, in world x/z on a hull at `x, z` heading `heading` moving at `vx, vz`.
 * @capability boat-windage push a hull with the shared wind field on its above-water areas, its own 0-upward strength dial
 */
export function boatWindageForce(wind: BoatWind, hull: { length: number; beam: number }, x: number, z: number, heading: number, vx: number, vz: number, time: number): [number, number] {
  const strength = wind.strength ?? 1;
  if (!Number.isFinite(strength) || strength < 0) throw new Error(`boat wind strength must be finite and >= 0 (got ${strength})`);
  if (strength === 0) return [0, 0];
  const [wx, wz] = wind.field.atHeight(x, z, wind.heightM ?? 10, time);
  const rx = wx - vx;
  const rz = wz - vz;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const along = rx * fx + rz * fz;
  const across = -rx * fz + rz * fx;
  const half = 0.5 * AIR_DENSITY * strength;
  const frontal = (wind.frontalArea ?? 0.5 * hull.beam * hull.beam) * (wind.frontalCoefficient ?? 0.6);
  const lateral = (wind.lateralArea ?? 0.5 * hull.length * hull.beam) * (wind.lateralCoefficient ?? 0.9);
  const fAlong = half * frontal * Math.abs(along) * along;
  const fAcross = half * lateral * Math.abs(across) * across;
  return [fAlong * fx - fAcross * fz, fAlong * fz + fAcross * fx];
}
