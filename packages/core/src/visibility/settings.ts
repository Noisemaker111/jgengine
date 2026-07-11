import type { BoundsSpec } from "./bounds";
import type { CameraVisibilityContext } from "./camera";

/**
 * Global render-culling behavior. Defaults favor correctness and visual stability over
 * aggressive rejection: a generous preload margin, hysteresis, and a large default render
 * distance so upgrading the engine never makes an existing game's objects vanish.
 */
export interface CullingSettings {
  readonly enabled: boolean;
  readonly frustumCulling: boolean;
  readonly distanceCulling: boolean;
  /** Occlusion culling is opt-in and off until proven reliable for the renderer. */
  readonly occlusionCulling: boolean;
  readonly defaultMinRenderDistance: number;
  readonly defaultMaxRenderDistance: number;
  /** World units the preload region extends beyond the visible frustum, hiding pop-in. */
  readonly preloadMargin: number;
  /** World-unit band added when re-testing a previously visible object, preventing boundary flicker. */
  readonly hysteresis: number;
}

export const DEFAULT_CULLING_SETTINGS: CullingSettings = {
  enabled: true,
  frustumCulling: true,
  distanceCulling: true,
  occlusionCulling: false,
  defaultMinRenderDistance: 0,
  defaultMaxRenderDistance: Infinity,
  preloadMargin: 24,
  hysteresis: 2,
};

export interface StreamingSettings {
  readonly enabled: boolean;
  /** Extra world units around the camera whose assets are preloaded ahead of visibility. */
  readonly preloadMargin: number;
  /** Seconds an asset must stay outside the active area before it is eligible for unload. */
  readonly unloadGraceSeconds: number;
  readonly maxLoadsPerFrame: number;
  readonly maxUnloadsPerFrame: number;
  /** Assets at or below this byte size are kept resident once loaded (small shared assets). */
  readonly keepResidentBytes: number;
}

export const DEFAULT_STREAMING_SETTINGS: StreamingSettings = {
  enabled: true,
  preloadMargin: 32,
  unloadGraceSeconds: 10,
  maxLoadsPerFrame: 4,
  maxUnloadsPerFrame: 2,
  keepResidentBytes: 64 * 1024,
};

/**
 * Per-object visibility/streaming overrides. Also the shape used at the layer, scene, and
 * global-override levels — resolution merges object → layer → scene → global-override, so a
 * game can, say, mark a whole "hud" layer alwaysVisible without touching each object.
 */
export interface ObjectVisibilityOverrides {
  /** Bypass all render culling — always submitted (UI, skybox, camera-attached, marked always-visible). */
  readonly alwaysVisible?: boolean;
  /** Never auto-unload this object's assets. */
  readonly neverUnload?: boolean;
  readonly minRenderDistance?: number;
  readonly maxRenderDistance?: number;
  readonly preloadMargin?: number;
  readonly cullingDisabled?: boolean;
  readonly streamingDisabled?: boolean;
  readonly classification?: "static" | "dynamic";
  readonly bounds?: BoundsSpec;
  /**
   * Final say on render visibility. Return true/false to force, or undefined to defer to the
   * standard frustum+distance+occlusion pipeline. Evaluated per relevant camera.
   */
  readonly customVisibility?: (camera: CameraVisibilityContext) => boolean | undefined;
  /** Pin the object's assets resident regardless of distance. */
  readonly pinned?: boolean;
}

export interface ResolvedOverrides {
  alwaysVisible: boolean;
  neverUnload: boolean;
  minRenderDistance: number | undefined;
  maxRenderDistance: number | undefined;
  preloadMargin: number | undefined;
  cullingDisabled: boolean;
  streamingDisabled: boolean;
  classification: "static" | "dynamic" | undefined;
  bounds: BoundsSpec | undefined;
  customVisibility: ((camera: CameraVisibilityContext) => boolean | undefined) | undefined;
  pinned: boolean;
}

const EMPTY: ObjectVisibilityOverrides = {};

/** Merge override layers by precedence: earlier arguments win. Pass object, then layer, then scene, then global. */
export function resolveOverrides(...layers: readonly (ObjectVisibilityOverrides | undefined)[]): ResolvedOverrides {
  const pick = <K extends keyof ObjectVisibilityOverrides>(key: K): ObjectVisibilityOverrides[K] => {
    for (const layer of layers) {
      const value = (layer ?? EMPTY)[key];
      if (value !== undefined) return value;
    }
    return undefined;
  };
  return {
    alwaysVisible: pick("alwaysVisible") ?? false,
    neverUnload: pick("neverUnload") ?? false,
    minRenderDistance: pick("minRenderDistance"),
    maxRenderDistance: pick("maxRenderDistance"),
    preloadMargin: pick("preloadMargin"),
    cullingDisabled: pick("cullingDisabled") ?? false,
    streamingDisabled: pick("streamingDisabled") ?? false,
    classification: pick("classification"),
    bounds: pick("bounds"),
    customVisibility: pick("customVisibility"),
    pinned: pick("pinned") ?? false,
  };
}

export function mergeCullingSettings(base: CullingSettings, patch: Partial<CullingSettings>): CullingSettings {
  return { ...base, ...patch };
}

export function mergeStreamingSettings(base: StreamingSettings, patch: Partial<StreamingSettings>): StreamingSettings {
  return { ...base, ...patch };
}
