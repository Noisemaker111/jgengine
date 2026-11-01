import type { AutoExposureConfig } from "./colorPipeline";

/**
 * Renderer tone-mapping curve applied by the post chain's output stage. `"agx"` is the pipeline
 * default: it keeps hue in saturated highlights and rolls a sun-lit surface off gradually, where
 * `"aces"` skews bright colours toward white.
 */
export type ToneMappingMode = "aces" | "agx" | "reinhard" | "cineon" | "linear" | "none";

/**
 * A baked display-space LUT cube: `size³` RGB entries with red varying fastest, three bytes per entry
 * in 0..255. Kept as plain data so a scene document can author one and a test can assert on it.
 */
export interface LutCube {
  /** Edge length of the cube, 2..64 (a 32³ grade is 3 × 32 768 bytes). */
  size: number;
  /** `size³ × 3` bytes, red fastest, then green, then blue. */
  data: Uint8Array;
}

/** A grade's LUT: a strip PNG (one `size`-wide tile per blue slice), a `.cube` file URL or a baked cube. */
export type GradeLut = { url: string; size?: number } | { cube: LutCube };

/** UnrealBloom stage — soft HDR glow around bright pixels (sun, glints, emissive). */
export interface BloomConfig {
  /** Glow intensity. Default 0.32. */
  strength?: number;
  /** Glow spread radius, 0..1. Default 0.55. */
  radius?: number;
  /**
   * Luminance above which a pixel blooms. Default 0.85. Measured on raw HDR
   * before the tone-map/exposure stage, so lowering `exposure` does not change
   * which pixels bloom — push past 1.0 to select only emissives.
   */
  threshold?: number;
}

/** Ground-truth ambient occlusion stage — darkens contact creases and cavities for depth. */
export interface AoConfig {
  /** Sample radius in world units. Default 1.8. */
  radius?: number;
  /** Occlusion strength multiplier. Default 2.4. */
  intensity?: number;
  /** Distance over which occlusion fades out, world units. Default 3.6. */
  distanceFalloff?: number;
  /** Blend the AO onto the beauty at this fraction, 0..1. Default 1. */
  blend?: number;
}

/** Final colour-grade stage: lift/gain/gamma, saturation, vignette, film grain — applied in display space after tone mapping. */
export interface GradeConfig {
  /**
   * Colour LUT applied after the numeric grade, in display space. Either a strip PNG (one
   * `size`-wide tile per blue slice, trilinearly sampled) or a baked {@link LutCube} such as the one
   * a scene document's authored grading produces.
   */
  lut?: GradeLut;
  /** Additive shadow tint (RGB, ~0..0.1). Default cool [0.012, 0.010, 0.018]. */
  lift?: readonly [number, number, number];
  /** Multiplicative highlight tint (RGB, ~1). Default warm [1.05, 1.02, 0.98]. */
  gain?: readonly [number, number, number];
  /** Output gamma. Default 0.96. */
  gamma?: number;
  /** Saturation multiplier around luma. Default 1.12. */
  saturation?: number;
  /** Vignette darkening strength at the corners, 0..1. Default 0.2. */
  vignette?: number;
  /** Animated film-grain amplitude. Default 0.012. */
  grain?: number;
  /** Chromatic-aberration RGB split, in fractions of the frame (~0..0.01), scaled toward the edges. Default 0 (off). */
  chromaticAberration?: number;
}

/** Depth-of-field (bokeh) stage — throws the fore/background out of focus around a focus distance. */
export interface DofConfig {
  /** Focus distance from the camera in world units. Default 18. */
  focus?: number;
  /** Aperture — larger blurs a shallower slice more aggressively. Default 0.00025. */
  aperture?: number;
  /** Maximum blur radius, 0..1. Default 0.01. */
  maxBlur?: number;
}

/** Ink outlines traced from depth and surface-normal edges — silhouettes plus interior creases. */
export interface OutlineConfig {
  /** Line colour (CSS). Default near-black "#101014". */
  color?: string;
  /** Line thickness in render pixels. Default 1. */
  thickness?: number;
  /** Line opacity, 0..1. Default 1. */
  opacity?: number;
  /** Relative depth jump that counts as a silhouette edge. Lower draws more lines. Default 0.08. */
  depthThreshold?: number;
  /** Normal difference (1 − cos angle) that counts as a crease. Lower draws more lines. Default 0.35. */
  normalThreshold?: number;
  /** Distance in world units at which lines have faded out, so far scenery stays clean. Default 160. */
  fadeDistance?: number;
}

