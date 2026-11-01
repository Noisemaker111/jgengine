import { addAfterEffect, useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { registerSceneCapture } from "./sceneCaptureRequest.draw";

export {
  registerSceneCapture,
  requestSceneCapture,
  requestSceneThumbnail,
} from "./sceneCaptureRequest.draw";
export type {
  SceneCapture,
  SceneCaptureFailure,
  SceneCaptureRequestOptions,
  SceneCaptureResult,
  SceneThumbnailResult,
} from "./sceneCaptureRequest.draw";

/** The bit of a WebGL renderer scene capture needs — its backing `<canvas>`. */
export interface CaptureRenderer {
  domElement: { toDataURL(type?: string): string };
}

/**
 * Read the canvas to a PNG data URL. The game canvas keeps no copy of its last frame, so read in the
 * task that rendered it (an R3F after-effect, as {@link SceneCaptureBinding} does) or right after a
 * `gl.render` call; read any later and the frame is already gone. Returns null when the canvas can't
 * be read.
 *
 * @capability capture-canvas read the frame an R3F canvas just rendered to a PNG data URL
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

/** How long a capture waits for the next frame before reporting none (a covered canvas draws none). */
const FRAME_WAIT_MS = 1000;

/**
 * Read the frame the canvas renders next, in the same task, so the canvas needs no preserved drawing
 * buffer. Resolves null when no frame renders within a second.
 * @internal
 */
export function captureNextFrame(gl: CaptureRenderer): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (image: string | null): void => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(image);
    };
    const unsubscribe = addAfterEffect(() => finish(captureCanvas(gl)));
    const timer = setTimeout(() => finish(null), FRAME_WAIT_MS);
  });
}

/**
 * In-`<Canvas>` binder that registers the live scene for `requestSceneCapture` and
 * `requestSceneThumbnail` (a photo-mode Capture button, a save slot's thumbnail), which wait for this
 * mount and the first painted frame. Mount it inside the game's `WorldOverlay`. Renders nothing.
 *
 * @capability scene-capture-binding expose the live scene to outside-Canvas HUD (photo mode, save thumbnails)
 */
export function SceneCaptureBinding(): null {
  const gl = useThree((state) => state.gl);
  useEffect(() => registerSceneCapture(() => captureNextFrame(gl)), [gl]);
  return null;
}
