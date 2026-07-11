import type { CameraView } from "./frustum";

export type CameraKind = "main" | "splitScreen" | "renderToTexture" | "editor" | "minimap";

/**
 * A camera's contribution to visibility. The VisibilitySystem unions results across every
 * active context: an object stays renderable/loaded if *any* relevant camera needs it.
 * A camera can opt out of driving asset streaming (e.g. a minimap that only needs positions,
 * not loaded meshes) via `influencesStreaming: false`.
 */
export interface CameraVisibilityContext {
  readonly id: string;
  readonly view: CameraView;
  /** Default "main". Editor/minimap cameras are still honored but tagged for diagnostics. */
  readonly kind?: CameraKind;
  /** Default true. When false this camera keeps objects renderable but does not preload their assets. */
  readonly influencesStreaming?: boolean;
  /** When true this camera renders everything (no frustum/distance reject). Default false. */
  readonly cullingDisabled?: boolean;
  /** Overrides the global render distance for this camera. */
  readonly maxRenderDistance?: number;
}

export function cameraInfluencesStreaming(context: CameraVisibilityContext): boolean {
  return context.influencesStreaming !== false;
}
