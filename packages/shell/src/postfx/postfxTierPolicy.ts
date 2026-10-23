import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

/** What one graphics tier may spend on the post chain. @internal */
export interface PostfxTierPolicy {
  /** Composer backing store as a fraction of the canvas; below 1 the OutputPass upscales the result. */
  resolutionScale: number;
  /** GTAO's sample count, when the chain runs AO at all. */
  aoSamples: number;
  /** The stages the tier offers before the player overrides them. */
  stages: { ao: boolean; bloom: boolean; dof: boolean; smaa: boolean };
}

/**
 * The post chain's quality tiers. `high` and `ultra` render at native size; the tiers below pay for
 * their cheaper stage set twice, by building fewer passes and by rendering the ones left smaller.
 * `stages` mirrors `DEFAULT_GRAPHICS_PROFILES.postStages`, so a plan built without the player's
 * toggles spends the same passes the profile names.
 * @internal
 */
export const POSTFX_TIER_POLICY: Record<GraphicsQuality, PostfxTierPolicy> = {
  low: { resolutionScale: 0.7, aoSamples: 8, stages: { ao: false, bloom: true, dof: false, smaa: true } },
  medium: { resolutionScale: 0.85, aoSamples: 8, stages: { ao: true, bloom: true, dof: true, smaa: true } },
  high: { resolutionScale: 1, aoSamples: 12, stages: { ao: true, bloom: true, dof: true, smaa: true } },
  ultra: { resolutionScale: 1, aoSamples: 16, stages: { ao: true, bloom: true, dof: true, smaa: true } },
};

/** A tier's post-chain budget; `high` is the reference every lower tier is measured against. @internal */
export function postfxTierPolicy(quality: GraphicsQuality): PostfxTierPolicy {
  return POSTFX_TIER_POLICY[quality];
}
