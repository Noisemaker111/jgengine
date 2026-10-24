import type { BackdropFogConfig, DirectionalLightingConfig, LightingConfig } from "../game/playableGame";
import type { SkyEnvironmentConfig } from "../world/features";
import type { GradeConfig, PostProcessingConfig } from "./postProcessing";

/**
 * Named lighting mood: one art-direction choice that sets the sun, the sky fill, the haze and the
 * colour grade together, so they agree. `"day"` is a clear afternoon, `"bright"` a saturated
 * high-fill cartoon day, `"golden"` a low warm late-afternoon sun with long shadows, `"dusk"` a
 * sunset, `"overcast"` soft diffuse light under cloud, `"night"` moonlight.
 * @capability lighting-mood one field that lights a 3D game: sun, fill, sky, haze and grade that agree
 */
export type MoodPreset = "day" | "bright" | "golden" | "dusk" | "overcast" | "night";

/** Every mood preset name, for pickers and validating a mood read from a URL or file. */
export const MOOD_PRESETS: readonly MoodPreset[] = ["day", "bright", "golden", "dusk", "overcast", "night"];

/** Where the key light stands and how strong it is. Angles in degrees: azimuth 0 = -Z, 90 = +X; elevation 90 = overhead. */
export interface MoodSun {
  azimuth?: number;
  elevation?: number;
  color?: string;
  intensity?: number;
}

/** A mood preset plus the few tokens a game's art direction usually moves. Unset fields keep the preset's value. */
export interface MoodConfig {
  /** Base mood. Default `"day"`. */
  preset?: MoodPreset;
  /** Key light placement, colour and strength (the moon under `"night"`). */
  sun?: MoodSun;
  /** Overhead sky colour: the dome's zenith and the cool fill in shadow. */
  skyColor?: string;
  /** Horizon colour: the dome's horizon and the haze that fades distant ground into it. */
  horizonColor?: string;
  /** Light bounced up from the ground into shadowed undersides. */
  groundColor?: string;
  /** Haze distance in world units; `false` keeps the air clear. */
  fog?: { near?: number; far?: number } | false;
  /** Exposure baseline before tone mapping (auto-exposure corrects around it). */
  exposure?: number;
  /** Colour saturation of the final grade; 1 is unchanged. */
  saturation?: number;
  /** Display contrast around mid-grey; 1 is unchanged. The AgX curve is flat by design, so moods add some. */
  contrast?: number;
  /** Whether the key light casts shadows. Default true. */
  shadows?: boolean;
}

/** A mood: a preset name, or a preset with token overrides. */
export type Mood = MoodPreset | MoodConfig;

type Rgb = readonly [number, number, number];

interface MoodTokens {
  skyPreset: "day" | "night";
  zenith: string;
  horizon: string;
  haze: string;
  sun: Required<MoodSun>;
  bounce: { color: string; intensity: number } | null;
  fill: { sky: string; ground: string; intensity: number };
  ambient: { color: string; intensity: number };
  fog: { near: number; far: number };
  cloudiness: number;
  hazeStrength: number;
  shadowSoftness: number;
  exposure: number;
  grade: { lift: Rgb; gain: Rgb; gamma: number; saturation: number; contrast: number };
}

