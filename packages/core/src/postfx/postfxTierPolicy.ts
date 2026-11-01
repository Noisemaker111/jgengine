import type { GraphicsPostStages } from "@jgengine/core/settings/graphicsProfile";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

/** What one graphics tier may spend on the post chain. @internal */
export interface PostfxTierPolicy {
  /** Composer backing store as a fraction of the canvas; below 1 the OutputPass upscales the result. */
  resolutionScale: number;
  /** GTAO's sample count, when the chain runs AO at all. */
  aoSamples: number;
  /** Ray steps per pixel for contact shadows; 0 skips the stage. */
  contactShadowSteps: number;
  /** Light-shaft samples per pixel for the atmosphere stage; 0 skips height haze and shafts. */
  atmosphereSteps: number;
  /** Haze-bank noise taps along each view ray; 0 keeps the haze an even layer. */
  fogVariationTaps: number;
  /** Reflection ray steps per pixel; 0 skips screen-space reflections. */
  ssrSteps: number;
  /** Blur taps per pixel; 0 skips motion blur. */
  motionBlurSamples: number;
  /** Whether a chain that leaves `aa` unset resolves edges temporally instead of with SMAA. */
  temporalAa: boolean;
  /** The stages the tier offers before the player overrides them. */
  stages: GraphicsPostStages;
}

/**
 * The post chain's quality tiers. `high` and `ultra` render at native size; the tiers below pay for
 * their cheaper stage set twice, by building fewer passes and by rendering the ones left smaller.
 * `stages` mirrors `DEFAULT_GRAPHICS_PROFILES.postStages`, so a plan built without the player's
 * toggles spends the same passes the profile names. Low keeps SMAA and drops contact shadows, the
 * atmosphere, reflections and motion blur.
 * @internal
 */
export const POSTFX_TIER_POLICY: Record<GraphicsQuality, PostfxTierPolicy> = {
  low: {
    resolutionScale: 0.7, aoSamples: 8, contactShadowSteps: 0, atmosphereSteps: 0, fogVariationTaps: 0, ssrSteps: 0, motionBlurSamples: 0, temporalAa: false,
    stages: { ao: false, bloom: true, dof: false, smaa: true, ssr: false, fog: false, motionBlur: false },
  },
  medium: {
    resolutionScale: 0.85, aoSamples: 8, contactShadowSteps: 8, atmosphereSteps: 16, fogVariationTaps: 2, ssrSteps: 16, motionBlurSamples: 6, temporalAa: false,
    stages: { ao: true, bloom: true, dof: true, smaa: true, ssr: true, fog: true, motionBlur: true },
  },
  high: {
    resolutionScale: 1, aoSamples: 12, contactShadowSteps: 12, atmosphereSteps: 24, fogVariationTaps: 4, ssrSteps: 24, motionBlurSamples: 8, temporalAa: true,
    stages: { ao: true, bloom: true, dof: true, smaa: true, ssr: true, fog: true, motionBlur: true },
  },
  ultra: {
    resolutionScale: 1, aoSamples: 16, contactShadowSteps: 16, atmosphereSteps: 32, fogVariationTaps: 6, ssrSteps: 32, motionBlurSamples: 12, temporalAa: true,
    stages: { ao: true, bloom: true, dof: true, smaa: true, ssr: true, fog: true, motionBlur: true },
  },
};

/** A tier's post-chain budget; `high` is the reference every lower tier is measured against. @internal */
export function postfxTierPolicy(quality: GraphicsQuality): PostfxTierPolicy {
  return POSTFX_TIER_POLICY[quality];
}
