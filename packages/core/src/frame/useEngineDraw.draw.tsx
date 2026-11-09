import { useThree } from "@react-three/fiber";
import { useEffect, type DependencyList } from "react";

import { frameStateFromR3F } from "./r3fFrameState.draw";
import { joinFrameTask } from "./frameBoard.draw";
import type { EngineDraw } from "./engineLoop.draw";

/**
 * Mount an {@link EngineDraw} inside the Canvas while r3f still owns
 * rendering: `create` runs once per `deps` change, `mount` gets a facade over
 * the live RootState, `frame` joins the shared board at the draw's priority,
 * and `dispose` runs on unmount or before a recreate. This is the call-site
 * bridge that lets draw files become plain factories with no React; parents
 * keep their JSX until they convert too.
 * @internal
 */
export function useEngineDraw(create: () => EngineDraw, deps: DependencyList): void {
  const root = useThree();
  useEffect(() => {
    const draw = create();
    const state = frameStateFromR3F(root, 0);
    draw.mount?.(state);
    const leave = draw.frame === undefined
      ? () => {}
      : joinFrameTask(draw.priority ?? 0, (frameState) => draw.frame?.(frameState));
    return () => {
      leave();
      draw.dispose?.(state);
    };
    // `create` and `root` are intentionally excluded: callers pass fresh
    // closures through `deps`, and the RootState reference is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
