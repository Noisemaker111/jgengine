import { addAfterEffect, useThree } from "@react-three/fiber";
import { useEffect, useSyncExternalStore } from "react";
import { useGameContext, useOptionalGameContext } from "@jgengine/react/provider";
import { captureCanvas, sceneCaptureFor, type SceneCapture, type SceneCaptureState } from "./sceneCaptureRuntime";
export * from "./sceneCaptureRuntime";
/**
 * Observe and capture the renderer attached to the current GameProvider.
 * @capability use-scene-capture observe renderer readiness and take photographs from a game HUD
 */
export function useSceneCapture(): SceneCaptureState & Pick<SceneCapture, "photoMode" | "capture"> {
  const capture = sceneCaptureFor(useGameContext());
  const state = useSyncExternalStore(capture.subscribe, capture.get, capture.get);
  return { ...state, photoMode: capture.photoMode, capture: capture.capture };
}

/**
 * In-`<Canvas>` binder that hands the scene-capture function out to HUD code
 * living outside the reconciler (a photo-mode Capture button). Mount it inside
 * the game's `WorldOverlay` and use `useSceneCapture` in its HUD. Optional `bind`
 * preserves direct current-frame access for existing consumers. Renders nothing.
 *
 * @capability scene-capture-binding expose the in-Canvas scene-capture function to outside-Canvas HUD (photo mode)
 */
export function SceneCaptureBinding({ bind }: { bind?: (capture: () => string | null) => void } = {}): null {
  const get = useThree((state) => state.get);
  const ctx = useOptionalGameContext();
  const capture = ctx === null ? null : sceneCaptureFor(ctx);
  useEffect(() => {
    let mounted = true;
    const read = (): string | null => {
      if (!mounted) return null;
      try {
        const { gl } = get();
        if (gl.getContext().isContextLost()) return null;
        return captureCanvas(gl);
      } catch {
        return null;
      }
    };
    const schedule = (take: () => void) => {
      const { gl, invalidate } = get();
      const frame = gl.info.render.frame;
      const detach = addAfterEffect(() => {
        if (!mounted || get().gl !== gl || gl.info.render.frame <= frame) return;
        detach();
        take();
      });
      invalidate();
      return detach;
    };
    const unbind = capture?.bind(read, schedule);
    bind?.(read);
    return () => {
      mounted = false;
      unbind?.();
      bind?.(() => null);
    };
  }, [get, capture, bind]);
  return null;
}
