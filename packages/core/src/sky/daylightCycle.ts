import type { SkySunConfig } from "../world/features";
import {
  elevationOf,
  MOONLIGHT_COLOR,
  moonIllumination,
  NIGHT_FOG_COLOR,
  starOpacity,
  sunlightColor,
} from "./physicalSky";
import { lerp } from "../anim/easing";
import { hexToRgb, mixHex, rgbToHex } from "../render/color";

export interface DaylightCycleConfig {
  horizonColor?: string;
  zenithColor?: string;
  /** How long the noon keyframe holds either side of noon, as a fraction of the day (0 to 0.24). Default 0. */
  dayHold?: number;
  sunIntensity?: number;
  ambientIntensity?: number;
  /** Fixed sun placement, or the noon placement the day arc swings around. Unset keeps the engine arc. */
  sun?: SkySunConfig;
  /** Authored noon sun colour, reddened toward the horizon by the atmosphere. Default warm white. */
  sunColor?: string;
  /** Authored noon fog colour; dawn, dusk and night cross-fade to their own haze. Default the noon horizon. */
  fogColor?: string;
  /** Peak moonlight as a fraction of `sunIntensity`. Default `MOONLIGHT_PEAK`. */
  moonIntensity?: number;
  /** Moonlight colour. Default `MOONLIGHT_COLOR`. */
  moonColor?: string;
}

export interface DaylightState {
  sunPosition: [number, number, number];
  sunIntensity: number;
  /** The sun's colour at this hour: authored tint high up, atmosphere-reddened near the horizon. */
  sunColor: string;
  ambientIntensity: number;
  skyTop: string;
  skyBottom: string;
  background: string;
  /** Scene fog colour matched to the sky at this hour, so fogged ground meets the horizon. */
  fogColor: string;
  /** The moon's direction — the sun's arc half a day away, so it is up whenever the sun is down. */
  moonPosition: [number, number, number];
  /** Moonlight intensity, already scaled by the authored noon sun intensity. */
  moonIntensity: number;
  moonColor: string;
  /** Star visibility, 0 in daylight and 1 with the sun well under the horizon. */
  starOpacity: number;
}

