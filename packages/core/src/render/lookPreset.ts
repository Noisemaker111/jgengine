import type { BackdropConfig, LightingConfig } from "../game/playableGame";
import type { SkyEnvironmentConfig } from "../world/features";
import { moodForSkyPreset, resolveMood, type Mood, type MoodConfig, type ResolvedMood } from "./lookMood";
import type { PostProcessingConfig } from "./postProcessing";

/**
 * Named look preset composing the existing lighting/sky/fog/post knobs into one field.
 * `"neutral"` (the default when unset) keeps presentation unstyled; `"cinematic"` draws a scene lit like a shipped game — a real day sky
 * with a view-following shadow-casting sun + hemisphere fill, a network-free image-based-lighting
 * environment so PBR surfaces catch soft reflections, and a tuned tone-map/bloom/AO/vignette post
 * stack. `"comic"` adds ink outlines and cel bands over a saturated grade (Borderlands-style);
 * `"retro"` pixelates and posterizes the frame. `"flat"` opts out of the sky/IBL/post rig to the bare ambient+directional default (pre-#773).
 * The upgraded default primitive materials — tuned roughness/metalness plus subtle procedural surface
 * detail so un-modeled boxes/capsules stop reading as flat plastic — apply under both presets.
 * @capability default-look one field that lights a scene like a shipped game (opt out with "flat")
 */
export type LookPreset = "neutral" | "photoreal" | "toon" | "comic" | "retro" | "cinematic" | "flat";

/** Every look preset name, for pickers and validating a preset read from a URL or file. */
export const LOOK_PRESETS: readonly LookPreset[] = ["neutral", "photoreal", "cinematic", "toon", "comic", "retro", "flat"];

/** Explicit graphics knobs a game may set; the preset only fills the ones left undefined. */
export interface GameLookInput {
  look?: LookPreset;
  /** Lighting mood; see {@link resolveGameLook} for when an unset mood is filled in. */
  mood?: Mood;
  lighting?: LightingConfig;
  backdrop?: BackdropConfig;
  postProcessing?: PostProcessingConfig;
  /** True when the world already declares its own sky — the preset then leaves the sky to the world. */
  hasWorldSky?: boolean;
  /** The sky the world declares. A mood keeps its shape (radius, clouds, day cycle) and repaints its colours and sun. */
  worldSky?: SkyEnvironmentConfig;
  /** Sky fields the scene document authored; they win over the mood and the world. */
  documentSky?: SkyEnvironmentConfig;
}

/** Concrete lighting/backdrop/post the shell renders after the preset has filled unset knobs. */
export interface ResolvedGameLook {
  lighting?: LightingConfig;
  backdrop?: BackdropConfig;
  postProcessing?: PostProcessingConfig;
}

/** A static day sky: a real dome plus the shell's view-following shadow-casting sun and hemisphere fill. */
export const CINEMATIC_SKY: SkyEnvironmentConfig = { preset: "day" };

/**
 * Tuned tone-map + bloom + gentle SSAO + vignette/grade stack — the shipped-game post look. ACES,
 * not the pipeline's AgX: under a sunny sky AgX's flat curve reads as a milky veil over the whole
 * frame, and every shipped game had already switched this preset to ACES by hand.
 */
export const CINEMATIC_POST_PROCESSING: PostProcessingConfig = {
  toneMapping: "aces",
  bloom: {},
  ao: { intensity: 1.4 },
  grade: {},
};

/** Unstyled baseline: no bloom or grade; contact AO stays at the graphics-tier default. */
export const NEUTRAL_POST_PROCESSING: PostProcessingConfig = {
  toneMapping: "agx",
  bloom: false,
  grade: false,
};

/** High-contrast physically based presentation for authored HDR environments. */
export const PHOTOREAL_POST_PROCESSING: PostProcessingConfig = {
  toneMapping: "agx",
  bloom: { strength: 0.28, radius: 0.58, threshold: 0.9 },
  ao: { intensity: 1.25, radius: 1.6 },
  grade: { saturation: 1.04, vignette: 0.08, grain: 0.004 },
};

/** Clean graphic presentation; toon materials remain game-owned while this sets the grade. */
export const TOON_POST_PROCESSING: PostProcessingConfig = {
  toneMapping: "linear",
  bloom: { strength: 0.08, radius: 0.35, threshold: 1.1 },
  ao: { intensity: 0.8, radius: 1.2 },
  grade: { saturation: 1.18, gamma: 1, vignette: 0, grain: 0 },
};

/** Ink outlines, four cel bands and a punchy grade — a hand-inked comic look on any model. */
export const COMIC_POST_PROCESSING: PostProcessingConfig = {
  toneMapping: "agx",
  exposure: 1.05,
  aa: "msaa",
  bloom: { strength: 0.12, radius: 0.4, threshold: 1 },
  ao: { intensity: 1, radius: 1.2 },
  stylize: { outline: { thickness: 1.5 }, bands: 4 },
  grade: { saturation: 1.3, gamma: 0.94, vignette: 0.15, grain: 0 },
};

