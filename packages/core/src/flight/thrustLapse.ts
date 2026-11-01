// @skill jgengine-world

/**
 * The thrust lapse effect of a jet engine: thrust at full dry (and full afterburner) power changes with altitude and
 * Mach number, the way a real engine loses most of its thrust in thin air and regains some from ram pressure.
 * Ratios are to sea-level static thrust; between breakpoints they are bilinear, past the ends held flat.
 */
export interface AircraftThrustLapse {
  /**
   * Multiplier on the effect: `0` off (thrust ignores the air, the simple model), `1` the lapse as tabled (default),
   * past `1` each ratio raised to the strength (thrust falls off faster with height); sane over `0..4`.
   */
  strength?: number;
  /** Mach breakpoints, rows of the tables (default `0` to `1.2` every `0.2`). */
  machs?: readonly number[];
  /** Altitude breakpoints above mean sea level, m, columns of the tables (default `0` to 15 240 m every 3048 m). */
  altitudes?: readonly number[];
  /** Full dry thrust over sea-level static, row-major by Mach then altitude (default the F100-PW-220 cycle). */
  dry?: readonly number[];
  /** Full afterburner thrust over its sea-level static value, same grid (default the F100-PW-220 cycle). */
  wet?: readonly number[];
  /** Height of the world's `y = 0` above mean sea level, m (default `0`). */
  elevation?: number;
}

const MACHS = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2];
const ALTITUDES = [0, 3048, 6096, 9144, 12192, 15240];

/**
 * F100-PW-220 installed thrust lapse from the reference engine cycle (`scripts/reference/flight/gasTurbine.ts`, sized to
 * the published ratings and fitted to NASA TP-1538's F-16 thrust tables): full dry thrust over sea-level static.
 */
export const F100_DRY_LAPSE: readonly number[] = [
  1, 0.707, 0.489, 0.327, 0.208, 0.129, 0.921, 0.656, 0.454, 0.304, 0.194, 0.12, 0.895, 0.649, 0.451, 0.303, 0.193, 0.12, 0.931, 0.693, 0.476, 0.32,
  0.205, 0.127, 0.942, 0.739, 0.532, 0.359, 0.23, 0.143, 0.945, 0.811, 0.631, 0.422, 0.271, 0.168, 0.955, 0.821, 0.675, 0.517, 0.33, 0.204,
];

/** F100-PW-220 full afterburner thrust lapse from the same cycle, over its sea-level static value. */
export const F100_WET_LAPSE: readonly number[] = [
  1, 0.729, 0.521, 0.361, 0.236, 0.146, 0.962, 0.707, 0.506, 0.352, 0.23, 0.143, 0.98, 0.73, 0.524, 0.366, 0.24, 0.148, 1.063, 0.804, 0.575, 0.402,
  0.264, 0.164, 1.151, 0.899, 0.661, 0.464, 0.305, 0.189, 1.266, 1.035, 0.794, 0.555, 0.366, 0.227, 1.417, 1.153, 0.908, 0.68, 0.447, 0.277,
];

function bracket(points: readonly number[], x: number): { index: number; t: number } {
  let index = 0;
  while (index < points.length - 2 && x >= (points[index + 1] ?? 0)) index += 1;
  const x0 = points[index] ?? 0;
  const x1 = points[index + 1] ?? x0;
  return { index, t: x1 > x0 ? Math.max(0, Math.min(1, (x - x0) / (x1 - x0))) : 0 };
}

/**
 * The tabled thrust ratio at an altitude above mean sea level, m, and Mach, before the strength.
 * @capability aircraft-thrust-lapse jet thrust over sea-level static by altitude and Mach
 */
export function lapseRatio(effect: AircraftThrustLapse, altitude: number, mach: number, afterburner: boolean): number {
  const machs = effect.machs ?? MACHS;
  const altitudes = effect.altitudes ?? ALTITUDES;
  const table = afterburner ? (effect.wet ?? effect.dry ?? F100_WET_LAPSE) : (effect.dry ?? F100_DRY_LAPSE);
  const m = bracket(machs, mach);
  const a = bracket(altitudes, altitude);
  const columns = altitudes.length;
  const at = (row: number, column: number) => table[row * columns + column] ?? 0;
  const low = at(m.index, a.index) + (at(m.index, a.index + 1) - at(m.index, a.index)) * a.t;
  const high = at(m.index + 1, a.index) + (at(m.index + 1, a.index + 1) - at(m.index + 1, a.index)) * a.t;
  return Math.max(0, low + (high - low) * m.t);
}

/**
 * The thrust multiplier the lapse effect applies at a strength: a blend from `1` (no lapse) to the tabled ratio up to
 * strength 1, then the ratio raised to the strength.
 * @capability aircraft-thrust-lapse jet thrust lapse with altitude and Mach under a strength dial
 */
export function thrustLapse(effect: AircraftThrustLapse, strength: number, y: number, mach: number, afterburner: boolean): number {
  const ratio = lapseRatio(effect, y + (effect.elevation ?? 0), mach, afterburner);
  if (strength <= 0) return 1;
  return strength <= 1 ? 1 + (ratio - 1) * strength : ratio ** strength;
}
