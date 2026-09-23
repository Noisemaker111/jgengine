import type { GraphicsQuality } from "./settingsModel";

/** Serializable renderer budget selected by the player's graphics tier. */
export interface GraphicsProfile {
  renderScale: number;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  cascades: 1 | 2 | 3 | 4;
  drawDistance: number;
  particleCap: number;
  /** Anisotropic texture filtering samples; clamped to the GPU maximum. 1 is plain trilinear. */
  anisotropy: 1 | 2 | 4 | 8 | 16;
  postStages: { ao: boolean; bloom: boolean; dof: boolean; smaa: boolean };
}

/** Conservative defaults that preserve the existing high-quality shell behavior. */
export const DEFAULT_GRAPHICS_PROFILES: Record<GraphicsQuality, GraphicsProfile> = {
  low: {
    renderScale: 1,
    shadowMapSize: 512,
    cascades: 1,
    drawDistance: 120,
    particleCap: 128,
    anisotropy: 2,
    postStages: { ao: false, bloom: true, dof: false, smaa: true },
  },
  medium: {
    renderScale: 1.5,
    shadowMapSize: 1024,
    cascades: 2,
    drawDistance: 240,
    particleCap: 256,
    anisotropy: 4,
    postStages: { ao: true, bloom: true, dof: true, smaa: true },
  },
  high: {
    renderScale: 2,
    shadowMapSize: 2048,
    cascades: 4,
    drawDistance: 400,
    particleCap: 512,
    anisotropy: 8,
    postStages: { ao: true, bloom: true, dof: true, smaa: true },
  },
  ultra: {
    renderScale: 2,
    shadowMapSize: 4096,
    cascades: 4,
    drawDistance: 800,
    particleCap: 1024,
    anisotropy: 16,
    postStages: { ao: true, bloom: true, dof: true, smaa: true },
  },
};

/** Resolve one tier and apply game-authored field and post-stage overrides. */
export function resolveGraphicsProfile(
  quality: GraphicsQuality,
  overrides?: Partial<GraphicsProfile>,
): GraphicsProfile {
  const base = DEFAULT_GRAPHICS_PROFILES[quality];
  return {
    ...base,
    ...overrides,
    postStages: { ...base.postStages, ...overrides?.postStages },
  };
}
