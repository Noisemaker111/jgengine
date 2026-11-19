import type { GraphicsQuality } from "./settingsModel";

/**
 * Procedural surface detail on loaded models: `"full"` adds mottling, wear, roughness break-up, a
 * micro-normal and cavity shading; `"lite"` drops the micro-normal; `"off"` compiles the plain material.
 */
export type SurfaceDetailLevel = "off" | "lite" | "full";

export interface GraphicsPostStages {
  ao: boolean;
  bloom: boolean;
  dof: boolean;
  smaa: boolean;
  /** Screen-space reflections. */
  ssr: boolean;
  fog: boolean;
  motionBlur: boolean;
}

export interface GraphicsProfile {
  renderScale: number;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  cascades: 1 | 2 | 3 | 4;
  drawDistance: number;
  particleCap: number;
  particleBudget: number;
  /** Anisotropic texture filtering samples; clamped to the GPU maximum. 1 is plain trilinear. */
  anisotropy: 1 | 2 | 4 | 8 | 16;
  /**
   * Post stages the tier lets run. `ao`, `bloom` and `smaa` run by default where on; `dof`, `ssr`
   * and `motionBlur` run only when the game's post chain or look preset asks for them; `fog` gates
   * the volumetric fog (height haze, sun shafts, lamp glow).
   */
  postStages: GraphicsPostStages;
  /** Size shadow penumbrae from each light's `lightSize` instead of a fixed filter radius. */
  softShadows: boolean;
  /** Widest penumbra a soft shadow may filter, in shadow-map texels. */
  softShadowMaxRadius: number;
  surfaceDetail: SurfaceDetailLevel;
}

export const DEFAULT_GRAPHICS_PROFILES: Record<GraphicsQuality, GraphicsProfile> = {
  low: {
    renderScale: 1,
    shadowMapSize: 512,
    cascades: 1,
    drawDistance: 120,
    particleCap: 128,
    particleBudget: 1024,
    anisotropy: 2,
    postStages: { ao: false, bloom: true, dof: false, smaa: true, ssr: false, fog: false, motionBlur: false },
    softShadows: false,
    softShadowMaxRadius: 0,
    surfaceDetail: "lite",
  },
  medium: {
    renderScale: 1.5,
    shadowMapSize: 1024,
    cascades: 2,
    drawDistance: 240,
    particleCap: 256,
    particleBudget: 2048,
    anisotropy: 4,
    postStages: { ao: true, bloom: true, dof: true, smaa: true, ssr: true, fog: true, motionBlur: true },
    softShadows: true,
    softShadowMaxRadius: 4,
    surfaceDetail: "full",
  },
  high: {
    renderScale: 2,
    shadowMapSize: 2048,
    cascades: 4,
    drawDistance: 400,
    particleCap: 512,
    particleBudget: 4096,
    anisotropy: 8,
    postStages: { ao: true, bloom: true, dof: true, smaa: true, ssr: true, fog: true, motionBlur: true },
    softShadows: true,
    softShadowMaxRadius: 6,
    surfaceDetail: "full",
  },
  ultra: {
    renderScale: 2,
    shadowMapSize: 4096,
    cascades: 4,
    drawDistance: 800,
    particleCap: 1024,
    particleBudget: 8192,
    anisotropy: 16,
    postStages: { ao: true, bloom: true, dof: true, smaa: true, ssr: true, fog: true, motionBlur: true },
    softShadows: true,
    softShadowMaxRadius: 8,
    surfaceDetail: "full",
  },
};

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
