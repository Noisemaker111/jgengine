import type { SkySunConfig } from "@jgengine/core/world/features";

export interface DaylightCycleConfig {
  horizonColor?: string;
  zenithColor?: string;
  sunIntensity?: number;
  ambientIntensity?: number;
  /** Fixed sun placement, or the noon placement the day arc swings around. Unset keeps the engine arc. */
  sun?: SkySunConfig;
}

export interface DaylightState {
  sunPosition: [number, number, number];
  sunIntensity: number;
  ambientIntensity: number;
  skyTop: string;
  skyBottom: string;
  background: string;
}

interface DaylightKeyframe {
  t: number;
  sunIntensity: number;
  ambientIntensity: number;
  skyTop: string;
  skyBottom: string;
}

const NIGHT_SUN_INTENSITY = 0.02;
const NIGHT_AMBIENT_INTENSITY = 0.08;
const NIGHT_SKY_TOP = "#02030a";
const NIGHT_SKY_BOTTOM = "#05070f";

const DAWN_SUN_INTENSITY = 0.45;
const DAWN_AMBIENT_INTENSITY = 0.3;
const DAWN_SKY_TOP = "#3c5a82";
const DAWN_SKY_BOTTOM = "#ffb37a";

const DUSK_SUN_INTENSITY = 0.45;
const DUSK_AMBIENT_INTENSITY = 0.3;
const DUSK_SKY_TOP = "#4a3a5c";
const DUSK_SKY_BOTTOM = "#ff8a5c";

export const DEFAULT_DAY_SUN_INTENSITY = 1;
export const DEFAULT_DAY_AMBIENT_INTENSITY = 0.6;
export const DEFAULT_DAY_SKY_TOP = "#3fa4f2";
export const DEFAULT_DAY_SKY_BOTTOM = "#e3f4ff";

const SUN_DISTANCE = 200;
const SUN_DEPTH_RATIO = 0.4;
const DEG = Math.PI / 180;
/** The engine arc's noon height: `atan(1 / SUN_DEPTH_RATIO)`, ~68 degrees. */
export const DEFAULT_SUN_ELEVATION_DEG = Math.atan2(1, SUN_DEPTH_RATIO) / DEG;

/**
 * Unit direction toward a sun at compass `azimuth` (0 = -Z, 90 = +X) and `elevation` above the
 * horizon, both in degrees. Shared by the dome glow, the sky-owned sun light, and the editor.
 * @internal
 */
export function sunDirectionFromBearing(azimuth: number, elevation: number): [number, number, number] {
  const az = azimuth * DEG;
  const el = elevation * DEG;
  const flat = Math.cos(el);
  return [Math.sin(az) * flat, Math.sin(el), -Math.cos(az) * flat];
}

/**
 * Inverse of {@link sunDirectionFromBearing}: the bearing/elevation (degrees) of a world-space
 * direction such as an authored directional light's position. A zero vector reads as overhead.
 * @internal
 */
export function bearingFromDirection(direction: readonly [number, number, number]): { azimuth: number; elevation: number } {
  const [x, y, z] = direction;
  const length = Math.hypot(x, y, z);
  if (length === 0) return { azimuth: 0, elevation: 90 };
  const azimuth = ((Math.atan2(x, -z) / DEG) + 360) % 360;
  const elevation = Math.asin(Math.max(-1, Math.min(1, y / length))) / DEG;
  return { azimuth, elevation };
}

export const SKY_PRESET_DAY_FRACTION: Record<"day" | "dusk" | "night", number> = {
  night: 0,
  day: 0.5,
  dusk: 0.75,
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  const value = parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((channel) => clampByte(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** @internal */
export function lerpHexColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t)]);
}

