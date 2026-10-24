import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type * as THREE from "three";

import { registerSceneCapture } from "./sceneCaptureRequest";

export {
  registerSceneCapture,
  requestSceneCapture,
  requestSceneThumbnail,
} from "./sceneCaptureRequest";
export type {
  SceneCapture,
  SceneCaptureFailure,
  SceneCaptureRequestOptions,
  SceneCaptureResult,
  SceneThumbnailResult,
} from "./sceneCaptureRequest";

/** The bit of a WebGL renderer scene capture needs — its backing `<canvas>`. */
export interface CaptureRenderer {
  domElement: { toDataURL(type?: string): string };
}

/**
 * Read the current frame to a PNG data URL. Requires the R3F `<Canvas>` to have
 * been created with `gl={{ preserveDrawingBuffer: true }}` (the shell's game
 * canvas already is); returns null if the backing canvas can't be read.
 *
 * @capability capture-canvas read the live R3F frame to a PNG data URL (needs preserveDrawingBuffer)
 */
export function captureCanvas(gl: CaptureRenderer): string | null {
  try {
    const url = gl.domElement.toDataURL("image/png");
    return url.startsWith("data:image/png") ? url : null;
  } catch {
    return null;
  }
}

/** Trigger a browser download of an image data URL (the photo-mode "save" action). */
export function downloadImage(dataUrl: string, filename = "screenshot.png"): void {
  if (typeof document === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

/**
 * In-`<Canvas>` binder that hands the scene-capture function out to HUD code
 * living outside the reconciler (a photo-mode Capture button, a save slot's
 * thumbnail). Mount it inside the game's `WorldOverlay`; the reader is
 * registered for `requestSceneCapture`/`requestSceneThumbnail`, which wait for
 * this mount and the first painted frame. `bind` is for code that wants the
 * function directly and can be left out when a game only requests captures.
 * Renders nothing.
 *
 * @capability scene-capture-binding expose the in-Canvas scene-capture function to outside-Canvas HUD (photo mode, save thumbnails)
 */
export function SceneCaptureBinding({ bind }: { bind?: (capture: () => string | null) => void }): null {
  const gl = useThree((state) => state.gl as unknown as THREE.WebGLRenderer & CaptureRenderer);
  useEffect(() => {
    const capture = (): string | null => captureCanvas(gl);
    const unbind = registerSceneCapture(capture);
    bind?.(capture);
    return () => {
      unbind();
      bind?.(() => null);
    };
  }, [gl, bind]);
  return null;
}
