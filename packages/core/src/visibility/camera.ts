import type { CameraView } from "./frustum";

export type CameraKind = "main" | "splitScreen" | "renderToTexture" | "editor" | "minimap";

export interface CameraVisibilityContext {
  readonly id: string;
  readonly view: CameraView;
  readonly kind?: CameraKind;
  readonly influencesStreaming?: boolean;
  readonly cullingDisabled?: boolean;
  readonly maxRenderDistance?: number;
}

export function cameraInfluencesStreaming(context: CameraVisibilityContext): boolean {
  return context.influencesStreaming !== false;
}