function buildKeyframes(config: DaylightCycleConfig): readonly DaylightKeyframe[] {
  const night: DaylightKeyframe = {
    t: 0,
    sunIntensity: NIGHT_SUN_INTENSITY,
    ambientIntensity: NIGHT_AMBIENT_INTENSITY,
    skyTop: NIGHT_SKY_TOP,
    skyBottom: NIGHT_SKY_BOTTOM,
  };
  const dawn: DaylightKeyframe = {
    t: 0.25,
    sunIntensity: DAWN_SUN_INTENSITY,
    ambientIntensity: DAWN_AMBIENT_INTENSITY,
    skyTop: DAWN_SKY_TOP,
    skyBottom: DAWN_SKY_BOTTOM,
  };
  const day: DaylightKeyframe = {
    t: 0.5,
    sunIntensity: config.sunIntensity ?? DEFAULT_DAY_SUN_INTENSITY,
    ambientIntensity: config.ambientIntensity ?? DEFAULT_DAY_AMBIENT_INTENSITY,
    skyTop: config.zenithColor ?? DEFAULT_DAY_SKY_TOP,
    skyBottom: config.horizonColor ?? DEFAULT_DAY_SKY_BOTTOM,
  };
  const dusk: DaylightKeyframe = {
    t: 0.75,
    sunIntensity: DUSK_SUN_INTENSITY,
    ambientIntensity: DUSK_AMBIENT_INTENSITY,
    skyTop: DUSK_SKY_TOP,
    skyBottom: DUSK_SKY_BOTTOM,
  };
  const midnight: DaylightKeyframe = { ...night, t: 1 };
  return [night, dawn, day, dusk, midnight];
}

function wrapFraction(dayFraction: number): number {
  return ((dayFraction % 1) + 1) % 1;
}

function segmentAt(
  wrapped: number,
  keyframes: readonly DaylightKeyframe[],
): { from: DaylightKeyframe; to: DaylightKeyframe; localT: number } {
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const from = keyframes[index]!;
    const to = keyframes[index + 1]!;
    if (wrapped >= from.t && wrapped <= to.t) {
      const span = to.t - from.t;
      const localT = span <= 0 ? 0 : clamp01((wrapped - from.t) / span);
      return { from, to, localT };
    }
  }
  const last = keyframes[keyframes.length - 1]!;
  return { from: last, to: last, localT: 0 };
}

/**
 * Samples the daylight cycle at a point in the day (0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk),
 * lerping sun position/intensity, ambient intensity, and sky colors through a dawn/day/dusk/night
 * keyframe table. `config` overrides the noon (peak-day) colors and intensities only.
  * @internal
  */
export function daylightStateAt(dayFraction: number, config: DaylightCycleConfig = {}): DaylightState {
  const wrapped = wrapFraction(dayFraction);
  const keyframes = buildKeyframes(config);
  const { from, to, localT } = segmentAt(wrapped, keyframes);

  const sunIntensity = lerp(from.sunIntensity, to.sunIntensity, localT);
  const ambientIntensity = lerp(from.ambientIntensity, to.ambientIntensity, localT);
  const skyTop = lerpHexColor(from.skyTop, to.skyTop, localT);
  const skyBottom = lerpHexColor(from.skyBottom, to.skyBottom, localT);

  const sunPosition = sunPositionAt(wrapped, config.sun);

  return { sunPosition, sunIntensity, ambientIntensity, skyTop, skyBottom, background: skyBottom };
}

/**
 * Sun position for a wrapped day fraction. Without `sun`, the legacy arc: east at dawn, ~68 degrees
 * up at noon, west at dusk, tilted 0.4 toward +Z. With `sun`, the arc is rotated so noon lands
 * exactly on the authored bearing and elevation and the sun still rises 90 degrees before it and
 * sets 90 degrees after it, so a fixed preset (noon, dusk, night fractions) samples the same arc.
 */
function sunPositionAt(wrapped: number, sun: SkySunConfig | undefined): [number, number, number] {
  const angle = (wrapped - 0.25) * 2 * Math.PI;
  const along = Math.cos(angle);
  const up = Math.sin(angle);
  if (sun === undefined) {
    return [along * SUN_DISTANCE, up * SUN_DISTANCE, SUN_DISTANCE * SUN_DEPTH_RATIO];
  }
  const noon = sunDirectionFromBearing(sun.azimuth ?? 0, sun.elevation ?? DEFAULT_SUN_ELEVATION_DEG);
  const horizon = normalize([noon[0], 0, noon[2]], [0, 0, -1]);
  const east: [number, number, number] = [-horizon[2], 0, horizon[0]];
  const zenith = normalize(cross(east, noon), [0, 1, 0]);
  const rise = normalize(cross(noon, zenith), east);
  return [
    (rise[0] * along + noon[0] * up) * SUN_DISTANCE,
    (rise[1] * along + noon[1] * up) * SUN_DISTANCE,
    (rise[2] * along + noon[2] * up) * SUN_DISTANCE,
  ];
}

function cross(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: readonly [number, number, number], fallback: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length < 1e-6 ? [fallback[0], fallback[1], fallback[2]] : [v[0] / length, v[1] / length, v[2] / length];
}
