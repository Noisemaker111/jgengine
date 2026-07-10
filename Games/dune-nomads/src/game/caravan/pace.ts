import type { TerrainField } from "@jgengine/core/world/terrain";
import type { WindVector } from "@jgengine/core/world/wind";

export const SLOPE_SAMPLE_STEP = 2;
export const SLOPE_SENSITIVITY = 0.5;
export const SLOPE_TERM_MIN = 0.35;
export const SLOPE_TERM_MAX = 1.9;

export const WIND_REFERENCE_SPEED = 10;
export const WIND_SENSITIVITY = 0.5;
export const WIND_TERM_MIN = 0.4;
export const WIND_TERM_MAX = 1.8;

export const PACE_MULTIPLIER_MIN = 0.3;
export const PACE_MULTIPLIER_MAX = 2.6;

export function headingVector(headingRad: number): readonly [number, number] {
  return [Math.sin(headingRad), Math.cos(headingRad)];
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function slopeAlongHeading(
  field: TerrainField,
  x: number,
  z: number,
  headingRad: number,
  step: number = SLOPE_SAMPLE_STEP,
): number {
  const [hx, hz] = headingVector(headingRad);
  const ahead = field.sampleHeight(x + hx * step, z + hz * step);
  const behind = field.sampleHeight(x - hx * step, z - hz * step);
  return (ahead - behind) / (2 * step);
}

export function windAlignment(headingRad: number, wind: WindVector): number {
  const [hx, hz] = headingVector(headingRad);
  const windLength = Math.hypot(wind[0], wind[1]);
  if (windLength === 0) return 0;
  return (hx * wind[0] + hz * wind[1]) / windLength;
}

export interface PaceBreakdown {
  slope: number;
  slopeTerm: number;
  windAlignment: number;
  windSpeed: number;
  windTerm: number;
  multiplier: number;
}

export function computePaceMultiplier(input: {
  slope: number;
  windVector: WindVector;
  headingRad: number;
}): PaceBreakdown {
  const alignment = windAlignment(input.headingRad, input.windVector);
  const windSpeed = Math.hypot(input.windVector[0], input.windVector[1]);
  const slopeTerm = clamp(1 - input.slope * SLOPE_SENSITIVITY, SLOPE_TERM_MIN, SLOPE_TERM_MAX);
  const windTerm = clamp(
    1 + alignment * (windSpeed / WIND_REFERENCE_SPEED) * WIND_SENSITIVITY,
    WIND_TERM_MIN,
    WIND_TERM_MAX,
  );
  const multiplier = clamp(slopeTerm * windTerm, PACE_MULTIPLIER_MIN, PACE_MULTIPLIER_MAX);
  return { slope: input.slope, slopeTerm, windAlignment: alignment, windSpeed, windTerm, multiplier };
}

export type GaitGlyph = "trudging" | "steady" | "brisk" | "flying";

export function gaitGlyphFor(multiplier: number): GaitGlyph {
  if (multiplier < 0.65) return "trudging";
  if (multiplier < 1.15) return "steady";
  if (multiplier < 1.7) return "brisk";
  return "flying";
}
