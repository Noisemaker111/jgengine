import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import { useCanvasCovered } from "@jgengine/core/ui/canvasCover.view";

import { prepareSceneView } from "../render/shaderWarmup";

/** The frameloop the shell asked for; the cover only ever overrides it with `"never"`. */
type CanvasFrameloop = "always" | "demand" | "never";

/**
 * Stops R3F's loop while a surface covers the canvas: the world, its shadow passes and postfx
 * stop drawing, and the last drawn frame stays on the canvas under the surface. Input, audio and
 * the DOM HUD live outside the loop and keep running. Lifting the cover compiles what the scene
 * gained meanwhile (the view a Play button mounts) before the loop draws again, so the first
 * frame after the press has nothing left to link on the main thread.
 * @internal
 */
export function CanvasCoverFrameloop({ authored }: { authored: CanvasFrameloop }): null {
  const covered = useCanvasCovered();
  const frameloop = useThree((state) => state.frameloop);
  const setFrameloop = useThree((state) => state.setFrameloop);
  const scene = useThree((state) => state.scene);
  const stopped = useRef(false);
  useEffect(() => {
    const wanted: CanvasFrameloop = covered ? "never" : authored;
    if (frameloop === wanted) return;
    if (covered || !stopped.current) {
      stopped.current = covered;
      setFrameloop(wanted);
      return;
    }
    let live = true;
    void prepareSceneView(scene).then(() => {
      if (!live) return;
      stopped.current = false;
      setFrameloop(wanted);
    });
    return () => {
      live = false;
    };
  }, [covered, authored, frameloop, setFrameloop, scene]);
  return null;
}
