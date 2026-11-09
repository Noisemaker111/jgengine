import { useLayoutEffect, useRef } from "react";

import { joinFrameTask } from "@jgengine/core/frame/frameBoard.draw";
import type { EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

/**
 * `useFrame` that joins the frame loop only while `active`. For per-model work that most models
 * never have (a rig to pose, clips to play, paint to sync): every subscriber costs a call each
 * frame, so a scene of thousands of static props subscribing four no-op hooks each spent seconds
 * mounting and kept paying per frame.
 * @internal
 */
export function useFrameWhile(
  active: boolean,
  callback: (state: EngineFrameState, delta: number) => void,
  priority = 0,
): void {
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  });
  useLayoutEffect(
    () => (active ? joinFrameTask(priority, (state, delta) => ref.current(state, delta)) : undefined),
    [active, priority],
  );
}
