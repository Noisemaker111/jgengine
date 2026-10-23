import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { useCanvasCovered } from "@jgengine/react/canvasCover";

/** The frameloop the shell asked for; the cover only ever overrides it with `"never"`. */
export type CanvasFrameloop = "always" | "demand" | "never";

/**
 * Stops R3F's loop while a surface covers the canvas: the world, its shadow passes and postfx
 * stop drawing, and the last drawn frame stays on the canvas under the surface. Input, audio and
 * the DOM HUD live outside the loop and keep running. Lifting the cover restores the loop, which
 * draws the untouched scene again.
 * @internal
 */
export function CanvasCoverFrameloop({ authored }: { authored: CanvasFrameloop }): null {
  const covered = useCanvasCovered();
  const frameloop = useThree((state) => state.frameloop);
  const setFrameloop = useThree((state) => state.setFrameloop);
  useEffect(() => {
    const wanted: CanvasFrameloop = covered ? "never" : authored;
    if (frameloop === wanted) return;
    setFrameloop(wanted);
  }, [covered, authored, frameloop, setFrameloop]);
  return null;
}