/** Chunky pixels and posterized colour with no smoothing — a low-resolution retro look. */
export const RETRO_POST_PROCESSING: PostProcessingConfig = {
  toneMapping: "agx",
  aa: false,
  bloom: false,
  ao: false,
  stylize: { pixelSize: 3, bands: 6 },
  grade: { saturation: 1.15, gamma: 1, vignette: 0, grain: 0 },
};

const PRESET_POST: Record<Exclude<LookPreset, "neutral" | "flat">, PostProcessingConfig> = {
  photoreal: PHOTOREAL_POST_PROCESSING,
  toon: TOON_POST_PROCESSING,
  comic: COMIC_POST_PROCESSING,
  retro: RETRO_POST_PROCESSING,
  cinematic: CINEMATIC_POST_PROCESSING,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeStage(preset: unknown, authored: unknown): unknown {
  if (authored === undefined) return preset;
  if (!isPlainObject(authored) || !isPlainObject(preset)) return authored;
  const merged: Record<string, unknown> = { ...preset };
  for (const [key, value] of Object.entries(authored)) merged[key] = mergeStage(preset[key], value);
  return merged;
}

/**
 * Deep-merge a game's partial post chain over a preset's. Every field the game set wins, including
 * `false` to drop a stage; fields it left unset come from the preset, and stage objects merge field by
 * field (tuples such as `grade.lift` replace whole).
 * @capability merge-post-processing layer a partial post chain over a look preset without losing its stages
 */
export function mergePostProcessing(preset: PostProcessingConfig, authored: PostProcessingConfig | undefined): PostProcessingConfig {
  if (authored === undefined) return preset;
  return mergeStage(preset, authored) as PostProcessingConfig;
}

/**
 * Layer `top`'s defined sky fields over `base`, merging the nested `sun` and `fog` objects field by
 * field. Either side may be absent.
 * @internal
 */
export function overlaySky(base: SkyEnvironmentConfig | undefined, top: SkyEnvironmentConfig | undefined): SkyEnvironmentConfig | undefined {
  if (top === undefined) return base;
  if (base === undefined) return top;
  const merged: SkyEnvironmentConfig = { ...base, ...definedFields(top) };
  if (top.sun !== undefined) merged.sun = { ...base.sun, ...definedFields(top.sun) };
  if (top.fog !== undefined) merged.fog = { ...base.fog, ...definedFields(top.fog) };
  return merged;
}

function definedFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

/** True when lighting sets its own key or fill; lamps alone (point/spot) leave the rig to the mood. */
function authorsLightRig(lighting: LightingConfig | undefined): boolean {
  return lighting !== undefined && (lighting.ambient !== undefined || lighting.hemisphere !== undefined || (lighting.directional?.length ?? 0) > 0);
}

/** The sky's own sun and fill strength at which a mood rig is left as tuned (the dome's defaults). */
const SKY_SUN_BASELINE = 1;
const SKY_FILL_BASELINE = 0.6;

/**
 * The mood with the scene sky's sun placement and light strength folded in, so the editor's sun and
 * intensity controls keep steering the scene under a mood: the key light stands where the dome's
 * sun is, and `sunIntensity`/`ambientIntensity` scale the key and the fill from their defaults.
 */
function steeredMood(mood: Mood, steer: SkyEnvironmentConfig | undefined): ResolvedMood {
  const config: MoodConfig = typeof mood === "string" ? { preset: mood } : mood;
  const sun = steer?.sun === undefined ? config.sun : { ...config.sun, ...definedFields(steer.sun) };
  const resolved = resolveMood(sun === undefined ? config : { ...config, sun });
  const sunScale = (steer?.sunIntensity ?? SKY_SUN_BASELINE) / SKY_SUN_BASELINE;
  const fillScale = (steer?.ambientIntensity ?? SKY_FILL_BASELINE) / SKY_FILL_BASELINE;
  if (sunScale === 1 && fillScale === 1) return resolved;
  const { ambient, hemisphere, directional = [] } = resolved.lighting;
  return {
    ...resolved,
    lighting: {
      ...resolved.lighting,
      ...(ambient === undefined ? {} : { ambient: { ...ambient, intensity: (ambient.intensity ?? 1) * fillScale } }),
      ...(hemisphere === undefined ? {} : { hemisphere: { ...hemisphere, intensity: (hemisphere.intensity ?? 1) * fillScale } }),
      directional: directional.map((light, index) => ({ ...light, intensity: (light.intensity ?? 1) * (index === 0 ? sunScale : fillScale) })),
    },
  };
}

/** Post fields a mood's own tokens set; unlike the preset's values, they win over the style. */
function moodTokenPost(mood: Mood | undefined, gradeOn: boolean): PostProcessingConfig | undefined {
  if (mood === undefined || typeof mood === "string") return undefined;
  const saturation = gradeOn ? mood.saturation : undefined;
  if (mood.exposure === undefined && saturation === undefined) return undefined;
  return {
    ...(mood.exposure === undefined ? {} : { exposure: mood.exposure }),
    ...(saturation === undefined ? {} : { grade: { saturation } }),
  };
}

/**
 * Expand a game's `look` and `mood` into concrete lighting/backdrop/post. The default look is
 * `"neutral"`; `"flat"` passes the explicit knobs through untouched.
 *
 * `look` is the rendering style (tone map, bloom, AO, outlines, pixelation); `mood` is the light:
 * the key sun with cascaded shadows, a bounce opposite it, hemisphere fill, ambient, the dome's
 * colours and sun over the world's sky shape, the haze range, and the grade's tint. A styled look
 * (anything but `"neutral"`/`"flat"`) with no mood and no authored key or fill gets the mood its sky
 * implies (`"day"`, or `"dusk"`/`"night"` under those sky presets) for its light, haze and grade,
 * leaving an authored sky's colours alone; a sky on a day cycle keeps its own moving sun instead.
 * The scene sky's sun placement and `sunIntensity`/`ambientIntensity` steer the mood's rig, so the
 * editor's lighting controls still move the light.
 *
 * Anything the game authored wins: `lighting` fields replace the mood's one by one (point and spot
 * lamps add to it), `backdrop.sky` and `backdrop.fog` replace the mood's, and the scene document's
 * sky fields win over the mood's colours. A styled preset's post stages are deep-merged under a
 * partial game `postProcessing` ({@link mergePostProcessing}); the style's own grade values win over
 * the mood's tint, and a mood's `exposure`/`saturation` tokens win over the style. Under `"neutral"`
 * with no mood a game's own chain is used as authored. Resolving an already-resolved look returns it
 * unchanged.
 * @capability resolve-game-look expand a look preset and lighting mood into concrete lighting/backdrop/post knobs
 */
export function resolveGameLook(input: GameLookInput): ResolvedGameLook {
  const look = input.look ?? "neutral";
  if (look === "flat") {
    return { lighting: input.lighting, backdrop: input.backdrop, postProcessing: input.postProcessing };
  }
  const styled = look !== "neutral";
  const worldHasSky = input.worldSky !== undefined || input.hasWorldSky === true;
  const authoredSky = input.backdrop?.sky;
  const sceneSky = authoredSky ?? overlaySky(input.worldSky, input.documentSky);
  const implicit = input.mood === undefined && styled && !authorsLightRig(input.lighting) && sceneSky?.timeOfDay !== true;
  const moodSpec: Mood | undefined = input.mood ?? (implicit ? moodForSkyPreset(sceneSky?.preset) : undefined);
  const mood = moodSpec === undefined ? undefined : steeredMood(moodSpec, input.mood === undefined ? sceneSky : (authoredSky ?? input.documentSky));

  let sky: SkyEnvironmentConfig | undefined;
  if (authoredSky !== undefined) sky = authoredSky;
  else if (mood !== undefined && (input.mood !== undefined || (!worldHasSky && input.documentSky === undefined))) {
    const painted = overlaySky(input.worldSky, mood.sky)!;
    if (input.worldSky?.cloudiness !== undefined) painted.cloudiness = input.worldSky.cloudiness;
    if (input.worldSky?.hazeStrength !== undefined) painted.hazeStrength = input.worldSky.hazeStrength;
    sky = overlaySky(painted, input.documentSky);
  } else if (input.documentSky !== undefined) sky = overlaySky(input.worldSky, input.documentSky);
  else if (styled && !worldHasSky) sky = CINEMATIC_SKY;
  const fog = input.backdrop?.fog ?? mood?.fog;
  const backdrop: BackdropConfig | undefined =
    sky === authoredSky && fog === input.backdrop?.fog
      ? input.backdrop
      : { ...input.backdrop, ...(sky === undefined ? {} : { sky }), ...(fog === undefined ? {} : { fog }) };

  const lighting =
    mood === undefined
      ? input.lighting
      : input.lighting === undefined
        ? mood.lighting
        : { ...mood.lighting, ...definedFields(input.lighting) };

  if (look === "neutral" && mood === undefined) {
    return { lighting, backdrop, postProcessing: input.postProcessing ?? NEUTRAL_POST_PROCESSING };
  }
  const stylePost = look === "neutral" ? NEUTRAL_POST_PROCESSING : PRESET_POST[look];
  const styleOverMood = mood === undefined ? stylePost : mergePostProcessing(mood.postProcessing, stylePost);
  const tokens = moodTokenPost(input.mood, styleOverMood.grade !== false);
  const base = tokens === undefined ? styleOverMood : mergePostProcessing(styleOverMood, tokens);
  return { lighting, backdrop, postProcessing: mergePostProcessing(base, input.postProcessing) };
}