/**
 * Art-style stage that turns the same models and lighting into a different look without
 * touching materials: ink outlines (comic / Borderlands), cel bands (cartoon), pixelation (retro).
 * Runs after tone mapping, before the grade.
 */
export interface StylizeConfig {
  /** Ink outlines. Omitted or `false` draws none. */
  outline?: OutlineConfig | false;
  /** Quantize brightness into this many cel-shading bands, keeping hue. 0 or omitted is off; 3–6 reads as cartoon. */
  bands?: number;
  /** Snap the frame to blocks of this many render pixels for a retro look. 0, 1 or omitted is off. */
  pixelSize?: number;
}

/**
 * Edge antialiasing for the post chain. `"taa"` jitters the camera a fraction of a pixel each frame
 * and blends the frames, which also settles shimmering foliage, thin wires and specular sparkle.
 * SMAA runs in linear-sRGB before the output tone-map and cleans alpha-tested foliage/particles that
 * MSAA samples alone leave crawling. `"msaa"` keeps only the render-target multisample resolve;
 * `false` disables AA stages.
 */
export type PostAaMode = "taa" | "smaa" | "msaa" | false;

/** Screen-space contact shadows: a short ray toward the sun from every pixel, against the depth buffer. */
export interface ContactShadowConfig {
  /** How dark a contact shadow gets, 0..1. Default 0.6. */
  intensity?: number;
  /** Ray length toward the sun in world units; longer reaches further from a contact. Default 0.45. */
  length?: number;
  /** Depth an occluder is assumed to have, world units. Default 0.3. */
  thickness?: number;
  /** Camera distance in world units where contact shadows have faded out. Default 70. */
  distance?: number;
}

/**
 * Air over the lit frame: ground haze that thickens toward the ground and with distance, brighter
 * toward the sun, light shafts where the sky shows through gaps, and a glow around every nearby
 * point and spot light as its light scatters in the same haze. Shafts need a shadow-casting sun.
 * With no sun the whole pass is skipped unless `indoor` is set, which keeps the haze and the lamp
 * glow running so a sunless interior gets its air and its lit lamps.
 */
export interface AtmosphereConfig {
  /** Haze density per world unit at `fogHeight`; 0 turns the haze off. Default 0.0006. */
  fogDensity?: number;
  /** How fast the haze thins with height, per world unit. Default 0.15. */
  fogFalloff?: number;
  /** World height where the haze is densest. Default 0. */
  fogHeight?: number;
  /** Most the haze may cover a far surface, 0..1. Default 0.65. */
  fogMax?: number;
  /** Light-shaft strength; 0 turns shafts off. Default 0.3. */
  shafts?: number;
  /**
   * How strongly the nearest point and spot lights (up to eight) glow in the haze; 0 turns the glow
   * off. The glow scales with `fogDensity`, so open-air haze barely shows it and a smoky interior
   * shows it plainly. A light with `userData.haze === false` never glows. Default 1.
   */
  lamps?: number;
  /**
   * How far a spot light's glow reaches down its cone as a visible beam, 0..1. At 0 a spot glows only
   * round its bulb, like a point light; at 1 the haze lights up most of its range inside the cone, so
   * a ceiling lamp throws a shaft onto the floor. Default 0.
   */
  beams?: number;
  /**
   * Run with no shadow-casting sun: the haze and the lamp glow stay on and only the shafts drop
   * out. Default false, which skips the whole pass while there is no sun.
   */
  indoor?: boolean;
  /** Haze colour (CSS). Omitted, the haze takes the scene fog's colour, else the background's. */
  color?: string;
  /**
   * How patchy the haze is, 0..1: 0 is an even layer, 1 lets drifting banks thin to nothing and
   * thicken to twice the density. Default 0.
   */
  variation?: number;
  /** Width of one haze bank in world units. Default 60. */
  patchSize?: number;
  /**
   * How fast the banks ride the shared wind (`windDirection`, `windGust`, `windClock` in
   * `model/modelWind.draw`), in world units per second per unit of gust. 0 holds them still. Default 1.5.
   */
  drift?: number;
}

