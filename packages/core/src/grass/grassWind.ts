// @skill jgengine-world
/**
 * Grass that sways in the shared {@link WindField}: a kind's own wind numbers stay its look in still air, and with a
 * field each patch reads the wind at its blades, so one wind bends every meadow the same way at the same moment.
 *
 * @capability grass-wind sway grass in the shared wind field with a per-kind response dial
 */
import type { WindField, WindVector } from "../world/wind";
import type { GrassBlade, GrassWind } from "./grassKind";

/** The wind numbers a grass look animates with. */
export type GrassWindLook = GrassWind;

/**
 * A shared wind for a grass patch. `response` is the patch's dial: `0` blades stand still, `1` the kind's own
 * `windStrength` at {@link GRASS_WIND_REFERENCE_SPEED}, past `1` softer grass; sway stays below one blade-bend and
 * is monotone over the sane range `0..4`.
 */
export interface GrassWindSource {
  field: WindField;
  response?: number;
}

/** Wind speed, m/s, a grass kind's `windStrength` was tuned to: a gentle-to-moderate breeze (Beaufort 3–4). */
export const GRASS_WIND_REFERENCE_SPEED = 5;

/** Height, m, grass samples the field at; the log-law profile holds speed constant below its minimum height. */
export const GRASS_WIND_SAMPLE_HEIGHT = 1;

/**
 * The look's wind numbers under a wind vector: sway saturates with the drag (∝ U²), animation speeds up with √U.
 * @capability grass-wind sway grass in the shared wind field with a per-kind response dial
 */
export function grassWindLook(look: GrassWindLook, wind: WindVector, response = 1): GrassWindLook {
  if (!Number.isFinite(response) || response < 0) throw new Error(`grass wind response must be finite and >= 0 (got ${response})`);
  const speed = Math.hypot(wind[0], wind[1]);
  const drive = response * look.windStrength * (speed / GRASS_WIND_REFERENCE_SPEED) ** 2;
  return {
    windStrength: 1 - Math.exp(-drive),
    windSpeed: Math.min(4, look.windSpeed * Math.sqrt(speed / GRASS_WIND_REFERENCE_SPEED)),
    windGust: look.windGust,
    windDirection: speed === 0 ? look.windDirection : ((Math.atan2(wind[1], wind[0]) * 180) / Math.PI + 360) % 360,
  };
}

/**
 * Largest sideways blade-tip travel, m, a look's wind numbers give a blade of `stiffness` (the shader's sway and flutter).
 * @capability grass-wind sway grass in the shared wind field with a per-kind response dial
 */
export function grassSwayAmplitude(look: Pick<GrassWind, "windStrength"> & Pick<GrassBlade, "stiffness">): number {
  return look.windStrength * 0.78 * (1.25 - look.stiffness);
}

/**
 * Sample a shared wind at a grass patch's world centre.
 * @capability grass-wind sway grass in the shared wind field with a per-kind response dial
 */
export function grassWindAt(wind: GrassWindSource, x: number, z: number, time: number): WindVector {
  return wind.field.atHeight(x, z, GRASS_WIND_SAMPLE_HEIGHT, time);
}
