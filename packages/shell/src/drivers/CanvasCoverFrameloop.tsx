import { useEffect, useRef } from "@jgengine/core/ui/jsx";

import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { useCanvasCovered } from "@jgengine/core/ui/canvasCover.view";

import { prepareSceneView } from "@jgengine/core/render/shaderWarmup.draw";

/** The frameloop the shell asked for; the cover only ever overrides it with `"never"`. */
type CanvasFrameloop = "always" | "demand" | "never";

/**
 * Stops the render loop while a surface covers the canvas: the world, its shadow passes and postfx
 * stop drawing, and the last drawn frame stays on the canvas under the surface. Input, audio and
 * the DOM HUD live outside the loop and keep running. Lifting the cover compiles what the scene
 * gained meanwhile (the view a Play button mounts) before the loop draws again, so the first
 * frame after the press has nothing left to link on the main thread.
 * @internal
 */
export function CanvasCoverFrameloop({ authored }: { authored: CanvasFrameloop }): null {
  const covered = useCanvasCovered();
  const host = useEngineHost();
  const frameloop = host.frame.frameloop;
  const scene = host.frame.scene;
  const stopped = useRef(false);
  useEffect(() => {
    const wanted: CanvasFrameloop = covered ? "never" : authored;
    if (frameloop === wanted) return;
    if (covered || !stopped.current) {
      stopped.current = covered;
      host.setFrameloop?.(wanted);
      return;
    }
    let live = true;
    void prepareSceneView(scene).then(() => {
      if (!live) return;
      stopped.current = false;
      host.setFrameloop?.(wanted);
    });
    return () => {
      live = false;
    };
  }, [covered, authored, frameloop, host, scene]);
  return null;
}