const MOODS: Record<MoodPreset, MoodTokens> = {
  day: {
    skyPreset: "day",
    zenith: "#3d8fd9",
    horizon: "#cfe2ee",
    haze: "#c6dae6",
    sun: { azimuth: 140, elevation: 48, color: "#fff0d4", intensity: 1.7 },
    bounce: { color: "#8fb6dc", intensity: 0.16 },
    fill: { sky: "#a8cbea", ground: "#8a7c62", intensity: 0.3 },
    ambient: { color: "#d4dbe6", intensity: 0.2 },
    fog: { near: 140, far: 900 },
    cloudiness: 0.3,
    hazeStrength: 0.35,
    shadowSoftness: 1.25,
    exposure: 1,
    grade: { lift: [0, 0.003, 0.01], gain: [1.04, 1.01, 0.97], gamma: 1.03, saturation: 1.15, contrast: 1 },
  },
  bright: {
    skyPreset: "day",
    zenith: "#35a2f2",
    horizon: "#d9f1fb",
    haze: "#d2ecf6",
    sun: { azimuth: 150, elevation: 58, color: "#fff6e2", intensity: 2 },
    bounce: { color: "#a6cdf0", intensity: 0.12 },
    fill: { sky: "#bfe2ff", ground: "#9fb173", intensity: 0.26 },
    ambient: { color: "#e6eef8", intensity: 0.14 },
    fog: { near: 180, far: 1100 },
    cloudiness: 0.25,
    hazeStrength: 0.25,
    shadowSoftness: 1.6,
    exposure: 1.32,
    grade: { lift: [0, 0.002, 0.008], gain: [1.03, 1.02, 0.98], gamma: 1, saturation: 1.14, contrast: 1 },
  },
  golden: {
    skyPreset: "day",
    zenith: "#4f86c2",
    horizon: "#f0d4ae",
    haze: "#d6cfc2",
    sun: { azimuth: 250, elevation: 20, color: "#ffcf96", intensity: 2.7 },
    bounce: { color: "#7f9fc8", intensity: 0.36 },
    fill: { sky: "#9db7d8", ground: "#7a5b3c", intensity: 0.42 },
    ambient: { color: "#c0a88e", intensity: 0.26 },
    fog: { near: 110, far: 760 },
    cloudiness: 0.3,
    hazeStrength: 0.55,
    shadowSoftness: 1.4,
    exposure: 0.96,
    grade: { lift: [0.006, 0.004, 0.012], gain: [1.06, 1, 0.93], gamma: 0.97, saturation: 1.12, contrast: 1 },
  },
  dusk: {
    skyPreset: "day",
    zenith: "#3b4d8a",
    horizon: "#ff9f72",
    haze: "#c99a90",
    sun: { azimuth: 260, elevation: 7, color: "#ff965a", intensity: 2 },
    bounce: { color: "#6f7cc0", intensity: 0.42 },
    fill: { sky: "#7f84be", ground: "#4c3a42", intensity: 0.5 },
    ambient: { color: "#8c7ca6", intensity: 0.28 },
    fog: { near: 80, far: 620 },
    cloudiness: 0.35,
    hazeStrength: 0.7,
    shadowSoftness: 1.8,
    exposure: 1.05,
    grade: { lift: [0.018, 0.008, 0.032], gain: [1.08, 0.98, 0.92], gamma: 0.97, saturation: 1.1, contrast: 1 },
  },
  overcast: {
    skyPreset: "day",
    zenith: "#93a2b2",
    horizon: "#d3d9de",
    haze: "#c8cfd5",
    sun: { azimuth: 150, elevation: 55, color: "#e9eef4", intensity: 0.95 },
    bounce: null,
    fill: { sky: "#d5dce4", ground: "#716b5f", intensity: 0.95 },
    ambient: { color: "#c9d0d8", intensity: 0.42 },
    fog: { near: 60, far: 520 },
    cloudiness: 0.85,
    hazeStrength: 0.6,
    shadowSoftness: 4,
    exposure: 1.06,
    grade: { lift: [0.01, 0.012, 0.016], gain: [1, 1, 1.02], gamma: 0.98, saturation: 0.96, contrast: 1.06 },
  },
  night: {
    skyPreset: "night",
    zenith: "#0a1028",
    horizon: "#1d2a4a",
    haze: "#141c30",
    sun: { azimuth: 210, elevation: 42, color: "#a8bdf0", intensity: 0.6 },
    bounce: null,
    fill: { sky: "#2c3d6a", ground: "#11141d", intensity: 0.4 },
    ambient: { color: "#3c4c74", intensity: 0.24 },
    fog: { near: 40, far: 420 },
    cloudiness: 0.2,
    hazeStrength: 0.3,
    shadowSoftness: 1.6,
    exposure: 0.8,
    grade: { lift: [0, 0.004, 0.022], gain: [0.95, 1, 1.08], gamma: 1, saturation: 0.9, contrast: 1 },
  },
};

/** How far the key light sits from its target; only the direction reaches the shading. */
const LIGHT_DISTANCE = 120;
const DEG = Math.PI / 180;

/** Concrete lighting, sky and grade a mood expands to. */
export interface ResolvedMood {
  /** Shadow-casting cascaded key, a shadowless bounce opposite it, hemisphere fill and ambient. */
  lighting: LightingConfig;
  /** Dome colours, sun placement and haze; a world's sky shape (radius, clouds, day cycle) layers under it. */
  sky: SkyEnvironmentConfig;
  /** Haze colour and range for scenes with no sky dome to drive it. */
  fog: BackdropFogConfig | undefined;
  /** Exposure baseline and the grade's shadow/highlight tint and saturation. */
  postProcessing: PostProcessingConfig;
}

