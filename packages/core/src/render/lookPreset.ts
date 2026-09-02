import type { BackdropConfig, LightingConfig } from "../game/playableGame";
import type { SkyEnvironmentConfig } from "../world/features";
import type { PostProcessingConfig } from "./postProcessing";

/**
 * Named look preset composing the existing lighting/sky/fog/post knobs into one field.
 * `"neutral"` (the default when unset) keeps presentation unstyled; `"cinematic"` draws a scene lit like a shipped game — a real day sky
 * with a view-following shadow-casting sun + hemisphere fill, a network-free image-based-lighting
 * environment so PBR surfaces catch soft reflections, and a tuned tone-map/bloom/AO/vignette post
 * stack. `"flat"` opts out of the sky/IBL/post rig to the bare ambient+directional default (pre-#773).
 * The upgraded default primitive materials — tuned roughness/metalness plus subtle procedural surface
 * detail so un-modeled boxes/capsules stop reading as flat plastic — apply under both presets.
 * @capability default-look one field that lights a scene like a shipped game (opt out with "flat")
 */
export type LookPreset = "neutral" | "photoreal" | "toon" | "cinematic" | "flat";

/** Explicit graphics knobs a game may set; the preset only fills the ones left undefined. */
export interface GameLookInput {
  look?: LookPreset;
  lighting?: LightingConfig;
  backdrop?: BackdropConfig;
  postProcessing?: PostProcessingConfig;
  /** True when the world already declares its own sky — the preset then leaves the sky to the world. */
  hasWorldSky?: boolean;
}

/** Concrete lighting/backdrop/post the shell renders after the preset has filled unset knobs. */
export interface ResolvedGameLook {
  lighting?: LightingConfig;
  backdrop?: BackdropConfig;
  postProcessing?: PostProcessingConfig;
}

/** A static day sky: a real dome plus the shell's view-following shadow-casting sun and hemisphere fill. */
export const CINEMATIC_SKY: SkyEnvironmentConfig = { preset: "day" };

/** Tuned tone-map + bloom + gentle SSAO + vignette/grade stack — the shipped-game post look. */
export const CINEMATIC_POST_PROCESSING: PostProcessingConfig = {
  toneMapping: "aces",
  bloom: {},
  ao: { intensity: 1.4 },
  grade: {},
};

/** Unstyled baseline: a stable linear presentation with no genre-specific grading. */
export const NEUTRAL_POST_PROCESSING: PostProcessingConfig = {
  toneMapping: "agx",
  bloom: false,
  ao: false,
  grade: false,
};

/** High-contrast physically based presentation for authored HDR environments. */
export const PHOTOREAL_POST_PROCESSING: PostProcessingConfig = {
  toneMapping: "aces",
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

/**
 * Expand a game's `look` into concrete lighting/backdrop/post. The default is `"neutral"`;
 * `"flat"` passes the explicit knobs through untouched.
 * Anything the game authored wins — the preset only fills unset knobs, and it never adds a sky when
 * the world already owns one (so the sky's tuned sun/hemisphere serve as the lighting rig).
 * @capability resolve-game-look expand a look preset into concrete lighting/backdrop/post knobs
 */
export function resolveGameLook(input: GameLookInput): ResolvedGameLook {
  const look = input.look ?? "neutral";
  if (look === "flat") {
    return { lighting: input.lighting, backdrop: input.backdrop, postProcessing: input.postProcessing };
  }
  if (look === "neutral") {
    return { lighting: input.lighting, backdrop: input.backdrop, postProcessing: input.postProcessing ?? NEUTRAL_POST_PROCESSING };
  }
  const sky = input.backdrop?.sky ?? (input.hasWorldSky === true ? undefined : CINEMATIC_SKY);
  const backdrop: BackdropConfig | undefined =
    sky === input.backdrop?.sky ? input.backdrop : { ...input.backdrop, sky };
  return {
    lighting: input.lighting,
    backdrop,
    postProcessing:
      input.postProcessing ??
      (look === "toon" ? TOON_POST_PROCESSING : look === "photoreal" ? PHOTOREAL_POST_PROCESSING : CINEMATIC_POST_PROCESSING),
  };
}
