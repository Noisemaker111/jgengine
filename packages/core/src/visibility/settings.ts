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
  readonly occlusionCulling: boolean;
  readonly defaultMinRenderDistance: number;
  readonly defaultMaxRenderDistance: number;
  readonly preloadMargin: number;
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
  readonly preloadMargin: number;
  /** Idle unload delay; resident-byte pressure can evict unprotected assets sooner. */
  readonly unloadGraceSeconds: number;
  readonly maxLoadsPerFrame: number;
  readonly maxConcurrentLoads: number;
  readonly maxUnloadsPerFrame: number;
  /** Resident-byte target, enforced on ticks within maxUnloadsPerFrame; protected assets may exceed it. */
  readonly maxResidentBytes: number;
  /** Budget eviction order. Ties use oldest activity then asset id for deterministic selection. */
  readonly residentEvictionOrder: "oldest" | "largest";
  /** Small shared assets survive idle unloading, but remain eligible under resident-byte pressure. */
  readonly keepResidentBytes: number;
}

export const DEFAULT_STREAMING_SETTINGS: StreamingSettings = {
  enabled: true,
  preloadMargin: 32,
  unloadGraceSeconds: 10,
  maxLoadsPerFrame: 4,
  maxConcurrentLoads: 4,
  maxUnloadsPerFrame: 2,
  keepResidentBytes: 64 * 1024,
  maxResidentBytes: Infinity,
  residentEvictionOrder: "oldest",
};

/**
 * Per-object visibility/streaming overrides. Also the shape used at the layer, scene, and
 * global-override levels — resolution merges object → layer → scene → global-override, so a
 * game can, say, mark a whole "hud" layer alwaysVisible without touching each object.
 */
export interface ObjectVisibilityOverrides {
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
  readonly customVisibility?: (camera: CameraVisibilityContext) => boolean | undefined;
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

export function resolveOverrides(...layers: readonly (ObjectVisibilityOverrides | undefined)[]): ResolvedOverrides {
  const pick = <K extends keyof ObjectVisibilityOverrides>(key: K): ObjectVisibilityOverrides[K] | undefined => {
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