/**
 * Screen-space reflections: each pixel of an upward-facing glossy surface marches its mirrored view ray
 * through the depth buffer and takes the colour of what it hits, weighted by Fresnel. Wet streets,
 * polished floors and still water pick up the scene above them; off-screen hits fall back to the
 * surface's own environment reflection.
 */
export interface SsrConfig {
  /** How much of a hit replaces the surface colour at full Fresnel, 0..1. Default 0.5. */
  intensity?: number;
  /** Reflectance looking straight down at the surface (Schlick F0). 0.04 is most dielectrics; 0.02 is water. Default 0.04. */
  reflectance?: number;
  /** Longest reflected ray in world units. Default 24. */
  maxDistance?: number;
  /** Depth a surface the ray passes behind is assumed to have, world units. Default 0.6. */
  thickness?: number;
  /**
   * Upward tilt a surface needs before it reflects: the world-space normal's y, -1..1. 0.6 keeps
   * floors, roads and water; -1 reflects walls too. Default 0.6.
   */
  minUp?: number;
  /** Camera distance in world units where reflections have faded out. Default 120. */
  fadeDistance?: number;
  /**
   * Roughness below which a standard material reflects, fading in as it gets smoother; rough ground,
   * foliage and textured-roughness materials never do. A mesh's `userData.ssr` (`true`, a 0..1
   * strength, or `false`) overrides it, which is how a custom water shader opts in. Default 0.4.
   */
  maxRoughness?: number;
}

/**
 * Motion blur (#1658): the camera's own movement blurs the whole frame by reprojecting each pixel
 * to where it was last frame, and registered moving bodies (`registerMotionBlurBody`; every model
 * entity is registered) blur along their own screen motion. Each part has its own strength.
 */
export interface MotionBlurConfig {
  /** Strength of the blur from camera movement; 0 turns it off, 1 is the shutter below. Default 1. */
  camera?: number;
  /** Strength of the blur from moving bodies; 0 turns it off. Default 1. */
  objects?: number;
  /** Shutter open time as a fraction of a 60 Hz frame, so blur length is the same at any frame rate. Default 0.5. */
  shutter?: number;
  /** Longest blur as a fraction of the frame's width. Default 0.05. */
  maxBlur?: number;
}

/**
 * Declarative post-processing chain (RenderPass → AO → contact shadows → SSR → atmosphere → Bloom → DOF → motion blur
 * → SMAA or TAA → tone-map output → Grade). Present on a game means the shell mounts an `EffectComposer` and owns
 * the render; absent means the renderer draws directly (unchanged). Each stage is
 * a config object, `false` to skip, or omitted for its default. Pure data — no
 * three.js types leak into core.
 */