interface DaylightKeyframe {
  t: number;
  sunIntensity: number;
  ambientIntensity: number;
  skyTop: string;
  skyBottom: string;
  fog: string;
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
/** Warm-white noon sun used when the game authored no sun tint (the shell's `SUN_COLOR`). */
export const DEFAULT_SUN_COLOR = "#fff1c9";

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

function buildKeyframes(config: DaylightCycleConfig): readonly DaylightKeyframe[] {
  const night: DaylightKeyframe = {
    t: 0,
    sunIntensity: NIGHT_SUN_INTENSITY,
    ambientIntensity: NIGHT_AMBIENT_INTENSITY,
    skyTop: NIGHT_SKY_TOP,
    skyBottom: NIGHT_SKY_BOTTOM,
    fog: NIGHT_FOG_COLOR,
  };
  const dawn: DaylightKeyframe = {
    t: 0.25,
    sunIntensity: DAWN_SUN_INTENSITY,
    ambientIntensity: DAWN_AMBIENT_INTENSITY,
    skyTop: DAWN_SKY_TOP,
    skyBottom: DAWN_SKY_BOTTOM,
    fog: DAWN_SKY_BOTTOM,
  };
  const day: DaylightKeyframe = {
    t: 0.5,
    sunIntensity: config.sunIntensity ?? DEFAULT_DAY_SUN_INTENSITY,
    ambientIntensity: config.ambientIntensity ?? DEFAULT_DAY_AMBIENT_INTENSITY,
    skyTop: config.zenithColor ?? DEFAULT_DAY_SKY_TOP,
    skyBottom: config.horizonColor ?? DEFAULT_DAY_SKY_BOTTOM,
    fog: config.fogColor ?? config.horizonColor ?? DEFAULT_DAY_SKY_BOTTOM,
  };
  const dusk: DaylightKeyframe = {
    t: 0.75,
    sunIntensity: DUSK_SUN_INTENSITY,
    ambientIntensity: DUSK_AMBIENT_INTENSITY,
    skyTop: DUSK_SKY_TOP,
    skyBottom: DUSK_SKY_BOTTOM,
    fog: DUSK_SKY_BOTTOM,
  };
  const midnight: DaylightKeyframe = { ...night, t: 1 };
  const hold = Math.max(0, Math.min(0.24, config.dayHold ?? 0));
  if (hold === 0) return [night, dawn, day, dusk, midnight];
  return [night, dawn, { ...day, t: 0.5 - hold }, { ...day, t: 0.5 + hold }, dusk, midnight];
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
 * lerping sun position/intensity, ambient intensity, sky and fog colors through a dawn/day/dusk/night
 * keyframe table, and deriving sun tint, moonlight and star visibility from the sun's elevation.
 * `config` overrides the noon (peak-day) colors and intensities only.
 * @internal
 */
export function daylightStateAt(dayFraction: number, config: DaylightCycleConfig = {}): DaylightState {
  const wrapped = wrapFraction(dayFraction);
  const keyframes = buildKeyframes(config);
  const { from, to, localT } = segmentAt(wrapped, keyframes);

  const sunIntensity = lerp(from.sunIntensity, to.sunIntensity, localT);
  const ambientIntensity = lerp(from.ambientIntensity, to.ambientIntensity, localT);
  const skyTop = mixHex(from.skyTop, to.skyTop, localT);
  const skyBottom = mixHex(from.skyBottom, to.skyBottom, localT);
  const fogColor = mixHex(from.fog, to.fog, localT);

  const sunPosition = sunPositionAt(wrapped, config.sun);
  const moonPosition = sunPositionAt(wrapped + 0.5, config.sun);
  const sunColor = mixHex(
    config.sunColor ?? DEFAULT_SUN_COLOR,
    sunlightColor(elevationOf(sunPosition)),
    lowSunWeight(wrapped),
  );

  return {
    sunPosition,
    sunIntensity,
    sunColor,
    ambientIntensity,
    skyTop,
    skyBottom,
    background: skyBottom,
    fogColor,
    moonPosition,
    moonIntensity: moonIllumination(elevationOf(moonPosition), config.moonIntensity) * (config.sunIntensity ?? DEFAULT_DAY_SUN_INTENSITY),
    moonColor: config.moonColor ?? MOONLIGHT_COLOR,
    starOpacity: starOpacity(elevationOf(sunPosition)),
  };
}

/** How much of the sun's colour comes from the atmosphere rather than the authored tint: 0 with the sun high, 1 once it is on the horizon. */
function lowSunWeight(wrapped: number): number {
  return Math.min(1, Math.abs(wrapped - 0.5) / 0.25);
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

/**
 * The fog color a biome-banded sky shows at the camera. Without a day cycle the bands own it: the
 * sampled band color, which already falls back to the sky's authored fog between colorless bands.
 * Under a day cycle the sky owns it (its authored fog, else the cycle's), so a fixed noon tint never
 * hangs in a night sky.
 */
export function bandFogColor(input: { authored: string | undefined; timeOfDay: boolean; cycle: string; band: string }): string {
  return input.timeOfDay ? (input.authored ?? input.cycle) : input.band;
}

/** The grey an overcast sky takes over a colour: its own brightness, dimmed and a touch cool. */
function overcastGrey(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) * 0.72;
  return rgbToHex(luminance * 0.96, luminance, luminance * 1.04);
}

/**
 * A daylight state under cloud: `cover` 0 is the clear sky, 1 a full storm. Dome, horizon and fog turn
 * grey at their own brightness (so a stormy night stays dark), the sun dims to a fifth, the fill a
 * little, and the moon and stars go behind the cloud.
 * @capability weather-overcast grey the sky, dim the sun and hide the stars while rain or snow falls
 */
export function overcastDaylight(state: DaylightState, cover: number): DaylightState {
  const t = clamp01(cover);
  if (t === 0) return state;
  const skyBottom = mixHex(state.skyBottom, overcastGrey(state.skyBottom), t);
  return {
    ...state,
    skyTop: mixHex(state.skyTop, overcastGrey(state.skyTop), t),
    skyBottom,
    background: skyBottom,
    fogColor: mixHex(state.fogColor, overcastGrey(state.fogColor), t),
    sunIntensity: state.sunIntensity * (1 - 0.8 * t),
    ambientIntensity: state.ambientIntensity * (1 - 0.25 * t),
    moonIntensity: state.moonIntensity * (1 - 0.8 * t),
    starOpacity: state.starOpacity * (1 - t),
  };
}
