/** Renderer tone-mapping curve applied by the post chain's output stage. */
export type ToneMappingMode = "aces" | "agx" | "reinhard" | "cineon" | "linear" | "none";

/** UnrealBloom stage — soft HDR glow around bright pixels (sun, glints, emissive). */
export interface BloomConfig {
  /** Glow intensity. Default 0.32. */
  strength?: number;
  /** Glow spread radius, 0..1. Default 0.55. */
  radius?: number;
  /** Luminance above which a pixel blooms, 0..1. Default 0.85. */
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

/**
 * Declarative post-processing chain (RenderPass → AO → Bloom → tone-map output →
 * Grade). Present on a game means the shell mounts an `EffectComposer` and owns
 * the render; absent means the renderer draws directly (unchanged). Each stage is
 * a config object, `false` to skip, or omitted for its default. Pure data — no
 * three.js types leak into core.
 */
export interface PostProcessingConfig {
  /** Master switch; a config object with `enabled: false` mounts nothing. Default true. */
  enabled?: boolean;
  /** Tone-mapping curve the output stage applies. Default "aces". */
  toneMapping?: ToneMappingMode;
  /** Exposure multiplier applied before tone mapping. Default 1. */
  exposure?: number;
  bloom?: BloomConfig | false;
  /** Ambient occlusion. Heavier than the other stages — omit or `false` on low-end targets. Default off (omitted). */
  ao?: AoConfig | false;
  /** Depth-of-field / bokeh. Heavier stage — omit or `false` to skip. Default off (omitted). */
  dof?: DofConfig | false;
  grade?: GradeConfig | false;
}