export interface PostProcessingConfig {
  /** Master switch; a config object with `enabled: false` mounts nothing. Default true. */
  enabled?: boolean;
  /** Tone-mapping curve the output stage applies. Default "agx". */
  toneMapping?: ToneMappingMode;
  /**
   * Exposure multiplier applied before tone mapping. Default 1. With `autoExposure` on this is the
   * baseline the meter corrects around, not a fixed value.
   */
  exposure?: number;
  /**
   * Clamped auto-exposure: meters the rendered frame and adapts exposure toward
   * {@link import("./colorPipeline").MID_GREY}, bounded by `min`/`max`. Omitted uses
   * {@link import("./colorPipeline").DEFAULT_AUTO_EXPOSURE} on every tier; `false` pins `exposure`.
   */
  autoExposure?: AutoExposureConfig | false;
  /**
   * Antialiasing. Omitted lets the graphics tier choose: temporal AA on high and ultra, SMAA below.
   * `"taa"` or `"smaa"` pins one on every tier, `"msaa"` keeps only the multisample resolve, and
   * `false` turns antialiasing off.
   */
  aa?: PostAaMode;
  bloom?: BloomConfig | false;
  /**
   * Ambient occlusion (contact shading). Omitted runs {@link DEFAULT_AO} on graphics tiers whose
   * `postStages.ao` is on (medium and up); `false` turns it off everywhere.
   */
  ao?: AoConfig | false;
  /**
   * Short screen-space shadows toward the sun, so feet, wheels, crates and props sit on the ground
   * where the shadow map is too coarse to show it. Omitted runs {@link DEFAULT_CONTACT_SHADOWS} on
   * medium and up; `false` turns it off. Needs the beauty depth, so an `aa: "msaa"` chain skips it.
   */
  contactShadows?: ContactShadowConfig | false;
  /**
   * Height haze and sun shafts ({@link AtmosphereConfig}). Omitted runs {@link DEFAULT_ATMOSPHERE},
   * tuned per `mood`, on medium and up; `false` turns both off.
   */
  atmosphere?: AtmosphereConfig | false;
  /**
   * Screen-space reflections ({@link SsrConfig}). Omitted or `false` builds none; runs on medium and
   * up while the player's `ssr` toggle is on.
   */
  ssr?: SsrConfig | false;
  /**
   * Camera and per-object motion blur ({@link MotionBlurConfig}). Omitted or `false` builds none;
   * runs on medium and up while the player's `motionBlur` toggle is on.
   */
  motionBlur?: MotionBlurConfig | false;
  /** Depth-of-field / bokeh. Heavier stage — omit or `false` to skip. Default off (omitted). */
  dof?: DofConfig | false;
  grade?: GradeConfig | false;
  /** Art-style stage: outlines, cel bands, pixelation. Default off (omitted). */
  stylize?: StylizeConfig | false;
}

/** Contact shading used when a post chain leaves `ao` unset: soft creases, no dark halos. */
export const DEFAULT_AO: Readonly<AoConfig> = { radius: 1.3, intensity: 1.3, distanceFalloff: 2.8, blend: 1 };

/** Contact shadows used when a post chain leaves `contactShadows` unset. */
export const DEFAULT_CONTACT_SHADOWS: Readonly<Required<ContactShadowConfig>> = {
  intensity: 0.6,
  length: 0.45,
  thickness: 0.3,
  distance: 70,
};

/** Height haze and light shafts used when a post chain leaves `atmosphere` unset. */
export const DEFAULT_ATMOSPHERE: Readonly<Required<AtmosphereConfig>> = {
  fogDensity: 0.0006,
  fogFalloff: 0.15,
  fogHeight: 0,
  fogMax: 0.65,
  shafts: 0.3,
  lamps: 1,
  beams: 0,
  indoor: false,
  color: "", // empty: the scene fog colour
  variation: 0,
  patchSize: 60,
  drift: 1.5,
};

/** Screen-space reflections used for the fields an `ssr` config leaves unset. */
export const DEFAULT_SSR: Readonly<Required<SsrConfig>> = {
  intensity: 0.5,
  reflectance: 0.04,
  maxDistance: 24,
  thickness: 0.6,
  minUp: 0.6,
  fadeDistance: 120,
  maxRoughness: 0.4,
};

/** Motion blur used for the fields a `motionBlur` config leaves unset. */
export const DEFAULT_MOTION_BLUR: Readonly<Required<MotionBlurConfig>> = {
  camera: 1,
  objects: 1,
  shutter: 0.5,
  maxBlur: 0.05,
};

/**
 * A cinematic "product shot" post preset — the full chain on (contact-AO, soft bloom, a warm film
 * grade with vignette + a touch of grain + chromatic aberration). Meant for a `StudioStage` where a
 * single parametric asset is framed on a backdrop, so every studio reads shipped, not intern-tier. DoF
 * is left off by default (it needs a per-scene focus distance); set `dof` to enable it.
 */
export const STUDIO_STAGE_POST: PostProcessingConfig = {
  toneMapping: "agx",
  exposure: 1.05,
  bloom: { strength: 0.28, radius: 0.6, threshold: 0.8 },
  ao: { radius: 1.1, intensity: 1.5, distanceFalloff: 3, blend: 1 },
  grade: {
    lift: [0.008, 0.008, 0.014],
    gain: [1.05, 1.02, 0.98],
    gamma: 0.96,
    saturation: 1.12,
    vignette: 0,
    grain: 0.006,
    chromaticAberration: 0.001,
  },
};
