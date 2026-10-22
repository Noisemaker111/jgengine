/**
 * Calibration of the output pipeline, in linear scene luminance (1.0 = a white-looking surface at
 * exposure 1).
 *
 * `WHITE_POINT` is the luminance the pipeline prints as display white under AgX. Everything above it
 * is highlight headroom the tone curve rolls off, so a material meant to read as white is authored at
 * 1.0 rather than at whatever the sun happened to be set to.
 * `MID_GREY` is an 18% grey card — the metering target. Clamped auto-exposure drives the frame's key
 * luminance here, which is what makes one material read the same in a street at noon and a lamp-lit
 * room. There is one white point and one metering target; a second copy anywhere would make a grade
 * depend on which stage read it.
 */
export const WHITE_POINT = 1;

/** Linear scene luminance of an 18% grey card — the auto-exposure metering target. */
export const MID_GREY = 0.18;

/**
 * Pixels count toward metering up to this multiple of {@link WHITE_POINT}. A window or a sun disc sits
 * far above it and would otherwise pull the whole frame down to a silhouette.
 */
export const METERING_HIGHLIGHT_CEILING = WHITE_POINT * 8;

/** Bounds and adaptation policy for clamped auto-exposure. */
export interface AutoExposureConfig {
  /** Lowest exposure multiplier the meter may reach. Default 0.6 (0.7 stops down). */
  min?: number;
  /** Highest exposure multiplier the meter may reach. Default 2.5 (1.3 stops up). */
  max?: number;
  /** Seconds for the meter to cover ~63% of a gap to a new key luminance. Default 0.6. */
  adaptationSeconds?: number;
}

/**
 * Default clamped auto-exposure. The range is deliberately asymmetric: a bright street is already
 * readable after AgX's shoulder, while a lamp-lit interior is the case that crushes, so the meter may
 * lift 1.3 stops but only darken 0.7 — an artist's exposure survives.
 */
export const DEFAULT_AUTO_EXPOSURE: Readonly<Required<AutoExposureConfig>> = {
  min: 0.6,
  max: 2.5,
  adaptationSeconds: 0.6,
};

/**
 * Exposure that places a frame whose key luminance is `keyLuminance` on {@link MID_GREY}, bounded by
 * the authored range. A dark interior asks for more than `max` and gets `max`; a blown-out exterior
 * asks for less than `min` and gets `min`, so the frame never runs away at either end.
 */
export function exposureForKey(keyLuminance: number, config: AutoExposureConfig = {}): number {
  const min = config.min ?? DEFAULT_AUTO_EXPOSURE.min;
  const max = config.max ?? DEFAULT_AUTO_EXPOSURE.max;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (!Number.isFinite(keyLuminance) || keyLuminance <= 0) return high;
  return Math.min(high, Math.max(low, MID_GREY / keyLuminance));
}

/**
 * Frame-rate independent blend of `current` toward `target`, exponential in time so a hitch does not
 * overshoot and a steady view settles. `deltaSeconds` may be 0..∞; a zero-length step keeps `current`.
 */
export function adaptExposure(current: number, target: number, deltaSeconds: number, adaptationSeconds = DEFAULT_AUTO_EXPOSURE.adaptationSeconds): number {
  if (!Number.isFinite(target)) return current;
  if (!(deltaSeconds > 0)) return current;
  if (!(adaptationSeconds > 0)) return target;
  const blend = 1 - Math.exp(-deltaSeconds / adaptationSeconds);
  return current + (target - current) * blend;
}

/**
 * Key luminance of a metered frame: the median of its samples, each clamped to
 * {@link METERING_HIGHLIGHT_CEILING}. A median rather than a mean because a bright sky, a window or a
 * lamp is a large minority of the frame: averaging those in drags an interior down to a silhouette,
 * where the median still reports the room.
 */
export function keyLuminanceFromSamples(samples: ArrayLike<number>): number {
  if (samples.length === 0) return MID_GREY;
  const values: number[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index]!;
    if (!(value > 0) || !Number.isFinite(value)) continue;
    values.push(Math.min(value, METERING_HIGHLIGHT_CEILING));
  }
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return values[Math.floor((values.length - 1) / 2)]!;
}