function directionToward(azimuth: number, elevation: number, distance: number): [number, number, number] {
  const az = azimuth * DEG;
  const el = elevation * DEG;
  const flat = Math.cos(el) * distance;
  return [Math.sin(az) * flat, Math.sin(el) * distance, -Math.cos(az) * flat];
}

function moodTokens(mood: Mood): { tokens: MoodTokens; config: MoodConfig } {
  const config: MoodConfig = typeof mood === "string" ? { preset: mood } : mood;
  return { tokens: MOODS[config.preset ?? "day"], config };
}

/**
 * Expand a mood into the lighting rig, sky and grade it stands for. The key light is the sun (the
 * moon under `"night"`), casts cascaded shadows that follow the camera, and agrees with the dome's
 * sun; a cool bounce opposite it keeps shadowed sides readable; the haze matches the horizon.
 * @capability lighting-mood expand a mood preset and its token overrides into lighting, sky, haze and grade
 */
export function resolveMood(mood: Mood): ResolvedMood {
  const { tokens, config } = moodTokens(mood);
  const sun: Required<MoodSun> = { ...tokens.sun, ...stripUndefined(config.sun ?? {}) };
  const skyColor = config.skyColor ?? tokens.zenith;
  const horizon = config.horizonColor ?? tokens.horizon;
  const haze = config.horizonColor ?? tokens.haze;
  const castShadow = config.shadows !== false;
  const key: DirectionalLightingConfig = {
    color: sun.color,
    intensity: sun.intensity,
    position: directionToward(sun.azimuth, sun.elevation, LIGHT_DISTANCE),
    castShadow,
    ...(castShadow ? { cascades: 3, shadowRadius: tokens.shadowSoftness } : {}),
  };
  const directional: DirectionalLightingConfig[] = [key];
  if (tokens.bounce !== null) {
    directional.push({
      color: tokens.bounce.color,
      intensity: tokens.bounce.intensity,
      position: directionToward(sun.azimuth + 180, 28, LIGHT_DISTANCE),
    });
  }
  const lighting: LightingConfig = {
    ambient: { color: tokens.ambient.color, intensity: tokens.ambient.intensity },
    hemisphere: {
      skyColor: config.skyColor === undefined ? tokens.fill.sky : skyColor,
      groundColor: config.groundColor ?? tokens.fill.ground,
      intensity: tokens.fill.intensity,
    },
    directional,
  };
  const fogRange = config.fog === false ? undefined : { ...tokens.fog, ...stripUndefined(config.fog ?? {}) };
  const sky: SkyEnvironmentConfig = {
    preset: tokens.skyPreset,
    zenithColor: skyColor,
    horizonColor: horizon,
    fogColor: haze,
    sunColor: sun.color,
    sun: { azimuth: sun.azimuth, elevation: sun.elevation },
    cloudiness: tokens.cloudiness,
    hazeStrength: tokens.hazeStrength,
    ...(fogRange === undefined ? { fog: { near: 1e5, far: 2e5 } } : {}),
  };
  const contrast = config.contrast ?? tokens.grade.contrast;
  const grade: GradeConfig = {
    ...contrastedTint(tokens.grade.lift, tokens.grade.gain, contrast),
    gamma: tokens.grade.gamma,
    saturation: config.saturation ?? tokens.grade.saturation,
  };
  return {
    lighting,
    sky,
    fog: fogRange === undefined ? undefined : { color: haze, near: fogRange.near, far: fogRange.far },
    postProcessing: { exposure: config.exposure ?? tokens.exposure, grade },
  };
}

/**
 * The mood a sky preset implies when a game names none, so an unlit game under a dusk or night
 * dome gets a rig that matches it rather than a noon sun.
 * @internal
 */
export function moodForSkyPreset(preset: SkyEnvironmentConfig["preset"]): MoodPreset {
  return preset === "dusk" ? "dusk" : preset === "night" ? "night" : "day";
}

/**
 * Fold a contrast around mid-grey into the grade's lift and gain. The grade computes
 * `(c + lift) * gain`, so `((c + lift) * gain - 0.5) * k + 0.5` is the same shape with the lift
 * moved by `0.5 * (1 - k) / (gain * k)` and the gain scaled by `k`.
 */
function contrastedTint(lift: Rgb, gain: Rgb, contrast: number): { lift: Rgb; gain: Rgb } {
  if (contrast === 1) return { lift, gain };
  const shift = (index: number) => lift[index]! + (0.5 * (1 - contrast)) / (gain[index]! * contrast);
  return {
    lift: [shift(0), shift(1), shift(2)],
    gain: [gain[0] * contrast, gain[1] * contrast, gain[2] * contrast],
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
